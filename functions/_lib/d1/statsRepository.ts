// 统计结果仓储层（纯 SQL 预计算）
// 分层约定：只做 SQL 与数据映射，HTTP 协议由 functions/api/stats.ts 负责。
//
// 设计原则：
//   1. 读取只做 `SELECT * WHERE dataset_id = ?`，不做任何聚合；
//   2. 统计在 recomputeStats 里用 SQL 一次算完，写入结果表；
//   3. 结果表带 source_version（生成时的 record_meta.version），用于判断“数据已更新”；
//   4. 统计写入不自增版本，只用 `(SELECT version ...) = ?` 守卫，避免刷新统计影响记录端 CAS。
//
// 结果表：
//   stat_overview    每数据集一行（总览宽表）
//   stat_month       一行一个月份（月度宽表）
//   analysis_results 一行一个配置（默认维度 / 首页页签 / 压测系列）
//   cycle_stats      一行一个周期（每 30 条记录一批）
//   cycle_records    周期 ↔ 记录的归属关系
import { dayExpr, monthExpr } from './pagination';

const CYCLE_SIZE = 30;
/** 单个 batch 的语句上限：周期统计按统计类型成对写入，配置多时必须分片 */
const STATS_BATCH_SIZE = 50;

/** 固定的 4 个系统维度（不受字段配置影响） */
const FIXED_STAT_TYPES = ['系统', '系统无失误', '系统有失误', '非系统'];

function sqlStr(value: unknown): string {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

/** JSON 路径字面量：$.scope."id"（id 做 JSON 转义后再做 SQL 单引号转义） */
function jsonPath(scope: string, id: string): string {
  const key = JSON.stringify(String(id)).replace(/'/g, "''");
  return `'$.${scope}.${key}'`;
}

/**
 * 取 payload 的表达式：非法 JSON / 空串统一视为 `{}`。
 * 否则一条历史脏数据会让 json_each / json_extract 抛 "malformed JSON"，整份统计直接失败。
 */
function payloadOf(alias: string): string {
  return `(CASE WHEN json_valid(${alias}.payload) THEN ${alias}.payload ELSE '{}' END)`;
}

/** 读取 JSON 数值：缺失/显式 null/历史哨兵 ±999/字符串 NULL → NULL */
function numOrNull(alias: string, path: string): string {
  const v = `CAST(json_extract(${payloadOf(alias)}, ${path}) AS REAL)`;
  return `(CASE
    WHEN json_type(${payloadOf(alias)}, ${path}) IS NULL THEN NULL
    WHEN json_type(${payloadOf(alias)}, ${path}) = 'null' THEN NULL
    WHEN json_type(${payloadOf(alias)}, ${path}) = 'text'
      THEN (CASE WHEN UPPER(json_extract(${payloadOf(alias)}, ${path})) IN ('NULL', 'N/A', '') THEN NULL ELSE ${v} END)
    WHEN ${v} IN (999, -999) THEN NULL
    ELSE ${v}
  END)`;
}

/** 基准维度取值：显式 NULL → NULL；未填写 → 回退到盈亏情况 */
function baseDimValue(alias: string, id: string): string {
  const p = jsonPath('theoreticalProfitRatios', id);
  return `(CASE WHEN json_type(${alias}.payload, ${p}) IS NULL THEN ${alias}.profit_percent ELSE ${numOrNull(alias, p)} END)`;
}

/** 维度最终取值：基准维度直接取；关联维度 = 基准值 + 变化率 */
function dimValue(alias: string, dim: any, dims: any[]): string {
  const linked = dim?.isBase === false && !!dim?.baseDimensionId;
  const base = linked ? dims.find(d => d?.id === dim.baseDimensionId && d?.isBase !== false) : undefined;
  if (!linked || !base) return baseDimValue(alias, dim?.id ?? '');

  const baseExpr = baseDimValue(alias, base.id);
  const dp = jsonPath('theoreticalProfitDeltas', dim.id);
  const rp = jsonPath('theoreticalProfitRatios', dim.id);
  const dv = numOrNull(alias, dp);
  const rv = numOrNull(alias, rp);

  return `(CASE
    WHEN ${baseExpr} IS NULL THEN NULL
    WHEN json_type(${alias}.payload, ${dp}) IS NOT NULL AND ${dv} IS NULL THEN NULL
    WHEN json_type(${alias}.payload, ${dp}) IS NOT NULL THEN ROUND(${baseExpr} + ${dv}, 2)
    WHEN json_type(${alias}.payload, ${rp}) IS NOT NULL AND ${rv} IS NULL THEN NULL
    WHEN json_type(${alias}.payload, ${rp}) IS NOT NULL THEN ${rv}
    ELSE ROUND(${baseExpr}, 2)
  END)`;
}

/** 信源取值表达式：profitPercent 或 dim:<维度id> */
function sourceSql(alias: string, source: string, dims: any[]): string {
  if (!source || source === 'profitPercent') return `${alias}.profit_percent`;
  const id = source.startsWith('dim:') ? source.slice(4) : source;
  const dim = dims.find(d => d?.id === id);
  return dim ? dimValue(alias, dim, dims) : baseDimValue(alias, id);
}

// ─── 盈亏比公式（与 src/utils/calculations.ts、analysisTabService.ts 保持一致）──
const pSum = (v: string) => `COALESCE(SUM(CASE WHEN ${v} > 0 THEN ${v} ELSE 0 END), 0)`;
const lSum = (v: string) => `COALESCE(SUM(CASE WHEN ${v} < 0 THEN -${v} ELSE 0 END), 0)`;
const pSumIf = (v: string, pred: string) =>
  `COALESCE(SUM(CASE WHEN ${pred} THEN (CASE WHEN ${v} > 0 THEN ${v} ELSE 0 END) ELSE 0 END), 0)`;
const lSumIf = (v: string, pred: string) =>
  `COALESCE(SUM(CASE WHEN ${pred} THEN (CASE WHEN ${v} < 0 THEN -${v} ELSE 0 END) ELSE 0 END), 0)`;

/** v3：总览/月度/理论维度/曲线使用（'N/A' 用 NULL 表示） */
function ratioV3(p: string, l: string): string {
  return `(CASE
    WHEN (${p}) = 0 AND (${l}) = 0 THEN NULL
    WHEN (${l}) = 0 THEN ROUND((${p}), 2)
    WHEN (${p}) = 0 THEN -ROUND((${l}), 2)
    WHEN (${p}) > (${l}) THEN ROUND((${p}) / (${l}), 2)
    WHEN (${p}) < (${l}) THEN -ROUND((${l}) / (${p}), 2)
    ELSE 1.0
  END)`;
}

/** v2：交易类型 / 趋势 / 聚合规则使用（无数据返回 0） */
function ratioV2(p: string, l: string): string {
  return `(CASE
    WHEN (${p}) = 0 AND (${l}) = 0 THEN 0
    WHEN (${l}) = 0 THEN ROUND((${p}), 2)
    WHEN (${p}) = 0 THEN -ROUND((${l}), 2)
    WHEN (${p}) > (${l}) THEN ROUND((${p}) / (${l}), 2)
    ELSE -ROUND((${l}) / (${p}), 2)
  END)`;
}

const BASE_CTE = `base AS (
  SELECT r.id           AS id,
         r.open_date    AS open_date,
         r.trading_type AS trading_type,
         r.has_mistake  AS has_mistake,
         r.profit_percent AS profit_percent,
         r.hold_days    AS hold_days,
         r.position_size AS position_size,
         r.payload      AS payload,
         EXISTS (SELECT 1 FROM json_each(${payloadOf('r')}, '$.patternFeatures') jp WHERE jp.value = '系统') AS is_system,
         EXISTS (SELECT 1 FROM json_each(${payloadOf('r')}, '$.patternFeatures') jp WHERE jp.value = '非系统') AS is_non_system
    FROM records r
   WHERE r.dataset_id = ?1
)`;

const RESULT_COLUMNS =
  'dataset_id, config_kind, config_id, record_count, values_json, positions_json, cumulative, cycle, growth, skewness, kurtosis, jb, jb_p_value, source_version, computed_at';
const RESULT_UPDATE = `record_count = excluded.record_count,
  values_json = excluded.values_json,
  positions_json = excluded.positions_json,
  cumulative = excluded.cumulative,
  cycle = excluded.cycle,
  growth = excluded.growth,
  skewness = excluded.skewness,
  kurtosis = excluded.kurtosis,
  jb = excluded.jb,
  jb_p_value = excluded.jb_p_value,
  source_version = excluded.source_version,
  computed_at = excluded.computed_at`;

// ─── 总览 ─────────────────────────────────────────────────────────
function buildOverviewStatement(): string {
  const core = (pred: string) =>
    `(SELECT ${ratioV3(pSum('b.profit_percent'), lSum('b.profit_percent'))} FROM base b WHERE ${pred})`;
  const hold = (pred: string) =>
    `(SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE ROUND(AVG(b.hold_days), 2) END FROM base b WHERE ${pred})`;

  const tradingTypeRatios = `(SELECT COALESCE(json_group_object(k, r), '{}') FROM (
      SELECT b.trading_type AS k, ${ratioV2(pSum('b.profit_percent'), lSum('b.profit_percent'))} AS r
        FROM base b
       WHERE b.trading_type NOT IN ('', '未知')
       GROUP BY b.trading_type
    ))`;

  const trendFeatureRatios = `(SELECT COALESCE(json_group_object(k, r), '{}') FROM (
      SELECT jt.value AS k, ${ratioV2(pSum('b.profit_percent'), lSum('b.profit_percent'))} AS r
        FROM base b, json_each(${payloadOf('b')}, '$.trendFeatures') jt
       WHERE jt.value NOT IN ('', '未知')
       GROUP BY jt.value
    ))`;

  return `WITH ${BASE_CTE}
INSERT INTO stat_overview (
  dataset_id, record_count, profit_count, loss_count, flat_count,
  system_profit_ratio, system_no_mistake_profit_ratio, system_with_mistake_profit_ratio, non_system_profit_ratio,
  system_profit_avg_hold_days, system_loss_avg_hold_days, non_system_profit_avg_hold_days, non_system_loss_avg_hold_days,
  trading_type_ratios, trend_feature_ratios, aggregate_ratios, theoretical_profit_ratios,
  source_version, computed_at
)
SELECT ?1,
  (SELECT COUNT(*) FROM base),
  (SELECT COUNT(*) FROM base WHERE profit_percent > 0),
  (SELECT COUNT(*) FROM base WHERE profit_percent < 0),
  (SELECT COUNT(*) FROM base WHERE profit_percent = 0),
  ${core('b.is_system = 1')},
  ${core("b.is_system = 1 AND b.has_mistake = '否'")},
  ${core("b.is_system = 1 AND b.has_mistake = '是'")},
  ${core('b.is_non_system = 1')},
  ${hold("b.is_system = 1 AND b.profit_percent > 0")},
  ${hold("b.is_system = 1 AND b.profit_percent < 0")},
  ${hold("b.is_non_system = 1 AND b.profit_percent > 0")},
  ${hold("b.is_non_system = 1 AND b.profit_percent < 0")},
  ${tradingTypeRatios},
  ${trendFeatureRatios},
  {{AGGREGATE_RATIOS}},
  {{THEORETICAL_RATIOS}},
  ?2, ?3
FROM (SELECT 1)
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2
ON CONFLICT(dataset_id) DO UPDATE SET
  record_count = excluded.record_count,
  profit_count = excluded.profit_count,
  loss_count = excluded.loss_count,
  flat_count = excluded.flat_count,
  system_profit_ratio = excluded.system_profit_ratio,
  system_no_mistake_profit_ratio = excluded.system_no_mistake_profit_ratio,
  system_with_mistake_profit_ratio = excluded.system_with_mistake_profit_ratio,
  non_system_profit_ratio = excluded.non_system_profit_ratio,
  system_profit_avg_hold_days = excluded.system_profit_avg_hold_days,
  system_loss_avg_hold_days = excluded.system_loss_avg_hold_days,
  non_system_profit_avg_hold_days = excluded.non_system_profit_avg_hold_days,
  non_system_loss_avg_hold_days = excluded.non_system_loss_avg_hold_days,
  trading_type_ratios = excluded.trading_type_ratios,
  trend_feature_ratios = excluded.trend_feature_ratios,
  aggregate_ratios = excluded.aggregate_ratios,
  theoretical_profit_ratios = excluded.theoretical_profit_ratios,
  source_version = excluded.source_version,
  computed_at = excluded.computed_at`;
}

function buildAggregateRatios(config: any): string {
  const rules = Array.isArray(config?.aggregateRules) ? config.aggregateRules : [];
  const branches = rules
    .filter((rule: any) => rule && typeof rule.name === 'string')
    .map((rule: any) => {
      const types = (Array.isArray(rule.includedTypes) ? rule.includedTypes : []).map((t: any) => sqlStr(t));
      const where = types.length > 0 ? `b.trading_type IN (${types.join(', ')})` : '0';
      return `SELECT ${sqlStr(rule.name)} AS k, ${ratioV2(pSum('b.profit_percent'), lSum('b.profit_percent'))} AS r
                FROM base b WHERE ${where}`;
    });
  if (branches.length === 0) return "'{}'";
  return `(SELECT COALESCE(json_group_object(k, r), '{}') FROM (${branches.join(' UNION ALL ')}))`;
}

function buildTheoreticalRatios(dims: any[]): string {
  const branches = dims
    .filter(d => d && typeof d.id === 'string')
    .map(dim => {
      const value = dimValue('b', dim, dims);
      return `SELECT ${sqlStr(dim.id)} AS k, ${ratioV3(pSum('v'), lSum('v'))} AS r
                FROM (SELECT ${value} AS v FROM base b WHERE b.is_system = 1) t
               WHERE t.v IS NOT NULL`;
    });
  if (branches.length === 0) return "'{}'";
  return `(SELECT COALESCE(json_group_object(k, r), '{}') FROM (${branches.join(' UNION ALL ')}))`;
}

// ─── 月度 ─────────────────────────────────────────────────────────
function buildMonthStatement(): string {
  return `WITH ${BASE_CTE}
INSERT INTO stat_month (
  dataset_id, month, system_profit_ratio, system_no_mistake_profit_ratio,
  system_with_mistake_profit_ratio, non_system_profit_ratio, avg_profit_ratio, total_profit,
  source_version, computed_at
)
SELECT ?1, t.month, t.a, t.b, t.c, t.d, t.e, t.f, ?2, ?3
FROM (
  SELECT ${monthExpr('b.open_date')} AS month,
    ${ratioV3(pSumIf('b.profit_percent', 'b.is_system = 1'), lSumIf('b.profit_percent', 'b.is_system = 1'))} AS a,
    ${ratioV3(pSumIf('b.profit_percent', "b.is_system = 1 AND b.has_mistake = '否'"), lSumIf('b.profit_percent', "b.is_system = 1 AND b.has_mistake = '否'"))} AS b,
    ${ratioV3(pSumIf('b.profit_percent', "b.is_system = 1 AND b.has_mistake = '是'"), lSumIf('b.profit_percent', "b.is_system = 1 AND b.has_mistake = '是'"))} AS c,
    ${ratioV3(pSumIf('b.profit_percent', 'b.is_non_system = 1'), lSumIf('b.profit_percent', 'b.is_non_system = 1'))} AS d,
    ${ratioV3(pSum('b.profit_percent'), lSum('b.profit_percent'))} AS e,
    ROUND(SUM(b.profit_percent), 2) AS f
  FROM base b
  GROUP BY month
) t
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2
ON CONFLICT(dataset_id, month) DO UPDATE SET
  system_profit_ratio = excluded.system_profit_ratio,
  system_no_mistake_profit_ratio = excluded.system_no_mistake_profit_ratio,
  system_with_mistake_profit_ratio = excluded.system_with_mistake_profit_ratio,
  non_system_profit_ratio = excluded.non_system_profit_ratio,
  avg_profit_ratio = excluded.avg_profit_ratio,
  total_profit = excluded.total_profit,
  source_version = excluded.source_version,
  computed_at = excluded.computed_at`;
}

// ─── 曲线结果（默认维度 / 页签）────────────────────────────────
// D1 禁用了 power/sqrt/exp 等数学函数，压测的偏度/峰度/JB 放到 Worker 里算。
const CUMULATIVE_SQL = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
    SELECT ROUND(SUM(v) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING), 2) AS val
      FROM s
     ORDER BY open_date, id
  ))`;
const CYCLE_SQL = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
    SELECT ${ratioV3(pSum('v'), lSum('v'))} AS val
      FROM (
        SELECT CAST((ROW_NUMBER() OVER (ORDER BY open_date, id) - 1) / ${CYCLE_SIZE} AS INTEGER) AS period, v
          FROM s
      )
     GROUP BY period
     ORDER BY period
  ))`;
const GROWTH_SQL = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
    SELECT ${ratioV3('p', 'l')} AS val
      FROM (
        SELECT SUM(CASE WHEN v > 0 THEN v ELSE 0 END) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING) AS p,
               SUM(CASE WHEN v < 0 THEN -v ELSE 0 END) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING) AS l
          FROM s
         ORDER BY open_date, id
      )
  ))`;
const VALUES_SQL = `(SELECT COALESCE(json_group_array(v), '[]') FROM (SELECT v FROM s ORDER BY open_date, id))`;
const POSITIONS_SQL = `(SELECT COALESCE(json_group_array(position_size), '[]') FROM (SELECT position_size FROM s ORDER BY open_date, id))`;

function buildSeriesStatement(kind: 'dimension' | 'tab', id: string, ctes: string): string {
  return `WITH ${BASE_CTE},
${ctes}
INSERT INTO analysis_results (${RESULT_COLUMNS})
SELECT ?1, ${sqlStr(kind)}, ${sqlStr(id)},
  (SELECT COUNT(*) FROM s),
  ${VALUES_SQL},
  '[]',
  ${CUMULATIVE_SQL},
  ${CYCLE_SQL},
  ${GROWTH_SQL},
  NULL, NULL, NULL, NULL,
  ?2, ?3
FROM (SELECT 1)
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2
ON CONFLICT(dataset_id, config_kind, config_id) DO UPDATE SET ${RESULT_UPDATE}`;
}

/** 压测系列：SQL 只算序列，偏度/峰度/JB 由 Worker 计算 */
function buildSeriesSelect(ctes: string): string {
  return `WITH ${BASE_CTE},
${ctes}
SELECT (SELECT COUNT(*) FROM s) AS record_count,
  ${VALUES_SQL} AS values_json,
  ${POSITIONS_SQL} AS positions_json,
  ${CUMULATIVE_SQL} AS cumulative,
  ${CYCLE_SQL} AS cycle,
  ${GROWTH_SQL} AS growth`;
}

function buildStressInsert(): string {
  return `INSERT INTO analysis_results (${RESULT_COLUMNS})
SELECT ?1, 'stress', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
FROM (SELECT 1)
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?13
ON CONFLICT(dataset_id, config_kind, config_id) DO UPDATE SET ${RESULT_UPDATE}`;
}

function computeStressStats(values: number[]) {
  const n = values.length;
  if (n === 0) return { skewness: 0, kurtosis: 0, jb: 0, jbPValue: 1 };

  let sum = 0;
  for (const v of values) sum += v;
  const mu = sum / n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - mu;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;

  const skewness = n < 3 || m2 === 0
    ? 0
    : (Math.sqrt(n * (n - 1)) / (n - 2)) * (m3 / Math.pow(m2, 1.5));
  const kurtosis = n < 4 || m2 === 0
    ? 0
    : ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * (m4 / (m2 * m2) - 3) + 6);
  const jb = n < 3 ? 0 : (n / 6) * (skewness * skewness + kurtosis * kurtosis / 4);
  const jbPValue = n < 3 ? 1 : Math.exp(-jb / 2);
  return { skewness, kurtosis, jb, jbPValue };
}

function buildDimensionCtes(predicate: string): string {
  return `s AS (
  SELECT b.id AS id, b.open_date AS open_date, b.profit_percent AS v, b.position_size AS position_size
    FROM base b
   WHERE ${predicate}
)`;
}

function filterSql(alias: string, filter: any): string {
  const parts: string[] = ['1=1'];
  const f = filter ?? {};
  if (typeof f.startDate === 'string' && f.startDate) {
    parts.push(`${monthExpr(`${alias}.open_date`)} >= ${sqlStr(f.startDate)}`);
  }
  if (typeof f.endDate === 'string' && f.endDate) {
    parts.push(`${monthExpr(`${alias}.open_date`)} <= ${sqlStr(f.endDate)}`);
  }
  if (Array.isArray(f.tradingTypes) && f.tradingTypes.length > 0) {
    parts.push(`${alias}.trading_type IN (${f.tradingTypes.map((t: any) => sqlStr(t)).join(', ')})`);
  }
  if (Array.isArray(f.trendFeatures) && f.trendFeatures.length > 0) {
    parts.push(`EXISTS (SELECT 1 FROM json_each(${payloadOf(alias)}, '$.trendFeatures') jt WHERE jt.value IN (${f.trendFeatures.map((t: any) => sqlStr(t)).join(', ')}))`);
  }
  if (Array.isArray(f.patternFeatures) && f.patternFeatures.length > 0) {
    parts.push(`EXISTS (SELECT 1 FROM json_each(${payloadOf(alias)}, '$.patternFeatures') jp WHERE jp.value IN (${f.patternFeatures.map((t: any) => sqlStr(t)).join(', ')}))`);
  }
  if (Array.isArray(f.hasMistake) && f.hasMistake.length > 0) {
    parts.push(`${alias}.has_mistake IN (${f.hasMistake.map((t: any) => sqlStr(t)).join(', ')})`);
  }
  return parts.join(' AND ');
}

function buildSeriesCtes(groups: any[], dims: any[]): string {
  const merge = groups.filter(g => g.mode !== 'exclude');
  const exclude = groups.filter(g => g.mode === 'exclude');

  const branches = merge.map((g, index) => {
    const value = sourceSql('b', g.source, dims);
    return `SELECT ${index} AS pri, b.id AS id, b.open_date AS open_date, ${value} AS v, b.position_size AS position_size
              FROM base b
             WHERE (${filterSql('b', g.filter)}) AND (${value}) IS NOT NULL`;
  });

  const allg = branches.length > 0
    ? branches.join(' UNION ALL ')
    : `SELECT 0 AS pri, b.id AS id, b.open_date AS open_date, b.profit_percent AS v, b.position_size AS position_size
         FROM base b WHERE 0`;

  const ex = exclude.length > 0
    ? `ex AS (${exclude.map(g => `SELECT b.id AS id FROM base b WHERE (${filterSql('b', g.filter)})`).join(' UNION ')})`
    : `ex AS (SELECT NULL AS id WHERE 0)`;

  return `allg AS (${allg}),
dedup AS (
  SELECT id, open_date, v, position_size
    FROM (SELECT id, open_date, v, position_size, ROW_NUMBER() OVER (PARTITION BY id ORDER BY pri) AS rn FROM allg)
   WHERE rn = 1
),
${ex},
s AS (SELECT id, open_date, v, position_size FROM dedup WHERE id NOT IN (SELECT id FROM ex))`;
}

// ─── 配置推导 ─────────────────────────────────────────────────────
function defaultDimensions(config: any): { key: string; predicate: string }[] {
  const list = [
    { key: '总', predicate: '1=1' },
    { key: '系统', predicate: 'b.is_system = 1' },
    { key: '非系统', predicate: 'b.is_non_system = 1' },
  ];
  const seen = new Set(list.map(item => item.key));
  const types = Array.isArray(config?.tradingTypes) ? config.tradingTypes : [];
  for (const type of types) {
    if (!type || type === '未知' || seen.has(type)) continue;
    seen.add(type);
    list.push({ key: type, predicate: `b.trading_type = ${sqlStr(type)}` });
  }
  return list;
}

// ─── 周期统计（每 30 条一个周期）──────────────────────────────────
// 与旧前端实现（cycleStatsService）语义一致：
//   1. 每个统计类型先按开单日（归一化后的 8 位日期）排序，每 30 条切一个周期；
//   2. 不足 30 条的尾批标记为「未完成」；
//   3. cycleId = 「cyc_ + 批次序号」，同一份数据重复生成结果稳定。
// 注意：批次序号是“排序后的第 N 批”，往历史中间增删记录会让后续批次整体前移，
//       因此「周期 N 包含哪些记录」必须以 cycle_records 为准（getStats 可按需回填）。
// 记录与周期的归属关系写入 cycle_records，不再回写 records 的派生列。

/** 统计类型清单：4 个固定维度 + 交易类型 + 趋势特征 + 聚合规则（按配置顺序、去重） */
function listStatTypes(config: any): string[] {
  const types = [...FIXED_STAT_TYPES];
  const push = (value: any) => {
    if (typeof value !== 'string' || !value || value === '未知' || types.includes(value)) return;
    types.push(value);
  };
  for (const t of Array.isArray(config?.tradingTypes) ? config.tradingTypes : []) push(t);
  for (const f of Array.isArray(config?.trendFeatures) ? config.trendFeatures : []) push(f);
  for (const r of Array.isArray(config?.aggregateRules) ? config.aggregateRules : []) push(r?.name);
  return types;
}

/** 统计类型 → 匹配条件；判断顺序与旧实现一致（系统维度 → 交易类型 → 趋势特征 → 聚合规则） */
function statTypePredicate(statType: string, config: any): string | null {
  if (statType === '系统') return 'b.is_system = 1';
  if (statType === '系统无失误') return "b.is_system = 1 AND b.has_mistake = '否'";
  if (statType === '系统有失误') return "b.is_system = 1 AND b.has_mistake = '是'";
  if (statType === '非系统') return 'b.is_non_system = 1';

  const tradingTypes = Array.isArray(config?.tradingTypes) ? config.tradingTypes : [];
  if (tradingTypes.includes(statType)) return `b.trading_type = ${sqlStr(statType)}`;

  const trendFeatures = Array.isArray(config?.trendFeatures) ? config.trendFeatures : [];
  if (trendFeatures.includes(statType)) {
    return `EXISTS (SELECT 1 FROM json_each(${payloadOf('b')}, '$.trendFeatures') jt WHERE jt.value = ${sqlStr(statType)})`;
  }

  const rule = (Array.isArray(config?.aggregateRules) ? config.aggregateRules : [])
    .find((r: any) => r?.name === statType);
  if (rule) {
    const included = (Array.isArray(rule.includedTypes) ? rule.includedTypes : []).map((t: any) => sqlStr(t));
    return included.length > 0 ? `b.trading_type IN (${included.join(', ')})` : '0';
  }
  return null;
}

const cycleProfitSum = 'COALESCE(SUM(CASE WHEN profit_percent > 0 THEN profit_percent ELSE 0 END), 0)';
const cycleLossSum = 'COALESCE(SUM(CASE WHEN profit_percent < 0 THEN -profit_percent ELSE 0 END), 0)';

/** 周期批次 CTE：排序 → 按 30 条分批 → 组内序号（两处排序统一用归一化后的 day） */
function cycleCtes(predicate: string): string {
  return `${BASE_CTE},
elig AS (
  SELECT id, open_date, day, profit_percent,
         CAST((ROW_NUMBER() OVER (ORDER BY day, id) - 1) / ${CYCLE_SIZE} AS INTEGER) AS period
    FROM (
      SELECT b.id AS id, b.open_date AS open_date, b.profit_percent AS profit_percent,
             ${dayExpr('b.open_date')} AS day
        FROM base b
       WHERE ${predicate}
    )
),
ranked AS (
  SELECT id, open_date, day, profit_percent, period,
         ROW_NUMBER() OVER (PARTITION BY period ORDER BY day, id) AS rn,
         COUNT(*) OVER (PARTITION BY period) AS cnt
    FROM elig
)`;
}

function buildCycleStatInsert(statType: string, predicate: string): string {
  return `WITH ${cycleCtes(predicate)}
INSERT INTO cycle_stats (
  dataset_id, stat_type, cycle_id, start_date, end_date, record_count, is_complete,
  profit_sum, loss_sum, profit_ratio, record_ids, created_at, updated_at
)
SELECT ?1, ${sqlStr(statType)}, 'cyc_' || CAST(t.period + 1 AS TEXT),
  t.start_date, t.end_date, t.record_count, t.is_complete,
  t.profit_sum, t.loss_sum, t.profit_ratio, '[]', ?2, ?2
FROM (
  SELECT period,
    COALESCE(MAX(CASE WHEN rn = 1 THEN open_date END), '') AS start_date,
    COALESCE(MAX(CASE WHEN rn = cnt THEN open_date END), '') AS end_date,
    COUNT(*) AS record_count,
    CASE WHEN COUNT(*) >= ${CYCLE_SIZE} THEN 1 ELSE 0 END AS is_complete,
    ROUND(${cycleProfitSum}, 2) AS profit_sum,
    ROUND(${cycleLossSum}, 2) AS loss_sum,
    ${ratioV3(cycleProfitSum, cycleLossSum)} AS profit_ratio
  FROM ranked
  WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?3
  GROUP BY period
) t
-- 顶层必须保留 WHERE，SQLite 才把后面的 ON 识别为 upsert 而不是 join 条件
WHERE 1
ON CONFLICT(dataset_id, stat_type, cycle_id) DO UPDATE SET
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  record_count = excluded.record_count,
  is_complete = excluded.is_complete,
  profit_sum = excluded.profit_sum,
  loss_sum = excluded.loss_sum,
  profit_ratio = excluded.profit_ratio,
  updated_at = excluded.updated_at`;
}

function buildCycleRecordsInsert(statType: string, predicate: string): string {
  return `WITH ${cycleCtes(predicate)}
INSERT INTO cycle_records (dataset_id, stat_type, cycle_id, record_id, seq)
SELECT ?1, ${sqlStr(statType)}, 'cyc_' || CAST(period + 1 AS TEXT), id, rn
FROM ranked
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2
ON CONFLICT(dataset_id, stat_type, cycle_id, record_id) DO UPDATE SET seq = excluded.seq`;
}

// ─── 读取 ─────────────────────────────────────────────────────────
function parseJson(text: any, fallback: any): any {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function numOrNa(value: any): number | 'N/A' {
  return typeof value === 'number' && Number.isFinite(value) ? value : 'N/A';
}

function overviewFromRow(row: any): any {
  if (!row) return null;
  // 理论维度比值：SQL 用 NULL 表示 N/A，这里统一转成 'N/A' 供前端直接展示
  const theoreticalProfitRatios = parseJson(row.theoretical_profit_ratios, {});
  for (const key of Object.keys(theoreticalProfitRatios)) {
    if (theoreticalProfitRatios[key] === null) theoreticalProfitRatios[key] = 'N/A';
  }
  return {
    recordCount: Number(row.record_count ?? 0),
    profitCount: Number(row.profit_count ?? 0),
    lossCount: Number(row.loss_count ?? 0),
    flatCount: Number(row.flat_count ?? 0),
    systemProfitRatio: numOrNa(row.system_profit_ratio),
    systemNoMistakeProfitRatio: numOrNa(row.system_no_mistake_profit_ratio),
    systemWithMistakeProfitRatio: numOrNa(row.system_with_mistake_profit_ratio),
    nonSystemProfitRatio: numOrNa(row.non_system_profit_ratio),
    systemProfitAvgHoldDays: numOrNa(row.system_profit_avg_hold_days),
    systemLossAvgHoldDays: numOrNa(row.system_loss_avg_hold_days),
    nonSystemProfitAvgHoldDays: numOrNa(row.non_system_profit_avg_hold_days),
    nonSystemLossAvgHoldDays: numOrNa(row.non_system_loss_avg_hold_days),
    tradingTypeRatios: parseJson(row.trading_type_ratios, {}),
    trendFeatureRatios: parseJson(row.trend_feature_ratios, {}),
    aggregateRatios: parseJson(row.aggregate_ratios, {}),
    theoreticalProfitRatios,
    sourceVersion: Number(row.source_version ?? 0),
    computedAt: row.computed_at ?? '',
  };
}

function monthFromRow(row: any): any {
  return {
    month: row.month,
    systemProfitRatio: numOrNa(row.system_profit_ratio),
    systemNoMistakeProfitRatio: numOrNa(row.system_no_mistake_profit_ratio),
    systemWithMistakeProfitRatio: numOrNa(row.system_with_mistake_profit_ratio),
    nonSystemProfitRatio: numOrNa(row.non_system_profit_ratio),
    avgProfitRatio: numOrNa(row.avg_profit_ratio),
    totalProfit: numOrNa(row.total_profit),
  };
}

function resultFromRow(row: any): any {
  return {
    configKind: row.config_kind,
    configId: row.config_id,
    recordCount: Number(row.record_count ?? 0),
    values: parseJson(row.values_json, []),
    positions: parseJson(row.positions_json, []),
    cumulative: parseJson(row.cumulative, []),
    cycle: parseJson(row.cycle, []),
    growth: parseJson(row.growth, []),
    skewness: typeof row.skewness === 'number' ? row.skewness : null,
    kurtosis: typeof row.kurtosis === 'number' ? row.kurtosis : null,
    jb: typeof row.jb === 'number' ? row.jb : null,
    jbPValue: typeof row.jb_p_value === 'number' ? row.jb_p_value : null,
    sourceVersion: Number(row.source_version ?? 0),
    computedAt: row.computed_at ?? '',
  };
}

function cycleFromRow(row: any): any {
  return {
    cycleId: row.cycle_id,
    statType: row.stat_type,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    recordCount: Number(row.record_count ?? 0),
    isComplete: !!row.is_complete,
    profitSum: Number(row.profit_sum ?? 0),
    lossSum: Number(row.loss_sum ?? 0),
    profitRatio: typeof row.profit_ratio === 'number' ? row.profit_ratio : null,
    recordIds: [],
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export interface StatsQueryOptions {
  /** 是否回填每个周期包含的记录 id（来自 cycle_records）；默认不回传，避免响应膨胀 */
  withRecordIds?: boolean;
}

/**
 * 结果表是否落后于记录：结果行都带 source_version（生成时的 record_meta.version），
 * 与当前 version 不一致就说明记录在统计之后又被改过。
 * 空数据库（version = 0）不提示，避免新数据集一直亮着“需要更新”。
 */
function staleKindsOf(parts: {
  version: number;
  overviewRow: any;
  monthRows: any[];
  resultRows: any[];
  cycleRows: any[];
}): string[] {
  const { version, overviewRow, monthRows, resultRows, cycleRows } = parts;
  if (version <= 0) return [];

  const current = (row: any) => Number(row?.source_version ?? -1) === version;
  const stale: string[] = [];

  const overviewStale = !overviewRow || !current(overviewRow);
  if (overviewStale) stale.push('overview');

  // 记录全部删除后月度表本来就该为空，不能因此一直提示“需要更新”
  const hasRecords = Number(overviewRow?.record_count ?? 0) > 0;

  if (monthRows.some(row => !current(row)) || (hasRecords && monthRows.length === 0)) stale.push('month');

  for (const kind of ['dimension', 'tab', 'stress']) {
    const rows = resultRows.filter(row => row.config_kind === kind);
    if (rows.some(row => !current(row))) stale.push(kind);
  }

  // cycle_stats 没有 source_version：以“总览是否落后 / 有记录但周期表为空”近似判断
  if (overviewStale || (hasRecords && cycleRows.length === 0)) stale.push('cycle');

  return stale;
}

export async function getStats(db: any, datasetId: string, options: StatsQueryOptions = {}): Promise<any> {
  const [metaRow, overviewRow, monthRows, resultRows, cycleRows] = await Promise.all([
    db.prepare('SELECT version, cycle_stats_generated_at FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM stat_overview WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM stat_month WHERE dataset_id = ? ORDER BY month ASC').bind(datasetId).all(),
    db.prepare('SELECT * FROM analysis_results WHERE dataset_id = ? ORDER BY config_kind ASC, config_id ASC').bind(datasetId).all(),
    db.prepare('SELECT * FROM cycle_stats WHERE dataset_id = ? ORDER BY stat_type ASC, start_date ASC').bind(datasetId).all(),
  ]);

  const weeklyRows = monthRows?.results ?? [];
  const results = resultRows?.results ?? [];
  const cyclesRows = cycleRows?.results ?? [];

  const cycles: Record<string, any[]> = {};
  for (const row of cyclesRows) {
    const item = cycleFromRow(row);
    (cycles[item.statType] ||= []).push(item);
  }

  // 周期 → 记录归属：只有显式请求时才回填，平时不占带宽
  if (options.withRecordIds && cyclesRows.length > 0) {
    const linkRows = await db
      .prepare('SELECT stat_type, cycle_id, record_id FROM cycle_records WHERE dataset_id = ? ORDER BY stat_type ASC, cycle_id ASC, seq ASC')
      .bind(datasetId)
      .all();
    const byCycle = new Map<string, string[]>();
    for (const row of linkRows?.results ?? []) {
      const key = `${String(row.stat_type)}::${String(row.cycle_id)}`;
      const list = byCycle.get(key) ?? [];
      list.push(String(row.record_id));
      byCycle.set(key, list);
    }
    for (const list of Object.values(cycles)) {
      for (const item of list) {
        item.recordIds = byCycle.get(`${item.statType}::${item.cycleId}`) ?? [];
      }
    }
  }

  const version = typeof metaRow?.version === 'number' ? metaRow.version : 0;

  return {
    version,
    overview: overviewFromRow(overviewRow),
    monthly: weeklyRows.map(monthFromRow),
    analysisResults: results.map(resultFromRow),
    cycleStats: cycles,
    cycleStatsGeneratedAt: metaRow?.cycle_stats_generated_at ?? null,
    staleKinds: staleKindsOf({
      version,
      overviewRow,
      monthRows: weeklyRows,
      resultRows: results,
      cycleRows: cyclesRows,
    }),
  };
}

// ─── 重算 ─────────────────────────────────────────────────────────
export interface RecomputeOptions {
  /** 需要重算的类别：overview | month | dimension | tab | stress | cycle，缺省=全部 */
  kinds?: string[];
  /** 只重算指定配置（页签/压测系列） */
  ids?: string[];
}

export async function recomputeStats(
  db: any,
  datasetId: string,
  options: RecomputeOptions = {},
): Promise<{ ok: boolean; version: number }> {
  const metaRow = await db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first();
  const version = typeof metaRow?.version === 'number' ? metaRow.version : 0;

  const [configRow, seriesRows] = await Promise.all([
    db.prepare('SELECT payload FROM field_configs WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare(
      `SELECT s.id AS id, s.kind AS kind, s.position AS position,
              g.seq AS seq, g.mode AS mode, g.source AS source, g.filter AS filter
         FROM analysis_series s
         LEFT JOIN analysis_series_groups g
           ON g.dataset_id = s.dataset_id AND g.kind = s.kind AND g.series_id = s.id
        WHERE s.dataset_id = ? AND s.kind IN ('tab', 'stress')
        ORDER BY s.kind, s.position, s.id, g.seq`,
    ).bind(datasetId).all(),
  ]);

  const config = parseJson(configRow?.payload, {});
  const dims = Array.isArray(config?.theoreticalDimensions) ? config.theoreticalDimensions : [];

  const seriesMap = new Map<string, { id: string; kind: 'tab' | 'stress'; groups: any[] }>();
  for (const row of seriesRows?.results ?? []) {
    const key = `${row.kind}:${row.id}`;
    if (!seriesMap.has(key)) seriesMap.set(key, { id: String(row.id), kind: row.kind, groups: [] });
    if (row.seq !== null && row.seq !== undefined) {
      seriesMap.get(key)!.groups.push({
        mode: row.mode === 'exclude' ? 'exclude' : 'merge',
        source: row.source ?? 'profitPercent',
        filter: parseJson(row.filter, {}),
      });
    }
  }

  const wanted = new Set(options.kinds && options.kinds.length > 0
    ? options.kinds
    : ['overview', 'month', 'dimension', 'tab', 'stress', 'cycle']);
  const ids = Array.isArray(options.ids) && options.ids.length > 0 ? new Set(options.ids.map(String)) : null;
  const now = new Date().toISOString();

  const statements: any[] = [
    // 守卫第一段：确保 meta 行存在
    db.prepare('INSERT INTO record_meta (dataset_id, version, write_token, updated_at) VALUES (?1, 0, ?2, ?3) ON CONFLICT(dataset_id) DO NOTHING')
      .bind(datasetId, crypto.randomUUID(), now),
    // 守卫第二段：版本不一致时 changes = 0
    db.prepare('UPDATE record_meta SET updated_at = updated_at WHERE dataset_id = ?1 AND version = ?2')
      .bind(datasetId, version),
  ];

  const bind = (sql: string) => db.prepare(sql).bind(datasetId, version, now);
  const bindPrune = (sql: string) => db.prepare(sql).bind(datasetId, version);
  const guard = '(SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2';

  if (wanted.has('overview')) {
    const sql = buildOverviewStatement()
      .replace('{{AGGREGATE_RATIOS}}', () => buildAggregateRatios(config))
      .replace('{{THEORETICAL_RATIOS}}', () => buildTheoreticalRatios(dims));
    statements.push(bind(sql));
  }

  if (wanted.has('month')) {
    statements.push(bind(buildMonthStatement()));
    statements.push(bindPrune(
      `DELETE FROM stat_month
        WHERE dataset_id = ?1
          AND month NOT IN (SELECT ${monthExpr('open_date')} FROM records WHERE dataset_id = ?1)
          AND ${guard}`,
    ));
  }

  if (wanted.has('dimension')) {
    const dimensions = defaultDimensions(config);
    for (const dim of dimensions) {
      statements.push(bind(buildSeriesStatement('dimension', dim.key, buildDimensionCtes(dim.predicate))));
    }
    const keep = dimensions.map(d => sqlStr(d.key)).join(', ');
    statements.push(bindPrune(
      `DELETE FROM analysis_results
        WHERE dataset_id = ?1 AND config_kind = 'dimension'
          AND config_id NOT IN (${keep || "''"})
          AND ${guard}`,
    ));
  }

  for (const kind of ['tab', 'stress'] as const) {
    if (!wanted.has(kind)) continue;
    const configs = [...seriesMap.values()].filter(item => item.kind === kind && item.groups.length > 0);
    const selected = ids ? configs.filter(item => ids.has(item.id)) : configs;

    for (const item of selected) {
      const ctes = buildSeriesCtes(item.groups, dims);
      if (kind === 'tab') {
        statements.push(bind(buildSeriesStatement('tab', item.id, ctes)));
        continue;
      }

      // 压测：SQL 只取序列，偏度/峰度/JB 在 Worker 里算（D1 禁用了 power/sqrt/exp）
      const row = await db.prepare(buildSeriesSelect(ctes)).bind(datasetId).first();
      const values = parseJson(row?.values_json, []);
      const stats = computeStressStats(Array.isArray(values) ? values : []);
      statements.push(
        db.prepare(buildStressInsert()).bind(
          datasetId,
          item.id,
          Number(row?.record_count ?? 0),
          row?.values_json ?? '[]',
          row?.positions_json ?? '[]',
          row?.cumulative ?? '[]',
          row?.cycle ?? '[]',
          row?.growth ?? '[]',
          stats.skewness,
          stats.kurtosis,
          stats.jb,
          stats.jbPValue,
          version,
          now,
        ),
      );
    }

    // 只有全量重算时才清理已删除配置
    if (!ids) {
      const keep = configs.map(item => sqlStr(item.id)).join(', ');
      statements.push(bindPrune(
        `DELETE FROM analysis_results
          WHERE dataset_id = ?1 AND config_kind = ${sqlStr(kind)}
            ${keep ? `AND config_id NOT IN (${keep})` : ''}
            AND ${guard}`,
      ));
    }
  }

  if (wanted.has('cycle')) {
    const nowMs = Date.now();
    // cycleId 是确定性的，先清空再重建，避免数据变化后残留旧批次
    statements.push(bindPrune(`DELETE FROM cycle_stats WHERE dataset_id = ?1 AND ${guard}`));
    statements.push(bindPrune(`DELETE FROM cycle_records WHERE dataset_id = ?1 AND ${guard}`));
    for (const statType of listStatTypes(config)) {
      const predicate = statTypePredicate(statType, config);
      if (!predicate) continue;
      statements.push(db.prepare(buildCycleStatInsert(statType, predicate)).bind(datasetId, nowMs, version));
      statements.push(db.prepare(buildCycleRecordsInsert(statType, predicate)).bind(datasetId, version));
    }
    statements.push(
      db
        .prepare('UPDATE record_meta SET cycle_stats_generated_at = ?2 WHERE dataset_id = ?1 AND version = ?3')
        .bind(datasetId, nowMs, version),
    );
  }

  // 前两条是「确保 meta 行存在 + 版本守卫」：先单独执行，判断本次是否抢到写权
  const guardResults = await db.batch(statements.slice(0, 2));
  const guarded = guardResults?.[1]?.meta?.changes ?? 0;
  if (guarded !== 1) {
    const current = await db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first();
    return { ok: false, version: typeof current?.version === 'number' ? current.version : 0 };
  }

  // 其余语句分片提交：周期统计是 2 条/统计类型，配置多时一次性 batch 会过大。
  // 每条写入都自带 version 守卫，期间记录被改动会自动 no-op。
  const rest = statements.slice(2);
  for (let i = 0; i < rest.length; i += STATS_BATCH_SIZE) {
    await db.batch(rest.slice(i, i + STATS_BATCH_SIZE));
  }

  const after = await db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first();
  const afterVersion = typeof after?.version === 'number' ? after.version : 0;
  if (afterVersion !== version) {
    // 重算期间记录被推进：结果只是部分更新，交给调用方重试
    return { ok: false, version: afterVersion };
  }
  return { ok: true, version };
}

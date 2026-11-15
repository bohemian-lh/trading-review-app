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

const CYCLE_SIZE = 30;

function sqlStr(value: unknown): string {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

/** JSON 路径字面量：$.scope."id"（id 做 JSON 转义后再做 SQL 单引号转义） */
function jsonPath(scope: string, id: string): string {
  const key = JSON.stringify(String(id)).replace(/'/g, "''");
  return `'$.${scope}.${key}'`;
}

/** 读取 JSON 数值：缺失/显式 null/历史哨兵 ±999/字符串 NULL → NULL */
function numOrNull(alias: string, path: string): string {
  const v = `CAST(json_extract(${alias}.payload, ${path}) AS REAL)`;
  return `(CASE
    WHEN json_type(${alias}.payload, ${path}) IS NULL THEN NULL
    WHEN json_type(${alias}.payload, ${path}) = 'null' THEN NULL
    WHEN json_type(${alias}.payload, ${path}) = 'text'
      THEN (CASE WHEN UPPER(json_extract(${alias}.payload, ${path})) IN ('NULL', 'N/A', '') THEN NULL ELSE ${v} END)
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
         EXISTS (SELECT 1 FROM json_each(r.payload, '$.patternFeatures') jp WHERE jp.value = '系统') AS is_system,
         EXISTS (SELECT 1 FROM json_each(r.payload, '$.patternFeatures') jp WHERE jp.value = '非系统') AS is_non_system
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
        FROM base b, json_each(b.payload, '$.trendFeatures') jt
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
  SELECT substr(b.open_date, 1, 6) AS month,
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

// ─── 曲线结果（默认维度 / 页签 / 压测系列）────────────────────────
interface SeriesStatementOptions {
  kind: 'dimension' | 'tab' | 'stress';
  id: string;
  /** 追加到 WITH 之后的 CTE 定义（必须包含 s） */
  ctes: string;
  stress: boolean;
}

function buildSeriesStatement(opts: SeriesStatementOptions): string {
  const { kind, id, ctes, stress } = opts;

  const cumulative = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
      SELECT ROUND(SUM(v) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING), 2) AS val
        FROM s
       ORDER BY open_date, id
    ))`;

  const cycle = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
      SELECT ${ratioV3(pSum('v'), lSum('v'))} AS val
        FROM (
          SELECT CAST((ROW_NUMBER() OVER (ORDER BY open_date, id) - 1) / ${CYCLE_SIZE} AS INTEGER) AS period, v
            FROM s
        )
       GROUP BY period
       ORDER BY period
    ))`;

  const growth = `(SELECT COALESCE(json_group_array(val), '[]') FROM (
      SELECT ${ratioV3('p', 'l')} AS val
        FROM (
          SELECT SUM(CASE WHEN v > 0 THEN v ELSE 0 END) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING) AS p,
                 SUM(CASE WHEN v < 0 THEN -v ELSE 0 END) OVER (ORDER BY open_date, id ROWS UNBOUNDED PRECEDING) AS l
            FROM s
           ORDER BY open_date, id
        )
    ))`;

  const values = `(SELECT COALESCE(json_group_array(v), '[]') FROM (SELECT v FROM s ORDER BY open_date, id))`;
  const positions = stress
    ? `(SELECT COALESCE(json_group_array(position_size), '[]') FROM (SELECT position_size FROM s ORDER BY open_date, id))`
    : `'[]'`;

  const statsCtes = stress
    ? `,
moments AS (
  SELECT COUNT(*) AS n, AVG(v) AS mu, AVG(v * v) AS e2, AVG(v * v * v) AS e3, AVG(v * v * v * v) AS e4 FROM s
),
central AS (
  SELECT n, mu,
         e2 - mu * mu AS m2,
         e3 - 3 * mu * e2 + 2 * mu * mu * mu AS m3,
         e4 - 4 * mu * e3 + 6 * mu * mu * e2 - 3 * mu * mu * mu * mu AS m4
    FROM moments
),
mstats AS (
  SELECT n, m2, m3, m4,
         CASE WHEN n < 3 OR m2 IS NULL OR m2 <= 0 THEN 0
              ELSE (sqrt(n * (n - 1.0)) / (n - 2.0)) * (m3 / power(m2, 1.5)) END AS sk,
         CASE WHEN n < 4 OR m2 IS NULL OR m2 <= 0 THEN 0
              ELSE ((n - 1.0) / ((n - 2.0) * (n - 3.0))) * ((n + 1.0) * (m4 / (m2 * m2) - 3.0) + 6.0) END AS ku
    FROM central
),
jstats AS (
  SELECT n, sk, ku, CASE WHEN n < 3 THEN 0 ELSE (n / 6.0) * (sk * sk + ku * ku / 4.0) END AS jb FROM mstats
)`
    : '';

  const skewness = stress
    ? `(SELECT CASE WHEN n < 3 OR m2 IS NULL OR m2 <= 0 THEN 0
        ELSE (sqrt(n * (n - 1.0)) / (n - 2.0)) * (m3 / power(m2, 1.5)) END FROM mstats)`
    : 'NULL';
  const kurtosis = stress
    ? `(SELECT CASE WHEN n < 4 OR m2 IS NULL OR m2 <= 0 THEN 0
        ELSE ((n - 1.0) / ((n - 2.0) * (n - 3.0))) * ((n + 1.0) * (m4 / (m2 * m2) - 3.0) + 6.0) END FROM mstats)`
    : 'NULL';
  const jb = stress ? '(SELECT jb FROM jstats)' : 'NULL';
  const jbP = stress ? '(SELECT CASE WHEN n < 3 THEN 1 ELSE exp(-jb / 2.0) END FROM jstats)' : 'NULL';

  return `WITH ${BASE_CTE},
${ctes}${statsCtes}
INSERT INTO analysis_results (${RESULT_COLUMNS})
SELECT ?1, ${sqlStr(kind)}, ${sqlStr(id)},
  (SELECT COUNT(*) FROM s),
  ${values},
  ${positions},
  ${cumulative},
  ${cycle},
  ${growth},
  ${skewness},
  ${kurtosis},
  ${jb},
  ${jbP},
  ?2, ?3
FROM (SELECT 1)
WHERE (SELECT version FROM record_meta WHERE dataset_id = ?1) = ?2
ON CONFLICT(dataset_id, config_kind, config_id) DO UPDATE SET ${RESULT_UPDATE}`;
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
    parts.push(`substr(${alias}.open_date, 1, 6) >= ${sqlStr(f.startDate)}`);
  }
  if (typeof f.endDate === 'string' && f.endDate) {
    parts.push(`substr(${alias}.open_date, 1, 6) <= ${sqlStr(f.endDate)}`);
  }
  if (Array.isArray(f.tradingTypes) && f.tradingTypes.length > 0) {
    parts.push(`${alias}.trading_type IN (${f.tradingTypes.map((t: any) => sqlStr(t)).join(', ')})`);
  }
  if (Array.isArray(f.trendFeatures) && f.trendFeatures.length > 0) {
    parts.push(`EXISTS (SELECT 1 FROM json_each(${alias}.payload, '$.trendFeatures') jt WHERE jt.value IN (${f.trendFeatures.map((t: any) => sqlStr(t)).join(', ')}))`);
  }
  if (Array.isArray(f.patternFeatures) && f.patternFeatures.length > 0) {
    parts.push(`EXISTS (SELECT 1 FROM json_each(${alias}.payload, '$.patternFeatures') jp WHERE jp.value IN (${f.patternFeatures.map((t: any) => sqlStr(t)).join(', ')}))`);
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

export async function getStats(db: any, datasetId: string): Promise<any> {
  const [metaRow, overviewRow, monthRows, resultRows] = await Promise.all([
    db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM stat_overview WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM stat_month WHERE dataset_id = ? ORDER BY month ASC').bind(datasetId).all(),
    db.prepare('SELECT * FROM analysis_results WHERE dataset_id = ? ORDER BY config_kind ASC, config_id ASC').bind(datasetId).all(),
  ]);

  return {
    version: typeof metaRow?.version === 'number' ? metaRow.version : 0,
    overview: overviewFromRow(overviewRow),
    monthly: (monthRows?.results ?? []).map(monthFromRow),
    analysisResults: (resultRows?.results ?? []).map(resultFromRow),
  };
}

// ─── 重算 ─────────────────────────────────────────────────────────
export interface RecomputeOptions {
  /** 需要重算的类别：overview | month | dimension | tab | stress，缺省=全部 */
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

  const wanted = new Set(options.kinds && options.kinds.length > 0 ? options.kinds : ['overview', 'month', 'dimension', 'tab', 'stress']);
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
          AND month NOT IN (SELECT substr(open_date, 1, 6) FROM records WHERE dataset_id = ?1)
          AND ${guard}`,
    ));
  }

  if (wanted.has('dimension')) {
    const dimensions = defaultDimensions(config);
    for (const dim of dimensions) {
      statements.push(bind(buildSeriesStatement({
        kind: 'dimension',
        id: dim.key,
        ctes: buildDimensionCtes(dim.predicate),
        stress: false,
      })));
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
      statements.push(bind(buildSeriesStatement({
        kind,
        id: item.id,
        ctes: buildSeriesCtes(item.groups, dims),
        stress: kind === 'stress',
      })));
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

  const results = await db.batch(statements);
  const guarded = results?.[1]?.meta?.changes ?? 0;
  if (guarded !== 1) {
    const current = await db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first();
    return { ok: false, version: typeof current?.version === 'number' ? current.version : 0 };
  }
  return { ok: true, version };
}

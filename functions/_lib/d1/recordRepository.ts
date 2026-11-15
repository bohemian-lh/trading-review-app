// 记录模块 D1 仓储层
// 分层约定：只做 SQL 与数据映射，HTTP 协议由 functions/api/records.ts 负责。
//
// 写入模型与日志模块一致：record_meta.version + write_token 做单事务 CAS。
// 与对象存储的关键差异：不做「整表删除 + 全量插入」，
//   新增/修改按 id upsert，删除只删真正消失的 id；
//   月度、周期统计同样按主键差量。
import { clampLimit, dayExpr, keysetWhere, makeCursor, monthExpr, normalizeDay, parseCursor } from './pagination';

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(text: any, fallback: any): any {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numOrNa(v: unknown): number | 'N/A' {
  return typeof v === 'number' && Number.isFinite(v) ? v : 'N/A';
}

/** 未拆表的动态字段，统一放 payload JSON */
function recordPayload(record: any): string {
  return JSON.stringify({
    trendFeatures: record?.trendFeatures,
    patternFeatures: record?.patternFeatures,
    images: record?.images,
    theoreticalProfitRatios: record?.theoreticalProfitRatios,
    theoreticalProfitDeltas: record?.theoreticalProfitDeltas,
  });
}

/**
 * 特征过滤用的 JSON 表达式：非法 JSON / 空串视为 `{}`。
 * 历史脏数据若直接进 json_each 会抛 "malformed JSON"，让整页列表查询失败。
 */
function jsonPayload(column: string): string {
  return `(CASE WHEN json_valid(${column}) THEN ${column} ELSE '{}' END)`;
}

const RECORD_GUARD = 'WHERE (SELECT write_token FROM record_meta WHERE dataset_id = ?) = ?';

/** 单条记录 upsert；guardToken 为 null 时不做版本守卫（迁移用） */
function buildRecordUpsert(db: any, datasetId: string, record: any, guardToken: string | null) {
  // 列值必须与 VALUES 的占位符一一对应；守卫参数是额外的 WHERE 绑定，不能算进 VALUES
  const values: any[] = [
    datasetId,
    String(record.id),
    record.openDate ?? '',
    record.stockCode ?? '',
    record.stockName ?? '',
    record.tradingType ?? '',
    record.preMarket ?? '',
    record.hasMistake ?? '',
    num(record.profitPercent),
    Math.trunc(num(record.holdDays)),
    Math.trunc(num(record.positionSize, 33)),
    record.hasCycleStats ? 1 : 0,
    record.hasMonthlyStats ? 1 : 0,
    record.cycleId ?? null,
    record.imagePrefix ?? '',
    record.remark ?? '',
    recordPayload(record),
    nowIso(),
  ];
  const params = guardToken === null ? values : [...values, datasetId, guardToken];

  return db
    .prepare(
      `INSERT INTO records (dataset_id, id, open_date, stock_code, stock_name, trading_type, pre_market, has_mistake,
         profit_percent, hold_days, position_size, has_cycle_stats, has_monthly_stats, cycle_id, image_prefix, remark, payload, updated_at)
       VALUES (${values.map(() => '?').join(', ')})
       ON CONFLICT(dataset_id, id) DO UPDATE SET
         open_date = excluded.open_date,
         stock_code = excluded.stock_code,
         stock_name = excluded.stock_name,
         trading_type = excluded.trading_type,
         pre_market = excluded.pre_market,
         has_mistake = excluded.has_mistake,
         profit_percent = excluded.profit_percent,
         hold_days = excluded.hold_days,
         position_size = excluded.position_size,
         has_cycle_stats = excluded.has_cycle_stats,
         has_monthly_stats = excluded.has_monthly_stats,
         cycle_id = excluded.cycle_id,
         image_prefix = excluded.image_prefix,
         remark = excluded.remark,
         payload = excluded.payload,
         updated_at = excluded.updated_at
       ${guardToken === null ? '' : RECORD_GUARD}`,
    )
    .bind(...params);
}

function fromRow(row: any): any {
  const payload = parseJson(row.payload, {});
  return {
    id: row.id,
    openDate: row.open_date,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    tradingType: row.trading_type,
    preMarket: row.pre_market,
    hasMistake: row.has_mistake,
    profitPercent: row.profit_percent,
    holdDays: row.hold_days,
    positionSize: row.position_size,
    hasCycleStats: !!row.has_cycle_stats,
    hasMonthlyStats: !!row.has_monthly_stats,
    cycleId: row.cycle_id ?? undefined,
    imagePrefix: row.image_prefix,
    remark: row.remark,
    ...payload,
  };
}

function monthlyFromRow(row: any): any {
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

function monthlyUpsertSql(db: any, datasetId: string, item: any, guardToken: string | null) {
  const values: any[] = [
    datasetId,
    String(item.month),
    nullableNum(item.systemProfitRatio),
    nullableNum(item.systemNoMistakeProfitRatio),
    nullableNum(item.systemWithMistakeProfitRatio),
    nullableNum(item.nonSystemProfitRatio),
    nullableNum(item.avgProfitRatio),
    nullableNum(item.totalProfit),
  ];
  const params = guardToken === null ? values : [...values, datasetId, guardToken];
  return db
    .prepare(
      `INSERT INTO monthly_analysis (dataset_id, month, system_profit_ratio, system_no_mistake_profit_ratio,
         system_with_mistake_profit_ratio, non_system_profit_ratio, avg_profit_ratio, total_profit)
       VALUES (${values.map(() => '?').join(', ')})
       ON CONFLICT(dataset_id, month) DO UPDATE SET
         system_profit_ratio = excluded.system_profit_ratio,
         system_no_mistake_profit_ratio = excluded.system_no_mistake_profit_ratio,
         system_with_mistake_profit_ratio = excluded.system_with_mistake_profit_ratio,
         non_system_profit_ratio = excluded.non_system_profit_ratio,
         avg_profit_ratio = excluded.avg_profit_ratio,
         total_profit = excluded.total_profit
       ${guardToken === null ? '' : RECORD_GUARD}`,
    )
    .bind(...params);
}

function cycleFromRow(row: any): any {
  return {
    cycleId: row.cycle_id,
    statType: row.stat_type,
    startDate: row.start_date,
    endDate: row.end_date,
    recordCount: row.record_count,
    isComplete: !!row.is_complete,
    profitSum: row.profit_sum,
    lossSum: row.loss_sum,
    profitRatio: row.profit_ratio ?? null,
    recordIds: parseJson(row.record_ids, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cycleUpsertSql(db: any, datasetId: string, item: any, guardToken: string | null) {
  const values: any[] = [
    datasetId,
    String(item.statType),
    String(item.cycleId),
    item.startDate ?? '',
    item.endDate ?? '',
    Math.trunc(num(item.recordCount)),
    item.isComplete ? 1 : 0,
    num(item.profitSum),
    num(item.lossSum),
    nullableNum(item.profitRatio),
    JSON.stringify(Array.isArray(item.recordIds) ? item.recordIds : []),
    Math.trunc(num(item.createdAt)),
    Math.trunc(num(item.updatedAt)),
  ];
  const params = guardToken === null ? values : [...values, datasetId, guardToken];
  return db
    .prepare(
      `INSERT INTO cycle_stats (dataset_id, stat_type, cycle_id, start_date, end_date, record_count, is_complete,
         profit_sum, loss_sum, profit_ratio, record_ids, created_at, updated_at)
       VALUES (${values.map(() => '?').join(', ')})
       ON CONFLICT(dataset_id, stat_type, cycle_id) DO UPDATE SET
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         record_count = excluded.record_count,
         is_complete = excluded.is_complete,
         profit_sum = excluded.profit_sum,
         loss_sum = excluded.loss_sum,
         profit_ratio = excluded.profit_ratio,
         record_ids = excluded.record_ids,
         updated_at = excluded.updated_at
       ${guardToken === null ? '' : RECORD_GUARD}`,
    )
    .bind(...params);
}

// ─── 读取 ─────────────────────────────────────────────────────
/** 数据集级元信息与派生数据（不含记录明细） */
export async function getRecordsMeta(db: any, datasetId: string): Promise<any> {
  const [meta, analysisRow, monthlyRows, cycleRows, totalRow, monthRows] = await Promise.all([
    db.prepare('SELECT version, custom_monthly_use, cycle_stats_generated_at FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT use_custom, payload FROM custom_analysis WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM monthly_analysis WHERE dataset_id = ? ORDER BY month ASC').bind(datasetId).all(),
    db.prepare('SELECT * FROM cycle_stats WHERE dataset_id = ? ORDER BY stat_type ASC, start_date ASC').bind(datasetId).all(),
    db.prepare('SELECT COUNT(*) AS c FROM records WHERE dataset_id = ?').bind(datasetId).first(),
    // 月份筛选项：分页后前端只持有当前页，选项必须由服务端给出
    db.prepare(`SELECT DISTINCT ${monthExpr('open_date')} AS m FROM records WHERE dataset_id = ? ORDER BY m DESC`).bind(datasetId).all(),
  ]);

  const cycleStats: Record<string, any[]> = {};
  for (const row of cycleRows?.results ?? []) {
    const item = cycleFromRow(row);
    (cycleStats[item.statType] ||= []).push(item);
  }

  return {
    version: typeof meta?.version === 'number' ? meta.version : 0,
    total: Number(totalRow?.c ?? 0),
    // 与分页里的 total（当前筛选条件下的条数）区分：这是数据集全量条数
    datasetTotal: Number(totalRow?.c ?? 0),
    months: (monthRows?.results ?? [])
      .map((r: any) => String(r.m ?? ''))
      .filter((m: string) => m.length === 6),
    customAnalysis: analysisRow
      ? { useCustom: !!analysisRow.use_custom, data: parseJson(analysisRow.payload, {}) }
      : undefined,
    customMonthly: {
      useCustom: !!meta?.custom_monthly_use,
      data: (monthlyRows?.results ?? []).map(monthlyFromRow),
    },
    cycleStats,
    cycleStatsGeneratedAt: meta?.cycle_stats_generated_at ?? null,
  };
}

export interface RecordPageOptions {
  limit?: number;
  cursor?: string | null;
  /** 排序键：开单日（默认）或股票代码 */
  sortKey?: 'openDate' | 'stockCode' | null;
  /** 页码分页：与 cursor 互斥，传了 offset 就按 LIMIT/OFFSET 取页（表格需要跳页） */
  offset?: number | null;
  sort?: 'asc' | 'desc';
  fromDay?: string | null;
  toDay?: string | null;
  code?: string | null;
  keyword?: string | null;
  tradingType?: string | null;
  /** 趋势特征 / 模式特征：JSON 数组包含判断 */
  trendFeature?: string | null;
  patternFeature?: string | null;
}

/**
 * 记录分页：过滤条件全部下推到 SQL，前端只拿当前页。
 * 两种翻页方式：
 *   - cursor（键集，默认）：游标为「排序键值|id」，适合「加载更多」；
 *   - offset：LIMIT/OFFSET，允许表格直接跳到任意页。
 */
export async function getRecordsPage(
  db: any,
  datasetId: string,
  options: RecordPageOptions = {},
): Promise<{ records: any[]; nextCursor: string | null; total: number; version: number }> {
  const limit = clampLimit(options.limit, 20);
  const sort = options.sort === 'asc' ? 'asc' : 'desc';
  const dir = sort.toUpperCase();
  const day = dayExpr('open_date');
  const byStockCode = options.sortKey === 'stockCode';
  const orderExprs = byStockCode ? ['stock_code', 'id'] : [day, 'id'];
  const orderBy = orderExprs.map(expr => `${expr} ${dir}`).join(', ');
  const offsetValue = Number(options.offset);
  const offset = Number.isFinite(offsetValue) && offsetValue > 0 ? Math.trunc(offsetValue) : 0;

  const where: string[] = ['dataset_id = ?'];
  const params: any[] = [datasetId];

  const fromDay = normalizeDay(options.fromDay);
  const toDay = normalizeDay(options.toDay);
  if (fromDay) {
    where.push(`${day} >= ?`);
    params.push(fromDay);
  }
  if (toDay) {
    where.push(`${day} <= ?`);
    params.push(toDay);
  }
  if (options.code) {
    where.push('stock_code LIKE ?');
    params.push(`%${options.code}%`);
  }
  if (options.tradingType) {
    where.push('trading_type = ?');
    params.push(options.tradingType);
  }
  if (options.trendFeature) {
    where.push(`EXISTS (SELECT 1 FROM json_each(${jsonPayload('payload')}, '$.trendFeatures') jt WHERE jt.value = ?)`);
    params.push(options.trendFeature);
  }
  if (options.patternFeature) {
    where.push(`EXISTS (SELECT 1 FROM json_each(${jsonPayload('payload')}, '$.patternFeatures') jp WHERE jp.value = ?)`);
    params.push(options.patternFeature);
  }
  if (options.keyword) {
    where.push('(stock_code LIKE ? OR stock_name LIKE ?)');
    params.push(`%${options.keyword}%`, `%${options.keyword}%`);
  }

  const filters = where.join(' AND ');
  const [versionRow, totalRow] = await Promise.all([
    db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare(`SELECT COUNT(*) AS c FROM records WHERE ${filters}`).bind(...params).first(),
  ]);

  const pageWhere = [...where];
  const pageParams = [...params];
  const cursor = offset > 0 ? null : parseCursor(options.cursor ?? null, 2);
  if (cursor) {
    const keyset = keysetWhere(orderExprs, cursor, sort);
    pageWhere.push(keyset.sql);
    pageParams.push(...keyset.params);
  }

  const rows = await db
    .prepare(
      `SELECT * FROM records
        WHERE ${pageWhere.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ?${offset > 0 ? ' OFFSET ?' : ''}`,
    )
    .bind(...pageParams, limit + 1, ...(offset > 0 ? [offset] : []))
    .all();

  const rawRows: any[] = rows?.results ?? [];
  const hasMore = rawRows.length > limit;
  const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const last = pageRows[pageRows.length - 1];
  const lastSortValue = byStockCode
    ? String(last?.stock_code ?? '')
    : String(last?.open_date ?? '').replace(/-/g, '').slice(0, 8);

  return {
    records: pageRows.map(fromRow),
    nextCursor: offset > 0 || !hasMore || !last ? null : makeCursor([lastSortValue, last.id]),
    total: Number(totalRow?.c ?? 0),
    version: typeof versionRow?.version === 'number' ? versionRow.version : 0,
  };
}

/** 全量读取（版本冲突回传、迁移校验用；正常列表走分页） */
export async function getRecords(db: any, datasetId: string): Promise<any> {
  const [meta, recordRows] = await Promise.all([
    getRecordsMeta(db, datasetId),
    db.prepare('SELECT * FROM records WHERE dataset_id = ? ORDER BY open_date DESC, id DESC').bind(datasetId).all(),
  ]);
  return { ...meta, records: (recordRows?.results ?? []).map(fromRow) };
}

// ─── 增量写入 ──────────────────────────────────────────────────
export interface RecordChanges {
  upserts?: any[];
  deletes?: string[];
  customAnalysis?: { useCustom: boolean; data: any } | null;
  monthlyUpserts?: any[];
  monthlyDeletes?: string[];
  monthlyUseCustom?: boolean;
  cycleStatsUpserts?: any[];
  cycleStatsDeletes?: { statType: string; cycleId: string }[];
  cycleStatsGeneratedAt?: number | null;
}

export type ApplyRecordChangesResult =
  | { ok: true; version: number; /** 覆盖导入：写入/删除的条数，供 UI 汇报 */ replaced?: number; removed?: number }
  | { ok: false; version: number; snapshot: any };

/** 提交一批增量变更；版本冲突时整批 no-op，回传服务端版本号（可选回传全量快照） */
export async function applyRecordChanges(
  db: any,
  datasetId: string,
  baseVersion: number,
  changes: RecordChanges,
  includeSnapshot = true,
): Promise<ApplyRecordChangesResult> {
  const token = crypto.randomUUID();
  const now = nowIso();
  const nextVersion = baseVersion + 1;

  const statements: any[] = [
    db
      .prepare('INSERT INTO record_meta (dataset_id, version, write_token, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(dataset_id) DO NOTHING')
      .bind(datasetId, token, now),
    db
      .prepare('UPDATE record_meta SET version = version + 1, write_token = ?, updated_at = ? WHERE dataset_id = ? AND version = ?')
      .bind(token, now, datasetId, baseVersion),
  ];

  for (const record of changes.upserts ?? []) {
    if (record && typeof record.id === 'string') statements.push(buildRecordUpsert(db, datasetId, record, token));
  }
  for (const id of changes.deletes ?? []) {
    statements.push(
      db
        .prepare('DELETE FROM records WHERE dataset_id = ? AND id = ? AND (SELECT write_token FROM record_meta WHERE dataset_id = ?) = ?')
        .bind(datasetId, String(id), datasetId, token),
    );
  }

  if (changes.customAnalysis) {
    statements.push(
      db
        .prepare(
          `INSERT INTO custom_analysis (dataset_id, use_custom, payload, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(dataset_id) DO UPDATE SET
             use_custom = excluded.use_custom,
             payload = excluded.payload,
             updated_at = excluded.updated_at
           ${RECORD_GUARD}`,
        )
        .bind(
          datasetId,
          changes.customAnalysis.useCustom ? 1 : 0,
          JSON.stringify(changes.customAnalysis.data ?? {}),
          now,
          datasetId,
          token,
        ),
    );
  }

  for (const item of changes.monthlyUpserts ?? []) {
    if (item && typeof item.month === 'string') statements.push(monthlyUpsertSql(db, datasetId, item, token));
  }
  for (const month of changes.monthlyDeletes ?? []) {
    statements.push(
      db
        .prepare('DELETE FROM monthly_analysis WHERE dataset_id = ? AND month = ? AND (SELECT write_token FROM record_meta WHERE dataset_id = ?) = ?')
        .bind(datasetId, String(month), datasetId, token),
    );
  }

  for (const item of changes.cycleStatsUpserts ?? []) {
    if (item && typeof item.cycleId === 'string' && typeof item.statType === 'string') {
      statements.push(cycleUpsertSql(db, datasetId, item, token));
    }
  }
  for (const item of changes.cycleStatsDeletes ?? []) {
    statements.push(
      db
        .prepare('DELETE FROM cycle_stats WHERE dataset_id = ? AND stat_type = ? AND cycle_id = ? AND (SELECT write_token FROM record_meta WHERE dataset_id = ?) = ?')
        .bind(datasetId, String(item.statType), String(item.cycleId), datasetId, token),
    );
  }

  // 数据集级开关与派生时间戳
  if (typeof changes.monthlyUseCustom === 'boolean') {
    statements.push(
      db
        .prepare('UPDATE record_meta SET custom_monthly_use = ? WHERE dataset_id = ? AND write_token = ?')
        .bind(changes.monthlyUseCustom ? 1 : 0, datasetId, token),
    );
  }
  if (changes.cycleStatsGeneratedAt !== undefined) {
    statements.push(
      db
        .prepare('UPDATE record_meta SET cycle_stats_generated_at = ? WHERE dataset_id = ? AND write_token = ?')
        .bind(changes.cycleStatsGeneratedAt ?? null, datasetId, token),
    );
  }

  const results = await db.batch(statements);
  const bumped = results?.[1]?.meta?.changes ?? 0;
  if (bumped !== 1) {
    // 增量保存只需版本号用于重放；全量覆盖路径才需要整份快照
    if (!includeSnapshot) {
      const versionRow = await db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first();
      return { ok: false, version: typeof versionRow?.version === 'number' ? versionRow.version : 0, snapshot: null };
    }
    const snapshot = await getRecords(db, datasetId);
    return { ok: false, version: snapshot.version, snapshot };
  }
  return { ok: true, version: nextVersion };
}

/**
 * 旧版全量覆盖（兼容缓存里的旧客户端，也用于 Excel 覆盖导入）：
 * 读取现有主键集合，换算成差量后走同一条增量写入路径，不做整表删除重建。
 *
 * 月度 / 周期统计遵循「字段缺失 = 不动」：客户端没带这两类集合时不能当成“清空”，
 * 否则一次只导入 table1 的覆盖操作会顺手清掉派生结果表。
 */
export async function replaceAllRecords(
  db: any,
  datasetId: string,
  body: { records?: any[]; customAnalysis?: any; customMonthly?: any; cycleStats?: any; cycleStatsGeneratedAt?: number | null },
): Promise<ApplyRecordChangesResult> {
  const [meta, existingRecords, existingMonthly, existingCycles] = await Promise.all([
    db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT id FROM records WHERE dataset_id = ?').bind(datasetId).all(),
    db.prepare('SELECT month FROM monthly_analysis WHERE dataset_id = ?').bind(datasetId).all(),
    db.prepare('SELECT stat_type, cycle_id FROM cycle_stats WHERE dataset_id = ?').bind(datasetId).all(),
  ]);

  const records = Array.isArray(body.records) ? body.records.filter(r => r && typeof r.id === 'string') : [];
  const keepRecords = new Set(records.map((r: any) => String(r.id)));
  const deletes = (existingRecords?.results ?? [])
    .map((r: any) => String(r.id))
    .filter((id: string) => !keepRecords.has(id));

  const hasMonthly = body.customMonthly !== undefined && body.customMonthly !== null;
  const monthly = hasMonthly && Array.isArray(body.customMonthly.data) ? body.customMonthly.data : [];
  const keepMonths = new Set(monthly.map((m: any) => String(m.month)));
  const monthlyDeletes = hasMonthly
    ? (existingMonthly?.results ?? [])
      .map((r: any) => String(r.month))
      .filter((m: string) => !keepMonths.has(m))
    : [];

  const hasCycles = body.cycleStats !== undefined && body.cycleStats !== null;
  const cycleUpserts: any[] = [];
  const keepCycles = new Set<string>();
  for (const [statType, list] of Object.entries(hasCycles ? body.cycleStats : {})) {
    for (const item of (Array.isArray(list) ? list : []) as any[]) {
      cycleUpserts.push({ ...item, statType: item.statType ?? statType });
      keepCycles.add(`${statType}::${item.cycleId}`);
    }
  }
  const cycleDeletes = hasCycles
    ? (existingCycles?.results ?? [])
      .map((r: any) => ({ statType: String(r.stat_type), cycleId: String(r.cycle_id) }))
      .filter((c: any) => !keepCycles.has(`${c.statType}::${c.cycleId}`))
    : [];

  const baseVersion = typeof meta?.version === 'number' ? meta.version : 0;
  const result = await applyRecordChanges(db, datasetId, baseVersion, {
    upserts: records,
    deletes,
    customAnalysis: body.customAnalysis,
    monthlyUpserts: monthly,
    monthlyDeletes,
    monthlyUseCustom: hasMonthly ? body.customMonthly?.useCustom : undefined,
    cycleStatsUpserts: cycleUpserts,
    cycleStatsDeletes: cycleDeletes,
    cycleStatsGeneratedAt: body.cycleStatsGeneratedAt,
  });
  return result.ok
    ? { ...result, replaced: records.length, removed: deletes.length }
    : result;
}

// ─── 迁移辅助 ──────────────────────────────────────────────────
export async function upsertRecordsForMigration(db: any, datasetId: string, records: any[], chunkSize = 40): Promise<void> {
  const valid = records.filter(r => r && typeof r.id === 'string');
  for (let i = 0; i < valid.length; i += chunkSize) {
    await db.batch(valid.slice(i, i + chunkSize).map(r => buildRecordUpsert(db, datasetId, r, null)));
  }
}

export async function setRecordMetaForMigration(
  db: any,
  datasetId: string,
  version: number,
  monthlyUseCustom: boolean,
  cycleStatsGeneratedAt: number | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO record_meta (dataset_id, version, write_token, custom_monthly_use, cycle_stats_generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(dataset_id) DO UPDATE SET
         version = excluded.version,
         write_token = excluded.write_token,
         custom_monthly_use = excluded.custom_monthly_use,
         cycle_stats_generated_at = excluded.cycle_stats_generated_at,
         updated_at = excluded.updated_at`,
    )
    .bind(datasetId, version, crypto.randomUUID(), monthlyUseCustom ? 1 : 0, cycleStatsGeneratedAt, nowIso())
    .run();
}

export async function upsertCustomAnalysisForMigration(db: any, datasetId: string, data: any): Promise<void> {
  await db
    .prepare(
      `INSERT INTO custom_analysis (dataset_id, use_custom, payload, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(dataset_id) DO UPDATE SET
         use_custom = excluded.use_custom, payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .bind(datasetId, data?.useCustom ? 1 : 0, JSON.stringify(data?.data ?? {}), nowIso())
    .run();
}

/** 迁移用：整集合替换月度分析（upsert + 删除多余月份） */
export async function replaceMonthlyForMigration(db: any, datasetId: string, monthly: any[]): Promise<void> {
  const valid = monthly.filter(m => m && typeof m.month === 'string');
  const keep = new Set(valid.map((m: any) => String(m.month)));
  const existing = await db.prepare('SELECT month FROM monthly_analysis WHERE dataset_id = ?').bind(datasetId).all();
  const staleMonths = (existing?.results ?? []).map((r: any) => String(r.month)).filter((m: string) => !keep.has(m));

  const statements: any[] = valid.map(m => monthlyUpsertSql(db, datasetId, m, null));
  for (const month of staleMonths) {
    statements.push(db.prepare('DELETE FROM monthly_analysis WHERE dataset_id = ? AND month = ?').bind(datasetId, month));
  }
  if (statements.length > 0) await db.batch(statements);
}

/** 迁移用：整集合替换周期统计（upsert + 删除多余周期） */
export async function replaceCycleStatsForMigration(db: any, datasetId: string, cycleStats: any): Promise<void> {
  const upserts: any[] = [];
  const keep = new Set<string>();
  for (const [statType, list] of Object.entries(cycleStats ?? {})) {
    for (const item of (Array.isArray(list) ? list : []) as any[]) {
      upserts.push({ ...item, statType: item.statType ?? statType });
      keep.add(`${statType}::${item.cycleId}`);
    }
  }
  const existing = await db.prepare('SELECT stat_type, cycle_id FROM cycle_stats WHERE dataset_id = ?').bind(datasetId).all();
  const stale = (existing?.results ?? [])
    .map((r: any) => ({ statType: String(r.stat_type), cycleId: String(r.cycle_id) }))
    .filter((c: any) => !keep.has(`${c.statType}::${c.cycleId}`));

  const statements: any[] = upserts.map(item => cycleUpsertSql(db, datasetId, item, null));
  for (const item of stale) {
    statements.push(
      db.prepare('DELETE FROM cycle_stats WHERE dataset_id = ? AND stat_type = ? AND cycle_id = ?').bind(datasetId, item.statType, item.cycleId),
    );
  }
  if (statements.length > 0) await db.batch(statements);
}

export async function countRecords(db: any, datasetId: string): Promise<{ records: number; monthly: number; cycles: number }> {
  const [r, m, c] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM records WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT COUNT(*) AS c FROM monthly_analysis WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT COUNT(*) AS c FROM cycle_stats WHERE dataset_id = ?').bind(datasetId).first(),
  ]);
  return { records: Number(r?.c ?? 0), monthly: Number(m?.c ?? 0), cycles: Number(c?.c ?? 0) };
}

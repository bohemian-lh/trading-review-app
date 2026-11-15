// 记录模块 D1 仓储层
// 分层约定：只做 SQL 与数据映射，HTTP 协议由 functions/api/records.ts 负责。
//
// 写入模型与日志模块一致：record_meta.version + write_token 做单事务 CAS。
// 与对象存储的关键差异：不做「整表删除 + 全量插入」，
//   新增/修改按 id upsert，删除只删真正消失的 id；
//   月度、周期统计同样按主键差量。
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

const RECORD_GUARD = 'WHERE (SELECT write_token FROM record_meta WHERE dataset_id = ?) = ?';

/** 单条记录 upsert；guardToken 为 null 时不做版本守卫（迁移用） */
function buildRecordUpsert(db: any, datasetId: string, record: any, guardToken: string | null) {
  const params: any[] = [
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
  if (guardToken !== null) params.push(datasetId, guardToken);

  return db
    .prepare(
      `INSERT INTO records (dataset_id, id, open_date, stock_code, stock_name, trading_type, pre_market, has_mistake,
         profit_percent, hold_days, position_size, has_cycle_stats, has_monthly_stats, cycle_id, image_prefix, remark, payload, updated_at)
       VALUES (${params.map(() => '?').join(', ')})
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
  const params: any[] = [
    datasetId,
    String(item.month),
    nullableNum(item.systemProfitRatio),
    nullableNum(item.systemNoMistakeProfitRatio),
    nullableNum(item.systemWithMistakeProfitRatio),
    nullableNum(item.nonSystemProfitRatio),
    nullableNum(item.avgProfitRatio),
    nullableNum(item.totalProfit),
  ];
  if (guardToken !== null) params.push(datasetId, guardToken);
  return db
    .prepare(
      `INSERT INTO monthly_analysis (dataset_id, month, system_profit_ratio, system_no_mistake_profit_ratio,
         system_with_mistake_profit_ratio, non_system_profit_ratio, avg_profit_ratio, total_profit)
       VALUES (${params.map(() => '?').join(', ')})
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
  const params: any[] = [
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
  if (guardToken !== null) params.push(datasetId, guardToken);
  return db
    .prepare(
      `INSERT INTO cycle_stats (dataset_id, stat_type, cycle_id, start_date, end_date, record_count, is_complete,
         profit_sum, loss_sum, profit_ratio, record_ids, created_at, updated_at)
       VALUES (${params.map(() => '?').join(', ')})
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
  const [meta, analysisRow, monthlyRows, cycleRows, totalRow] = await Promise.all([
    db.prepare('SELECT version, custom_monthly_use, cycle_stats_generated_at FROM record_meta WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT use_custom, payload FROM custom_analysis WHERE dataset_id = ?').bind(datasetId).first(),
    db.prepare('SELECT * FROM monthly_analysis WHERE dataset_id = ? ORDER BY month ASC').bind(datasetId).all(),
    db.prepare('SELECT * FROM cycle_stats WHERE dataset_id = ? ORDER BY stat_type ASC, start_date ASC').bind(datasetId).all(),
    db.prepare('SELECT COUNT(*) AS c FROM records WHERE dataset_id = ?').bind(datasetId).first(),
  ]);

  const cycleStats: Record<string, any[]> = {};
  for (const row of cycleRows?.results ?? []) {
    const item = cycleFromRow(row);
    (cycleStats[item.statType] ||= []).push(item);
  }

  return {
    version: typeof meta?.version === 'number' ? meta.version : 0,
    total: Number(totalRow?.c ?? 0),
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

/**
 * 按 open_date + id 倒序的键集分页。
 * 返回 size 条记录与下一页游标（没有更多时为 null）。
 */
export async function getRecordsPage(
  db: any,
  datasetId: string,
  limit = 20,
  cursor: string | null = null,
): Promise<{ records: any[]; nextCursor: string | null }> {
  const size = Math.min(Math.max(1, Math.trunc(limit) || 20), 200);
  const params: any[] = [datasetId];
  let where = 'dataset_id = ?';

  if (cursor) {
    const index = cursor.indexOf('|');
    // index === 0 表示 open_date 为空串，仍然要生效，否则会一直返回第一页
    if (index >= 0) {
      const openDate = cursor.slice(0, index);
      const id = cursor.slice(index + 1);
      where += ' AND (open_date < ? OR (open_date = ? AND id < ?))';
      params.push(openDate, openDate, id);
    }
  }
  params.push(size + 1);

  const rows = await db
    .prepare(`SELECT * FROM records WHERE ${where} ORDER BY open_date DESC, id DESC LIMIT ?`)
    .bind(...params)
    .all();

  const rawRows: any[] = rows?.results ?? [];
  const hasMore = rawRows.length > size;
  const pageRows = hasMore ? rawRows.slice(0, size) : rawRows;
  const lastRaw = pageRows[pageRows.length - 1];
  return {
    records: pageRows.map(fromRow),
    nextCursor: hasMore && lastRaw ? `${lastRaw.open_date}|${lastRaw.id}` : null,
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
  | { ok: true; version: number }
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
 * 旧版全量覆盖（兼容缓存里的旧客户端）：
 * 读取现有主键集合，换算成差量后走同一条增量写入路径，不做整表删除重建。
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

  const monthly = Array.isArray(body.customMonthly?.data) ? body.customMonthly.data : [];
  const keepMonths = new Set(monthly.map((m: any) => String(m.month)));
  const monthlyDeletes = (existingMonthly?.results ?? [])
    .map((r: any) => String(r.month))
    .filter((m: string) => !keepMonths.has(m));

  const cycleUpserts: any[] = [];
  const keepCycles = new Set<string>();
  for (const [statType, list] of Object.entries(body.cycleStats ?? {})) {
    for (const item of (Array.isArray(list) ? list : []) as any[]) {
      cycleUpserts.push({ ...item, statType: item.statType ?? statType });
      keepCycles.add(`${statType}::${item.cycleId}`);
    }
  }
  const cycleDeletes = (existingCycles?.results ?? [])
    .map((r: any) => ({ statType: String(r.stat_type), cycleId: String(r.cycle_id) }))
    .filter((c: any) => !keepCycles.has(`${c.statType}::${c.cycleId}`));

  const baseVersion = typeof meta?.version === 'number' ? meta.version : 0;
  return applyRecordChanges(db, datasetId, baseVersion, {
    upserts: records,
    deletes,
    customAnalysis: body.customAnalysis,
    monthlyUpserts: monthly,
    monthlyDeletes,
    monthlyUseCustom: body.customMonthly?.useCustom,
    cycleStatsUpserts: cycleUpserts,
    cycleStatsDeletes: cycleDeletes,
    cycleStatsGeneratedAt: body.cycleStatsGeneratedAt,
  });
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

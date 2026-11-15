// 日志模块 D1 仓储层
// 分层约定：本文件只负责 SQL 与数据映射，不处理 HTTP 状态码与 CORS；协议由 functions/api/* 负责。
//
// 并发模型（单事务 CAS）：
//   1. 先用 `UPDATE journal_datasets SET version = version + 1, write_token = ?token
//      WHERE version = ?base` 抢占版本号；
//   2. 同一批 batch 内，所有写操作的 WHERE 都带 `(SELECT write_token ...) = ?token` 守卫。
//   若抢占失败，守卫条件不成立，整批写入自动变成 no-op，再返回冲突让客户端重放。
//   用一次性令牌而非 `version = base + 1` 做守卫：两个并发写会算出同一个 next 版本号，
//   仅用版本号无法区分「自己抢到」还是「别人抢到但版本号恰好相同」。

import { clampLimit, dayExpr, keysetWhere, makeCursor, normalizeDay, parseCursor } from './pagination';

function nowIso(): string {
  return new Date().toISOString();
}

/** 按 chunk 拆分 IN 列表，避免单条 SQL 超过 100 个绑定参数 */
function chunk<T>(items: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 列里已有的字段不再重复写进 payload，避免同一份数据两处存储、两处漂移 */
function journalPayload(journal: any): string {
  const {
    id,
    openDate,
    stockCode,
    stockName,
    status,
    snapshotId,
    recordId,
    sortOrder,
    createdAt,
    ...rest
  } = journal ?? {};
  return JSON.stringify(rest);
}

/**
 * 单条日志 upsert。
 * guardToken 为 null 时不做版本守卫（迁移 / 全量覆盖场景）。
 *
 * sort_order：客户端显式传序号就按序号写；没传时
 *   - 新插入的 draft 由 SQL 取「当前最大值 + 10」（排到「当前交易」末尾）
 *   - 已存在的行保持原序号（不能因为一次编辑把老数据顶到末尾）
 *   - 其它状态（已存储日志）没有序号就写 0，该列对它们无意义
 */
function buildUpsert(db: any, datasetId: string, journal: any, guardToken: string | null) {
  const now = nowIso();
  // 守卫参数固定排在最后（?13），VALUES 只写列值，避免占位符与列数错位
  const guard = guardToken === null
    ? ''
    : 'WHERE (SELECT write_token FROM journal_datasets WHERE dataset_id = ?1) = ?13';
  const sql = `INSERT INTO journals (dataset_id, id, open_date, stock_code, stock_name, status, snapshot_id, record_id, sort_order, payload, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
       CASE WHEN ?6 = 'draft'
         THEN COALESCE(?9, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM journals WHERE dataset_id = ?1 AND status = 'draft'))
         ELSE COALESCE(?9, 0) END,
       ?10, ?11, ?12)
     ON CONFLICT(dataset_id, id) DO UPDATE SET
       open_date   = excluded.open_date,
       stock_code  = excluded.stock_code,
       stock_name  = excluded.stock_name,
       status      = excluded.status,
       snapshot_id = excluded.snapshot_id,
       record_id   = excluded.record_id,
       sort_order  = CASE
         WHEN ?6 = 'draft' AND journals.status <> 'draft'
           THEN COALESCE(?9, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM journals WHERE dataset_id = ?1 AND status = 'draft'))
         ELSE COALESCE(?9, journals.sort_order)
       END,
       payload     = excluded.payload,
       updated_at  = excluded.updated_at
     ${guard}`;

  const params: any[] = [
    datasetId,
    String(journal.id),
    journal.openDate ?? '',
    journal.stockCode ?? '',
    journal.stockName ?? '',
    journal.status ?? 'submitted',
    journal.snapshotId ?? null,
    journal.recordId ?? null,
    typeof journal.sortOrder === 'number' && Number.isFinite(journal.sortOrder) ? journal.sortOrder : null,
    journalPayload(journal),
    journal.createdAt ?? now,
    now,
  ];
  if (guardToken !== null) params.push(guardToken);
  return db.prepare(sql).bind(...params);
}

function journalFromRow(row: any): any {
  // 列字段 + payload 余量重新拼成完整对象；sort_order 以列为准
  return {
    id: row.id,
    openDate: row.open_date,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    status: row.status,
    snapshotId: row.snapshot_id ?? undefined,
    recordId: row.record_id ?? undefined,
    createdAt: row.created_at,
    ...JSON.parse(row.payload || '{}'),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
  };
}

export async function getJournals(db: any, datasetId: string): Promise<{ journals: any[]; version: number }> {
  const [versionRow, rows] = await Promise.all([
    db.prepare('SELECT version FROM journal_datasets WHERE dataset_id = ?1').bind(datasetId).first(),
    db
      .prepare('SELECT * FROM journals WHERE dataset_id = ?1 ORDER BY created_at ASC, id ASC')
      .bind(datasetId)
      .all(),
  ]);
  const journals: any[] = [];
  for (const row of rows?.results ?? []) {
    try {
      journals.push(journalFromRow(row));
    } catch (e) {
      // 单行损坏不应拖垮整表读取，但要留下可定位的日志
      console.error('journal row parse failed:', datasetId, row.id, e);
    }
  }
  return { journals, version: typeof versionRow?.version === 'number' ? versionRow.version : 0 };
}

/** 按 id 取指定日志（冲突重放只回传受影响的行，避免整表传输） */
export async function getJournalsByIds(db: any, datasetId: string, ids: string[]): Promise<any[]> {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id))];
  if (unique.length === 0) return [];
  const rows: any[] = [];
  for (const part of chunk(unique)) {
    const placeholders = part.map((_, i) => `?${i + 2}`).join(',');
    const result = await db
      .prepare(`SELECT * FROM journals WHERE dataset_id = ?1 AND id IN (${placeholders})`)
      .bind(datasetId, ...part)
      .all();
    rows.push(...(result?.results ?? []));
  }
  return rows.map(journalFromRow);
}

export interface JournalPageOptions {
  limit?: number;
  cursor?: string | null;
  /** 页码分页：与 cursor 互斥，传了 offset 就按 LIMIT/OFFSET 取页（界面需要跳页） */
  offset?: number | null;
  status?: string | null;
  fromDay?: string | null;
  toDay?: string | null;
  code?: string | null;
  sort?: 'asc' | 'desc';
  /**
   * 排序方式：
   * - date（默认）：按开单日 / created_at / id，支持游标
   * - manual：「当前交易」视图的手动顺序，按 sort_order 升序（同序时按日期倒序）；
   *   该模式只用 offset 分页，不回传游标
   */
  orderBy?: 'date' | 'manual';
}

/**
 * 日志分页。
 * 排序键：开单日（YYYYMMDD）→ created_at → id；
 * 游标格式 `${day}|${created_at}|${id}`，不含竖线，可安全放在 query string 里。
 * cursor 与 offset 二选一：offset 模式直接跳页，不再回传游标。
 */
export async function getJournalPage(
  db: any,
  datasetId: string,
  options: JournalPageOptions = {},
): Promise<{ journals: any[]; version: number; nextCursor: string | null; total: number }> {
  const limit = clampLimit(options.limit);
  const sort = options.sort === 'asc' ? 'asc' : 'desc';
  const dir = sort.toUpperCase();
  const day = dayExpr('open_date');

  const where: string[] = ['dataset_id = ?'];
  const params: any[] = [datasetId];

  if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }
  if (options.fromDay) {
    const fromDay = normalizeDay(options.fromDay);
    if (fromDay) {
      where.push(`${day} >= ?`);
      params.push(fromDay);
    }
  }
  if (options.toDay) {
    const toDay = normalizeDay(options.toDay);
    if (toDay) {
      where.push(`${day} <= ?`);
      params.push(toDay);
    }
  }
  if (options.code) {
    where.push('stock_code LIKE ?');
    params.push(`%${options.code}%`);
  }

  const filters = where.join(' AND ');
  const [versionRow, totalRow] = await Promise.all([
    db.prepare('SELECT version FROM journal_datasets WHERE dataset_id = ?1').bind(datasetId).first(),
    db.prepare(`SELECT COUNT(*) AS c FROM journals WHERE ${filters}`).bind(...params).first(),
  ]);

  const pageWhere = [...where];
  const pageParams = [...params];
  const offsetValue = Number(options.offset);
  const offset = Number.isFinite(offsetValue) && offsetValue > 0 ? Math.trunc(offsetValue) : 0;
  // 手动排序只用于「当前交易」，方向固定，不支持游标（与 offset 一样按页取）
  const manual = options.orderBy === 'manual';
  // offset 模式用于页码跳转，此时忽略游标（两种翻页方式不能混用）
  const cursor = offset > 0 || manual ? null : parseCursor(options.cursor ?? null, 3);
  if (cursor) {
    const keyset = keysetWhere([day, 'created_at', 'id'], cursor, sort);
    pageWhere.push(keyset.sql);
    pageParams.push(...keyset.params);
  }

  const orderSql = manual
    ? `sort_order ASC, ${day} DESC, created_at DESC, id DESC`
    : `${day} ${dir}, created_at ${dir}, id ${dir}`;

  const rows = await db
    .prepare(
      `SELECT * FROM journals
        WHERE ${pageWhere.join(' AND ')}
        ORDER BY ${orderSql}
        LIMIT ?${offset > 0 ? ' OFFSET ?' : ''}`,
    )
    .bind(...pageParams, limit + 1, ...(offset > 0 ? [offset] : []))
    .all();

  const raw = rows?.results ?? [];
  const hasMore = raw.length > limit;
  const pageRows = hasMore ? raw.slice(0, limit) : raw;
  const journals: any[] = [];
  for (const row of pageRows) {
    try {
      journals.push(journalFromRow(row));
    } catch (e) {
      console.error('journal row parse failed:', datasetId, row.id, e);
    }
  }

  const last = pageRows[pageRows.length - 1];
  const nextCursor = !manual && offset === 0 && hasMore && last
    ? makeCursor([
        String(last.open_date ?? '').replace(/-/g, '').slice(0, 8),
        last.created_at,
        last.id,
      ])
    : null;

  return {
    journals,
    version: typeof versionRow?.version === 'number' ? versionRow.version : 0,
    nextCursor,
    total: Number(totalRow?.c ?? 0),
  };
}

export type ApplyOpsResult =
  | { ok: true; version: number }
  | { ok: false; version: number; journals: any[] };

/** 提交一批增量操作；版本冲突时不写入，回传服务端最新数据供客户端重放 */
export async function applyJournalOps(
  db: any,
  datasetId: string,
  baseVersion: number,
  ops: any[],
): Promise<ApplyOpsResult> {
  if (!Array.isArray(ops) || ops.length === 0) {
    const row = await db.prepare('SELECT version FROM journal_datasets WHERE dataset_id = ?1').bind(datasetId).first();
    return { ok: true, version: typeof row?.version === 'number' ? row.version : 0 };
  }

  const now = nowIso();
  const nextVersion = baseVersion + 1;
  const token = crypto.randomUUID();

  const statements: any[] = [
    db
      .prepare('INSERT INTO journal_datasets (dataset_id, version, write_token, updated_at) VALUES (?1, 0, ?2, ?3) ON CONFLICT(dataset_id) DO NOTHING')
      .bind(datasetId, token, now),
    db
      .prepare(
        'UPDATE journal_datasets SET version = version + 1, write_token = ?2, updated_at = ?3 WHERE dataset_id = ?1 AND version = ?4',
      )
      .bind(datasetId, token, now, baseVersion),
  ];

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'delete' && typeof op.id === 'string') {
      statements.push(
        db
          .prepare(
            `DELETE FROM journals
             WHERE dataset_id = ?1 AND id = ?2
               AND (SELECT write_token FROM journal_datasets WHERE dataset_id = ?1) = ?3`,
          )
          .bind(datasetId, op.id, token),
      );
      continue;
    }
    if (op.op === 'upsert' && op.journal && typeof op.journal.id === 'string') {
      statements.push(buildUpsert(db, datasetId, op.journal, token));
    }
  }

  const results = await db.batch(statements);
  const bumped = results?.[1]?.meta?.changes ?? 0;
  if (bumped !== 1) {
    const versionRow = await db.prepare('SELECT version FROM journal_datasets WHERE dataset_id = ?1').bind(datasetId).first();
    const affectedIds = ops
      .map(op => (op?.op === 'delete' ? op.id : op?.journal?.id))
      .filter((id): id is string => typeof id === 'string');
    return {
      ok: false,
      version: typeof versionRow?.version === 'number' ? versionRow.version : 0,
      journals: await getJournalsByIds(db, datasetId, affectedIds),
    };
  }
  return { ok: true, version: nextVersion };
}

/** 旧版全量覆盖（兼容保留）：按 id 差量写入，不再整表删除重建 */
export async function replaceAllJournals(db: any, datasetId: string, journals: any[]): Promise<number> {
  const now = nowIso();
  const current = await getJournals(db, datasetId);
  const nextVersion = current.version + 1;
  const token = crypto.randomUUID();
  const incoming = journals.filter(j => j && typeof j.id === 'string');
  const keep = new Set(incoming.map((j: any) => String(j.id)));

  const existingRows = await db.prepare('SELECT id FROM journals WHERE dataset_id = ?1').bind(datasetId).all();
  const staleIds = (existingRows?.results ?? [])
    .map((r: any) => String(r.id))
    .filter((id: string) => !keep.has(id));

  const statements: any[] = [
    db
      .prepare('INSERT INTO journal_datasets (dataset_id, version, write_token, updated_at) VALUES (?1, 0, ?2, ?3) ON CONFLICT(dataset_id) DO NOTHING')
      .bind(datasetId, token, now),
    db
      .prepare('UPDATE journal_datasets SET version = ?2, write_token = ?3, updated_at = ?4 WHERE dataset_id = ?1')
      .bind(datasetId, nextVersion, token, now),
  ];
  for (const journal of incoming) statements.push(buildUpsert(db, datasetId, journal, null));
  for (const ids of chunk(staleIds)) {
    statements.push(
      db
        .prepare(`DELETE FROM journals WHERE dataset_id = ?1 AND id IN (${ids.map((_, i) => `?${i + 2}`).join(',')})`)
        .bind(datasetId, ...ids),
    );
  }
  await db.batch(statements);
  return nextVersion;
}

export type SaveCollectionResult<T> =
  | { ok: true; version: number }
  | { ok: false; version: number; items: T };

/** 抢占 meta 表的版本号；baseVersion 为 null 时强制写入（兼容旧客户端） */
function buildMetaPrologue(
  db: any,
  table: string,
  datasetId: string,
  baseVersion: number | null,
  nextVersion: number,
  token: string,
  now: string,
): any[] {
  const seed = db
    .prepare(
      `INSERT INTO ${table} (dataset_id, version, write_token, updated_at) VALUES (?1, 0, ?2, ?3)
       ON CONFLICT(dataset_id) DO NOTHING`,
    )
    .bind(datasetId, token, now);
  const bump =
    baseVersion === null
      ? db
          .prepare(`UPDATE ${table} SET version = ?2, write_token = ?3, updated_at = ?4 WHERE dataset_id = ?1`)
          .bind(datasetId, nextVersion, token, now)
      : db
          .prepare(
            `UPDATE ${table} SET version = version + 1, write_token = ?2, updated_at = ?3
             WHERE dataset_id = ?1 AND version = ?4`,
          )
          .bind(datasetId, token, now, baseVersion);
  return [seed, bump];
}

async function readMetaVersion(db: any, table: string, datasetId: string): Promise<number> {
  const row = await db.prepare(`SELECT version FROM ${table} WHERE dataset_id = ?1`).bind(datasetId).first();
  return typeof row?.version === 'number' ? row.version : 0;
}

export async function getSnapshots(db: any, datasetId: string): Promise<{ snapshots: any[]; version: number }> {
  const [rows, version] = await Promise.all([
    db
      .prepare('SELECT snapshot_id, version, stages, created_at FROM journal_snapshots WHERE dataset_id = ?1 ORDER BY version ASC')
      .bind(datasetId)
      .all(),
    readMetaVersion(db, 'journal_snapshot_meta', datasetId),
  ]);
  const snapshots: any[] = [];
  for (const row of rows?.results ?? []) {
    try {
      snapshots.push({
        snapshotId: row.snapshot_id,
        version: row.version,
        stages: JSON.parse(row.stages),
        createdAt: row.created_at,
      });
    } catch (e) {
      console.error('snapshot row parse failed:', datasetId, row.snapshot_id, e);
    }
  }
  return { snapshots, version };
}

/**
 * 快照集合是全量语义（客户端按内容哈希去重后整体提交）。
 * 关系库里按 id 差量：只 upsert 内容变化的快照，只删除不再被引用的快照，
 * 不做「整表删除 + 全量插入」。
 * 并发：journal_snapshot_meta 上的 version + write_token 做单事务 CAS。
 */
export async function replaceSnapshots(
  db: any,
  datasetId: string,
  snapshots: any[],
  baseVersion: number | null = null,
): Promise<SaveCollectionResult<any[]>> {
  const now = nowIso();
  const token = crypto.randomUUID();
  const incoming = snapshots.filter(s => s && typeof s.snapshotId === 'string');
  const keep = new Set(incoming.map((s: any) => String(s.snapshotId)));

  const [currentVersion, rows] = await Promise.all([
    readMetaVersion(db, 'journal_snapshot_meta', datasetId),
    db
      .prepare('SELECT snapshot_id, version, stages, created_at FROM journal_snapshots WHERE dataset_id = ?1')
      .bind(datasetId)
      .all(),
  ]);
  const existing = new Map<string, any>();
  for (const row of rows?.results ?? []) existing.set(String(row.snapshot_id), row);

  const nextVersion = currentVersion + 1;
  const statements: any[] = buildMetaPrologue(db, 'journal_snapshot_meta', datasetId, baseVersion, nextVersion, token, now);
  const guardWhere = 'WHERE (SELECT write_token FROM journal_snapshot_meta WHERE dataset_id = ?1) = ?7';

  for (const snap of incoming) {
    const stagesJson = JSON.stringify(snap.stages ?? []);
    const version = typeof snap.version === 'number' ? snap.version : 0;
    const createdAt = snap.createdAt ?? now;
    const prev = existing.get(snap.snapshotId);
    // 内容未变则不写，避免无意义的行写入
    if (prev && prev.version === version && prev.stages === stagesJson && prev.created_at === createdAt) continue;
    statements.push(
      db
        .prepare(
          `INSERT INTO journal_snapshots (dataset_id, snapshot_id, version, stages, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(dataset_id, snapshot_id) DO UPDATE SET
             version = excluded.version,
             stages = excluded.stages,
             created_at = excluded.created_at
           ${guardWhere}`,
        )
        .bind(datasetId, snap.snapshotId, version, stagesJson, createdAt, datasetId, token),
    );
  }

  const staleIds = [...existing.keys()].filter(id => !keep.has(id));
  for (const ids of chunk(staleIds)) {
    const placeholders = ids.map((_, i) => `?${i + 3}`).join(',');
    statements.push(
      db
        .prepare(
          `DELETE FROM journal_snapshots
            WHERE dataset_id = ?1 AND snapshot_id IN (${placeholders})
              AND (SELECT write_token FROM journal_snapshot_meta WHERE dataset_id = ?2) = ?${ids.length + 3}`,
        )
        .bind(datasetId, datasetId, ...ids, token),
    );
  }

  const results = await db.batch(statements);
  const bumped = results?.[1]?.meta?.changes ?? 0;
  if (baseVersion !== null && bumped !== 1) {
    const latest = await getSnapshots(db, datasetId);
    return { ok: false, version: latest.version, items: latest.snapshots };
  }
  return { ok: true, version: nextVersion };
}

export async function getWatchlist(db: any, datasetId: string): Promise<{ watchlist: string[]; version: number }> {
  const [rows, version] = await Promise.all([
    db.prepare('SELECT name FROM journal_watchlist WHERE dataset_id = ?1 ORDER BY position ASC').bind(datasetId).all(),
    readMetaVersion(db, 'journal_watchlist_meta', datasetId),
  ]);
  return { watchlist: (rows?.results ?? []).map((r: any) => String(r.name)), version };
}

/**
 * 「后续可关注」是有序列表，用 position 做键做差量：
 * 逐个位置 upsert，再把超出新长度的尾部删掉，不做整表删除重建。
 * 并发：journal_watchlist_meta 上的 version + write_token 做单事务 CAS。
 */
export async function replaceWatchlist(
  db: any,
  datasetId: string,
  watchlist: string[],
  baseVersion: number | null = null,
): Promise<SaveCollectionResult<string[]>> {
  const now = nowIso();
  const token = crypto.randomUUID();
  const names = watchlist.map(name => String(name));
  const currentVersion = await readMetaVersion(db, 'journal_watchlist_meta', datasetId);
  const nextVersion = currentVersion + 1;

  const statements: any[] = buildMetaPrologue(db, 'journal_watchlist_meta', datasetId, baseVersion, nextVersion, token, now);

  names.forEach((name, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO journal_watchlist (dataset_id, position, name) VALUES (?1, ?2, ?3)
           ON CONFLICT(dataset_id, position) DO UPDATE SET name = excluded.name
           WHERE (SELECT write_token FROM journal_watchlist_meta WHERE dataset_id = ?1) = ?4`,
        )
        .bind(datasetId, index, name, token),
    );
  });
  statements.push(
    db
      .prepare(
        `DELETE FROM journal_watchlist
          WHERE dataset_id = ?1 AND position >= ?2
            AND (SELECT write_token FROM journal_watchlist_meta WHERE dataset_id = ?1) = ?3`,
      )
      .bind(datasetId, names.length, token),
  );

  const results = await db.batch(statements);
  const bumped = results?.[1]?.meta?.changes ?? 0;
  if (baseVersion !== null && bumped !== 1) {
    const latest = await getWatchlist(db, datasetId);
    return { ok: false, version: latest.version, items: latest.watchlist };
  }
  return { ok: true, version: nextVersion };
}

/** 迁移用：批量写入一段日志（不做版本守卫），按 chunk 拆分避免超长事务 */
export async function upsertJournalsForMigration(
  db: any,
  datasetId: string,
  journals: any[],
  chunkSize = 40,
): Promise<void> {
  for (let i = 0; i < journals.length; i += chunkSize) {
    const chunk = journals.slice(i, i + chunkSize);
    await db.batch(chunk.map(journal => buildUpsert(db, datasetId, journal, null)));
  }
}

/** 迁移用：把数据集版本对齐到 R2 中的版本号 */
export async function setDatasetVersion(db: any, datasetId: string, version: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO journal_datasets (dataset_id, version, write_token, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(dataset_id) DO UPDATE SET
         version = excluded.version,
         write_token = excluded.write_token,
         updated_at = excluded.updated_at`,
    )
    .bind(datasetId, version, crypto.randomUUID(), nowIso())
    .run();
}

/** 迁移用：统计 D1 中已就位的数据量 */
export async function countJournals(db: any, datasetId: string): Promise<{ journals: number; snapshots: number; watchlist: number }> {
  const [j, s, w] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM journals WHERE dataset_id = ?1').bind(datasetId).first(),
    db.prepare('SELECT COUNT(*) AS c FROM journal_snapshots WHERE dataset_id = ?1').bind(datasetId).first(),
    db.prepare('SELECT COUNT(*) AS c FROM journal_watchlist WHERE dataset_id = ?1').bind(datasetId).first(),
  ]);
  return {
    journals: Number(j?.c ?? 0),
    snapshots: Number(s?.c ?? 0),
    watchlist: Number(w?.c ?? 0),
  };
}

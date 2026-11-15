// 数据集仓储
// 关系库写法：创建是一条 INSERT，列表只读未软删的行。
// 删除采用「软删除 + 后台分批清理」：
//   - 前端不再提供删除入口，删除只能由数据库操作把 deleted_at 置位；
//   - 之后由管理端点按 500 行一批清理子表，避免单事务删掉上万行导致超时或占用写配额。
import { DATASET_SCOPED_TABLES } from './schema';

export async function listDatasets(db: any): Promise<any[]> {
  const rows = await db
    .prepare('SELECT id, name, created_at FROM datasets WHERE deleted_at IS NULL ORDER BY created_at ASC')
    .all();
  return (rows?.results ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

export async function createDataset(db: any, name: string): Promise<any> {
  const dataset = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
  await db
    .prepare('INSERT INTO datasets (id, name, created_at) VALUES (?, ?, ?)')
    .bind(dataset.id, dataset.name, dataset.createdAt)
    .run();
  return dataset;
}

function countRemainingSql(): string {
  const parts = DATASET_SCOPED_TABLES.map(table => `(SELECT COUNT(*) FROM ${table} WHERE dataset_id = ?)`);
  return `SELECT ${parts.join(' + ')} AS remaining`;
}

async function countRemaining(db: any, datasetId: string): Promise<number> {
  const params = DATASET_SCOPED_TABLES.map(() => datasetId);
  const row = await db.prepare(countRemainingSql()).bind(...params).first();
  return Number(row?.remaining ?? 0);
}

export type PurgeResult =
  | { ok: false; reason: 'not_found' | 'not_marked' }
  | { ok: true; done: boolean; remaining: number; deletedThisRound: number };

/**
 * 分批清理一个已被软删除的数据集。
 * limit 为每张表单次最多删除的行数（默认 500）。
 */
export async function purgeDatasetChunk(db: any, datasetId: string, limit = 500): Promise<PurgeResult> {
  const row = await db
    .prepare('SELECT id FROM datasets WHERE id = ? AND deleted_at IS NOT NULL')
    .bind(datasetId)
    .first();
  if (!row) {
    const exists = await db.prepare('SELECT id FROM datasets WHERE id = ?').bind(datasetId).first();
    return { ok: false, reason: exists ? 'not_marked' : 'not_found' };
  }

  const statements = DATASET_SCOPED_TABLES.map(table =>
    db
      .prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE dataset_id = ? LIMIT ?)`)
      .bind(datasetId, limit),
  );
  const results = await db.batch(statements);
  const deletedThisRound = results.reduce((sum: number, item: any) => sum + (item?.meta?.changes ?? 0), 0);

  const remaining = await countRemaining(db, datasetId);
  if (remaining === 0) {
    await db.prepare('DELETE FROM datasets WHERE id = ?').bind(datasetId).run();
    return { ok: true, done: true, remaining: 0, deletedThisRound };
  }
  return { ok: true, done: false, remaining, deletedThisRound };
}

/** 迁移用：把 R2 的 datasets.json 写入 D1（按 id upsert，不删除 D1 多出来的数据集） */
export async function upsertDatasetsForMigration(db: any, datasets: any[]): Promise<number> {
  const valid = (Array.isArray(datasets) ? datasets : []).filter(d => d && typeof d.id === 'string');
  if (valid.length === 0) return 0;
  await db.batch(
    valid.map(d =>
      db
        .prepare(
          `INSERT INTO datasets (id, name, created_at) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at`,
        )
        .bind(String(d.id), d.name ?? '', d.createdAt ?? ''),
    ),
  );
  return valid.length;
}

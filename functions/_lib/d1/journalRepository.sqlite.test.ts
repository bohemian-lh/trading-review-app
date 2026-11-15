// 日志分页与「当前交易」手动排序的本地 SQLite 集成测试
// 覆盖：手动序号排序（未定序回退日期倒序）、offset 页码分页不重不漏、
//       upsert 写入/保留序号、新建与回退的行自动排到末尾。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { applyJournalOps, getJournalPage } from './journalRepository';

const DATASET = 'ds-journal';

function createD1Like(db: DatabaseSync) {
  const prepare = (sql: string) => {
    const statement = {
      params: [] as any[],
      bind(...params: any[]) {
        statement.params = params;
        return statement;
      },
      async all() {
        return { results: db.prepare(sql).all(...statement.params), success: true, meta: {} };
      },
      async first() {
        return db.prepare(sql).get(...statement.params) ?? null;
      },
      async run() {
        const info = db.prepare(sql).run(...statement.params);
        return { results: [], success: true, meta: { changes: Number(info.changes) } };
      },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements: any[]) {
      const out: any[] = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    },
  };
}

function setup() {
  const db = new DatabaseSync(':memory:');
  const entries = JSON.parse(readFileSync(join(__dirname, 'schema.json'), 'utf8')) as { sql: string }[];
  for (const entry of entries) db.exec(entry.sql);

  db.prepare('INSERT INTO journal_datasets (dataset_id, version, write_token, updated_at) VALUES (?, 0, ?, ?)')
    .run(DATASET, 'token', '');

  const insert = db.prepare(
    `INSERT INTO journals (dataset_id, id, open_date, stock_code, stock_name, status, snapshot_id, record_id, sort_order, payload, created_at, updated_at)
     VALUES (?, ?, ?, '', '', ?, NULL, NULL, ?, '{}', ?, '')`,
  );
  // 三条已手动排序（10/20/30）的 draft，两条从未排序的 draft，一条已提交日志
  insert.run(DATASET, 'd1', '2024-01-10', 'draft', 30, '2024-01-10T01:00:00.000Z');
  insert.run(DATASET, 'd2', '2024-01-09', 'draft', 10, '2024-01-09T01:00:00.000Z');
  insert.run(DATASET, 'd3', '2024-01-08', 'draft', 20, '2024-01-08T01:00:00.000Z');
  insert.run(DATASET, 'n1', '2024-01-05', 'draft', 0, '2024-01-05T01:00:00.000Z');
  insert.run(DATASET, 'n2', '2024-01-04', 'draft', 0, '2024-01-04T01:00:00.000Z');
  insert.run(DATASET, 's1', '2024-01-03', 'submitted', 0, '2024-01-03T01:00:00.000Z');

  return { db, d1: createD1Like(db) };
}

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT version FROM journal_datasets WHERE dataset_id = ?').get(DATASET) as any;
  return Number(row?.version ?? 0);
}

function sortOrderOf(db: DatabaseSync, id: string): number | null {
  const row = db.prepare('SELECT sort_order FROM journals WHERE dataset_id = ? AND id = ?').get(DATASET, id) as any;
  return typeof row?.sort_order === 'number' ? row.sort_order : null;
}

const ids = (page: { journals: any[] }) => page.journals.map(j => j.id);

describe('journalRepository / 手动排序与页码分页', () => {
  it('order=manual：按序号升序，未定序（0）的按日期倒序', async () => {
    const { db, d1 } = setup();
    const page = await getJournalPage(d1 as any, DATASET, { limit: 10, status: 'draft', orderBy: 'manual' });
    expect(ids(page)).toEqual(['n1', 'n2', 'd2', 'd3', 'd1']);
    expect(page.total).toBe(5);
    expect(page.nextCursor).toBeNull();
    expect(db).toBeTruthy();
  });

  it('order=manual 下 offset 翻页不重不漏', async () => {
    const { d1 } = setup();
    const p1 = await getJournalPage(d1 as any, DATASET, { limit: 2, offset: 0, status: 'draft', orderBy: 'manual' });
    const p2 = await getJournalPage(d1 as any, DATASET, { limit: 2, offset: 2, status: 'draft', orderBy: 'manual' });
    const p3 = await getJournalPage(d1 as any, DATASET, { limit: 2, offset: 4, status: 'draft', orderBy: 'manual' });
    const all = [...ids(p1), ...ids(p2), ...ids(p3)];
    expect(all).toEqual(['n1', 'n2', 'd2', 'd3', 'd1']);
    expect(new Set(all).size).toBe(all.length);
  });

  it('默认按日期排序，已存储日志不受手动排序影响', async () => {
    const { d1 } = setup();
    const page = await getJournalPage(d1 as any, DATASET, { limit: 10, status: 'submitted' });
    expect(ids(page)).toEqual(['s1']);
  });

  it('upsert 写入 sortOrder，未传序号时保留原值', async () => {
    const { db, d1 } = setup();
    await applyJournalOps(d1 as any, DATASET, currentVersion(db), [
      { op: 'upsert', journal: { id: 'd3', openDate: '2024-01-08', status: 'draft', sortOrder: 25 } },
    ]);
    expect(sortOrderOf(db, 'd3')).toBe(25);

    // 客户端只改内容、不带序号：不能把已有序号清空
    await applyJournalOps(d1 as any, DATASET, currentVersion(db), [
      { op: 'upsert', journal: { id: 'd3', openDate: '2024-01-08', status: 'draft', stockName: '改名' } },
    ]);
    expect(sortOrderOf(db, 'd3')).toBe(25);
  });

  it('新建「当前交易」未带序号时排到末尾（MAX + 10）', async () => {
    const { db, d1 } = setup();
    await applyJournalOps(d1 as any, DATASET, currentVersion(db), [
      { op: 'upsert', journal: { id: 'd4', openDate: '2024-01-11', status: 'draft' } },
    ]);
    expect(sortOrderOf(db, 'd4')).toBe(40);
    const page = await getJournalPage(d1 as any, DATASET, { limit: 10, status: 'draft', orderBy: 'manual' });
    expect(ids(page)).toEqual(['n1', 'n2', 'd2', 'd3', 'd1', 'd4']);
  });

  it('已存储日志回退到「当前交易」时排到末尾', async () => {
    const { db, d1 } = setup();
    await applyJournalOps(d1 as any, DATASET, currentVersion(db), [
      { op: 'upsert', journal: { id: 's1', openDate: '2024-01-03', status: 'draft' } },
    ]);
    expect(sortOrderOf(db, 's1')).toBe(40);
    const page = await getJournalPage(d1 as any, DATASET, { limit: 10, status: 'draft', orderBy: 'manual' });
    expect(ids(page).pop()).toBe('s1');
  });
});

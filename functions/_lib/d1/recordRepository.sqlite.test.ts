// 记录分页 SQL 的本地 SQLite 集成测试
// 覆盖：日期归一化入参、交易类型 / 趋势特征 / 模式特征过滤、键集游标翻页不重不漏、页码分页与月份筛选项。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRecordsPage, getRecordsMeta, replaceAllRecords } from './recordRepository';

const DATASET = 'ds-page';

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
    // batch 里的语句都是写操作，必须走 run 才能拿到 changes（版本守卫依赖它）
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

  const insert = db.prepare(
    `INSERT INTO records (dataset_id, id, open_date, stock_code, stock_name, trading_type, pre_market,
       has_mistake, profit_percent, hold_days, position_size, has_cycle_stats, has_monthly_stats,
       cycle_id, image_prefix, remark, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '', '否', 1, 2, 33, 0, 0, NULL, '', '', ?, '')`,
  );

  const rows = [
    { id: 'r1', day: '2024-01-01', code: '600000', type: 'A', trend: ['上涨'], pattern: ['系统'] },
    { id: 'r2', day: '2024-01-02', code: '600001', type: 'B', trend: ['下跌'], pattern: ['非系统'] },
    { id: 'r3', day: '20240103', code: '600002', type: 'A', trend: ['上涨', '横盘'], pattern: ['系统'] },
    { id: 'r4', day: '2024-02-01', code: '300001', type: 'A', trend: ['横盘'], pattern: ['系统'] },
    { id: 'r5', day: '2024-02-02', code: '300002', type: 'B', trend: ['上涨'], pattern: ['系统'] },
  ];
  for (const row of rows) {
    insert.run(
      DATASET,
      row.id,
      row.day,
      row.code,
      `股票${row.id}`,
      row.type,
      JSON.stringify({ trendFeatures: row.trend, patternFeatures: row.pattern, images: [] }),
    );
  }
  db.prepare('INSERT INTO record_meta (dataset_id, version, write_token, updated_at) VALUES (?, 3, ?, ?)')
    .run(DATASET, 'token', '');

  return { db, d1: createD1Like(db) };
}

describe('recordRepository / 记录分页', () => {
  let db: DatabaseSync;
  let d1: ReturnType<typeof createD1Like>;

  beforeAll(() => {
    const setupResult = setup();
    db = setupResult.db;
    d1 = setupResult.d1;
  });

  it('按开单日归一化排序，同时兼容 2024-01-01 与 20240103', async () => {
    const page = await getRecordsPage(d1 as any, DATASET, { limit: 10, sort: 'asc' });
    expect(page.records.map((r: any) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(page.total).toBe(5);
    expect(page.version).toBe(3);
  });

  it('日期区间入参带横线也能正确比较', async () => {
    const page = await getRecordsPage(d1 as any, DATASET, {
      limit: 10,
      sort: 'asc',
      fromDay: '2024-01-03',
      toDay: '2024-02-01',
    });
    expect(page.records.map((r: any) => r.id)).toEqual(['r3', 'r4']);
    expect(page.total).toBe(2);
  });

  it('交易类型 / 趋势特征 / 模式特征过滤下推到 SQL', async () => {
    const byType = await getRecordsPage(d1 as any, DATASET, { limit: 10, tradingType: 'A' });
    expect(byType.records.map((r: any) => r.id).sort()).toEqual(['r1', 'r3', 'r4']);

    const byTrend = await getRecordsPage(d1 as any, DATASET, { limit: 10, trendFeature: '横盘' });
    expect(byTrend.records.map((r: any) => r.id).sort()).toEqual(['r3', 'r4']);

    const byPattern = await getRecordsPage(d1 as any, DATASET, { limit: 10, patternFeature: '非系统' });
    expect(byPattern.records.map((r: any) => r.id)).toEqual(['r2']);
  });

  it('键集游标翻页不重不漏', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const page = await getRecordsPage(d1 as any, DATASET, { limit: 2, sort: 'desc', cursor });
      seen.push(...page.records.map((r: any) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(['r5', 'r4', 'r3', 'r2', 'r1']);
    expect(new Set(seen).size).toBe(5);
  });

  it('总数随过滤条件变化，供前端显示真实总量', async () => {
    const page = await getRecordsPage(d1 as any, DATASET, { limit: 1, keyword: '60000' });
    expect(page.records).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('页码分页（offset）可直接跳页，并按股票代码排序', async () => {
    const middle = await getRecordsPage(d1 as any, DATASET, { limit: 2, offset: 2, sort: 'asc', sortKey: 'stockCode' });
    expect(middle.records.map((r: any) => r.id)).toEqual(['r1', 'r2']);
    // offset 模式不再回传游标，避免前后端混用两种翻页方式
    expect(middle.nextCursor).toBeNull();
    expect(middle.total).toBe(5);

    const last = await getRecordsPage(d1 as any, DATASET, { limit: 2, offset: 4, sort: 'asc', sortKey: 'stockCode' });
    expect(last.records.map((r: any) => r.id)).toEqual(['r3']);
  });

  it('首页元信息带月份筛选项与数据集全量条数', async () => {
    const meta = await getRecordsMeta(d1 as any, DATASET);
    expect(meta.months).toEqual(['202402', '202401']);
    expect(meta.datasetTotal).toBe(5);
  });
});

describe('recordRepository / 覆盖导入的集合语义', () => {
  const OTHER = 'ds-overwrite';

  function setupOverwrite() {
    const db = new DatabaseSync(':memory:');
    const entries = JSON.parse(readFileSync(join(__dirname, 'schema.json'), 'utf8')) as { sql: string }[];
    for (const entry of entries) db.exec(entry.sql);

    const insert = db.prepare(
      `INSERT INTO records (dataset_id, id, open_date, stock_code, stock_name, trading_type, pre_market,
         has_mistake, profit_percent, hold_days, position_size, has_cycle_stats, has_monthly_stats,
         cycle_id, image_prefix, remark, payload, updated_at)
       VALUES (?, ?, ?, '', '', 'A', '', '否', 1, 2, 33, 0, 0, NULL, '', '', '{}', '')`,
    );
    insert.run(OTHER, 'o1', '2024-01-01');
    insert.run(OTHER, 'o2', '2024-01-02');
    db.prepare('INSERT INTO monthly_analysis (dataset_id, month) VALUES (?, ?)').run(OTHER, '202401');
    db.prepare('INSERT INTO cycle_stats (dataset_id, stat_type, cycle_id) VALUES (?, ?, ?)').run(OTHER, '系统', 'cyc_1');
    db.prepare('INSERT INTO record_meta (dataset_id, version, write_token, updated_at) VALUES (?, 1, ?, ?)')
      .run(OTHER, 'token', '');

    return { db, d1: createD1Like(db) };
  }

  const countOf = (db: DatabaseSync, table: string) =>
    Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE dataset_id = ?`).get(OTHER) as any).c);

  it('未携带月度/周期集合时保持派生表不动', async () => {
    const { db, d1 } = setupOverwrite();

    const result = await replaceAllRecords(d1 as any, OTHER, {
      records: [{ id: 'o1', openDate: '2024-01-01', stockCode: '', tradingType: 'A' }],
    });

    expect(result.ok).toBe(true);
    expect(countOf(db, 'monthly_analysis')).toBe(1);
    expect(countOf(db, 'cycle_stats')).toBe(1);
    // 记录会按 id 差量删除：o2 不在列表里
    expect(countOf(db, 'records')).toBe(1);
  });

  it('显式传空集合才清空派生表', async () => {
    const { db, d1 } = setupOverwrite();

    const result = await replaceAllRecords(d1 as any, OTHER, {
      records: [{ id: 'o1', openDate: '2024-01-01', stockCode: '', tradingType: 'A' }],
      customMonthly: { useCustom: false, data: [] },
      cycleStats: {},
    });

    expect(result.ok).toBe(true);
    expect(countOf(db, 'monthly_analysis')).toBe(0);
    expect(countOf(db, 'cycle_stats')).toBe(0);
  });
});

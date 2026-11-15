// 统计 SQL 的本地 SQLite 集成测试
// 作用：在真实 SQLite 上跑一遍 statsRepository 生成的 SQL，
//       覆盖窗口函数分批、GROUP BY + ON CONFLICT、json 函数等最容易写错的语法。
// 注意：这是「SQL 语法/语义」测试，不模拟 D1 的函数白名单（power/sqrt/exp 在压测里已拆到 Worker）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getStats, recomputeStats } from './statsRepository';

/** 把 node:sqlite 适配成 statsRepository 需要的 D1 形状 */
function createD1Like(db: DatabaseSync) {
  const prepare = (sql: string) => {
    const statement = {
      params: [] as any[],
      bind(...params: any[]) {
        statement.params = params;
        return statement;
      },
      async all() {
        const rows = db.prepare(sql).all(...statement.params);
        return { results: rows, success: true, meta: {} };
      },
      async first() {
        const row = db.prepare(sql).get(...statement.params);
        return row ?? null;
      },
      async run() {
        const info = db.prepare(sql).run(...statement.params);
        return { success: true, meta: { changes: Number(info.changes) } };
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

const DATASET = 'ds-test';

function runSchema(db: DatabaseSync) {
  const raw = readFileSync(join(__dirname, 'schema.json'), 'utf8');
  const entries = JSON.parse(raw) as { sql: string }[];
  for (const entry of entries) db.exec(entry.sql);
}

function insertFixtures(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT INTO records (dataset_id, id, open_date, stock_code, stock_name, trading_type, pre_market,
       has_mistake, profit_percent, hold_days, position_size, has_cycle_stats, has_monthly_stats,
       cycle_id, image_prefix, remark, payload, updated_at)
     VALUES (?, ?, ?, '', '', ?, '', '否', ?, 2, 33, 0, 0, NULL, '', '', ?, '')`,
  );

  for (let i = 0; i < 40; i += 1) {
    const day = `2024-01-${String((i % 28) + 1).padStart(2, '0')}`;
    const payload = JSON.stringify({
      patternFeatures: ['系统'],
      trendFeatures: ['上涨'],
      images: [],
    });
    insert.run(
      DATASET,
      `r${String(i + 1).padStart(2, '0')}`,
      day,
      'A',
      i % 2 === 0 ? 2 : -1,
      payload,
    );
  }

  db.prepare(
    'INSERT INTO record_meta (dataset_id, version, write_token, updated_at) VALUES (?, 7, ?, ?)',
  ).run(DATASET, 'token', '');

  db.prepare(
    'INSERT INTO field_configs (dataset_id, payload, updated_at) VALUES (?, ?, ?)',
  ).run(
    DATASET,
    JSON.stringify({
      tradingTypes: ['A', '未知'],
      trendFeatures: ['上涨', '未知'],
      aggregateRules: [],
      theoreticalDimensions: [],
    }),
    '',
  );
}

describe('statsRepository / 周期统计 SQL', () => {
  let db: DatabaseSync;
  let d1: ReturnType<typeof createD1Like>;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    runSchema(db);
    insertFixtures(db);
    d1 = createD1Like(db);
  });

  it('按 30 条分批生成周期，并写清完整性', async () => {
    const result = await recomputeStats(d1 as any, DATASET, { kinds: ['cycle'] });
    expect(result.ok).toBe(true);

    const rows = db
      .prepare('SELECT cycle_id, record_count, is_complete, profit_sum, loss_sum, profit_ratio FROM cycle_stats WHERE dataset_id = ? AND stat_type = ? ORDER BY cycle_id')
      .all(DATASET, '系统') as any[];

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cycle_id: 'cyc_1', record_count: 30, is_complete: 1, profit_sum: 30, loss_sum: 15, profit_ratio: 2 });
    expect(rows[1]).toMatchObject({ cycle_id: 'cyc_2', record_count: 10, is_complete: 0, profit_sum: 10, loss_sum: 5, profit_ratio: 2 });
  });

  it('周期 ↔ 记录归属写入 cycle_records，且与周期数一致', async () => {
    const linked = db
      .prepare('SELECT COUNT(*) AS c FROM cycle_records WHERE dataset_id = ? AND stat_type = ?')
      .get(DATASET, '系统') as any;
    expect(Number(linked.c)).toBe(40);

    const perCycle = db
      .prepare('SELECT cycle_id, COUNT(*) AS c FROM cycle_records WHERE dataset_id = ? AND stat_type = ? GROUP BY cycle_id ORDER BY cycle_id')
      .all(DATASET, '系统') as any[];
    expect(perCycle.map(row => Number(row.c))).toEqual([30, 10]);
  });

  it('重复生成幂等：不产生重复周期', async () => {
    await recomputeStats(d1 as any, DATASET, { kinds: ['cycle'] });
    const count = db
      .prepare('SELECT COUNT(*) AS c FROM cycle_stats WHERE dataset_id = ?')
      .get(DATASET) as any;
    // 系统 / 系统无失误 / A / 上涨 各有 40 条 → 各 2 个周期；系统有失误、非系统无数据
    expect(Number(count.c)).toBe(8);
  });

  it('getStats 一次取回周期统计与生成时间', async () => {
    const stats = await getStats(d1 as any, DATASET);
    expect(stats.cycleStats['系统']).toHaveLength(2);
    expect(typeof stats.cycleStatsGeneratedAt).toBe('number');
  });

  it('重算以当前版本为基线：结果表 source_version 跟随最新版本', async () => {
    db.prepare('UPDATE record_meta SET version = version + 1 WHERE dataset_id = ?').run(DATASET);
    const current = Number(
      (db.prepare('SELECT version FROM record_meta WHERE dataset_id = ?').get(DATASET) as any).version,
    );

    const result = await recomputeStats(d1 as any, DATASET, { kinds: ['overview'] });
    expect(result.ok).toBe(true);

    const overview = db.prepare('SELECT source_version FROM stat_overview WHERE dataset_id = ?').get(DATASET) as any;
    expect(Number(overview.source_version)).toBe(current);
  });

  it('统计落后于记录时返回 staleKinds，重算后清空', async () => {
    // 先重算到当前版本，确保基线是“最新”
    await recomputeStats(d1 as any, DATASET, { kinds: ['overview', 'month', 'cycle'] });
    const fresh = await getStats(d1 as any, DATASET);
    expect(fresh.staleKinds).not.toContain('overview');
    expect(fresh.staleKinds).not.toContain('month');

    // 推进记录版本：结果表落后
    db.prepare('UPDATE record_meta SET version = version + 1 WHERE dataset_id = ?').run(DATASET);
    const stale = await getStats(d1 as any, DATASET);
    expect(stale.staleKinds).toContain('overview');
    expect(stale.staleKinds).toContain('month');

    // 重算后恢复干净
    await recomputeStats(d1 as any, DATASET, { kinds: ['overview', 'month', 'cycle'] });
    const restored = await getStats(d1 as any, DATASET);
    expect(restored.staleKinds).not.toContain('overview');
    expect(restored.staleKinds).not.toContain('month');
  });

  it('周期记录归属可按需从 cycle_records 回填', async () => {
    const stats = await getStats(d1 as any, DATASET, { withRecordIds: true });
    const cycles = stats.cycleStats['系统'] ?? [];
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].recordIds.length).toBe(cycles[0].recordCount);

    const plain = await getStats(d1 as any, DATASET);
    expect((plain.cycleStats['系统'] ?? [])[0].recordIds).toEqual([]);
  });
});

describe('statsRepository / 总览与月度 SQL', () => {
  it('总览、月度、默认维度能在真实 SQLite 上算完', async () => {
    const db = new DatabaseSync(':memory:');
    runSchema(db);
    insertFixtures(db);
    const d1 = createD1Like(db);

    const result = await recomputeStats(d1 as any, DATASET, { kinds: ['overview', 'month', 'dimension'] });
    expect(result.ok).toBe(true);

    const overview = db.prepare('SELECT * FROM stat_overview WHERE dataset_id = ?').get(DATASET) as any;
    expect(Number(overview.record_count)).toBe(40);
    expect(Number(overview.profit_count)).toBe(20);
    expect(Number(overview.loss_count)).toBe(20);
    // 系统维度：+30 / -15 → 2
    expect(Number(overview.system_profit_ratio)).toBe(2);

    const month = db.prepare('SELECT * FROM stat_month WHERE dataset_id = ?').get(DATASET) as any;
    expect(month.month).toBe('202401');

    const dims = db.prepare("SELECT config_id FROM analysis_results WHERE dataset_id = ? AND config_kind = 'dimension'").all(DATASET) as any[];
    // 默认维度 = 总 / 系统 / 非系统 + 配置里的交易类型
    expect(dims.map(row => row.config_id).sort()).toEqual(['A', '总', '系统', '非系统']);
  });
});

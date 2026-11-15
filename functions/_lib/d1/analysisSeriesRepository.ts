// 分析系列仓储（分析页签 analysis-tabs 与压测对比 stress-series 共用）
// 两个功能的类型结构完全一致（id / name / groups / createdAt），用 kind 区分：
//   kind = 'tab' | 'stress'
// 关系库写法：主表按 id upsert，子表按「系列」为单位比对后只重写变化的系列，
// 不做整表删除重建。
// 并发：series_meta(dataset_id, kind) 上的 version + write_token 做单事务 CAS，
// 两个页面同时改动时只有一个生效，另一个拿到 409 后重放。
const KINDS = ['tab', 'stress'];

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

/** 组签名：用于判断某个系列的 groups 是否需要重写 */
function groupSignature(groups: any[]): string {
  return JSON.stringify(
    groups.map((g, index) => ({
      seq: index,
      mode: g?.mode === 'exclude' ? 'exclude' : 'merge',
      source: typeof g?.source === 'string' ? g.source : 'profitPercent',
      filter: g?.filter ?? {},
    })),
  );
}

const SERIES_GUARD_WHERE = 'WHERE (SELECT write_token FROM series_meta WHERE dataset_id = ? AND kind = ?) = ?';
const SERIES_GUARD_AND = 'AND (SELECT write_token FROM series_meta WHERE dataset_id = ? AND kind = ?) = ?';

export async function getSeries(db: any, datasetId: string, kind: string): Promise<{ series: any[]; version: number }> {
  const [metaRow, rows, groupRows] = await Promise.all([
    db.prepare('SELECT version FROM series_meta WHERE dataset_id = ? AND kind = ?').bind(datasetId, kind).first(),
    db
      .prepare('SELECT id, name, position, created_at FROM analysis_series WHERE dataset_id = ? AND kind = ? ORDER BY position ASC, created_at ASC')
      .bind(datasetId, kind)
      .all(),
    db
      .prepare('SELECT series_id, seq, mode, source, filter FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? ORDER BY series_id ASC, seq ASC')
      .bind(datasetId, kind)
      .all(),
  ]);

  const groupsBySeries = new Map<string, any[]>();
  for (const row of groupRows?.results ?? []) {
    const list = groupsBySeries.get(row.series_id) ?? [];
    list.push({
      mode: row.mode === 'exclude' ? 'exclude' : 'merge',
      source: row.source,
      filter: parseJson(row.filter, {}),
    });
    groupsBySeries.set(row.series_id, list);
  }

  return {
    series: (rows?.results ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      groups: groupsBySeries.get(row.id) ?? [],
    })),
    version: typeof metaRow?.version === 'number' ? metaRow.version : 0,
  };
}

export type SaveSeriesResult =
  | { ok: true; version: number }
  | { ok: false; version: number; series: any[] };

/**
 * 保存整份系列集合（客户端按全量提交）。
 * baseVersion 为 null 时退化为「强制写入」（兼容尚未带版本的旧客户端）。
 */
export async function saveSeries(
  db: any,
  datasetId: string,
  kind: string,
  series: any[],
  baseVersion: number | null = null,
): Promise<SaveSeriesResult> {
  if (!KINDS.includes(kind)) throw new Error(`unsupported series kind: ${kind}`);
  const now = nowIso();
  const token = crypto.randomUUID();
  const incoming = (Array.isArray(series) ? series : []).filter(s => s && typeof s.id === 'string');
  const keep = new Set(incoming.map((s: any) => String(s.id)));

  const [metaRow, existingRows, existingGroupRows] = await Promise.all([
    db.prepare('SELECT version FROM series_meta WHERE dataset_id = ? AND kind = ?').bind(datasetId, kind).first(),
    db.prepare('SELECT id, name, position, created_at FROM analysis_series WHERE dataset_id = ? AND kind = ?').bind(datasetId, kind).all(),
    db
      .prepare('SELECT series_id, seq, mode, source, filter FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? ORDER BY series_id ASC, seq ASC')
      .bind(datasetId, kind)
      .all(),
  ]);

  const currentVersion = typeof metaRow?.version === 'number' ? metaRow.version : 0;
  const nextVersion = currentVersion + 1;

  const seed = db
    .prepare(
      `INSERT INTO series_meta (dataset_id, kind, version, write_token, updated_at) VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(dataset_id, kind) DO NOTHING`,
    )
    .bind(datasetId, kind, token, now);

  // 版本守卫：抢占成功才继续，失败时后续所有写入都会因为 token 不匹配而变成 no-op
  const bump =
    baseVersion === null
      ? db
          .prepare('UPDATE series_meta SET version = ?, write_token = ?, updated_at = ? WHERE dataset_id = ? AND kind = ?')
          .bind(nextVersion, token, now, datasetId, kind)
      : db
          .prepare(
            'UPDATE series_meta SET version = version + 1, write_token = ?, updated_at = ? WHERE dataset_id = ? AND kind = ? AND version = ?',
          )
          .bind(token, now, datasetId, kind, baseVersion);

  const statements: any[] = [seed, bump];

  const existingById = new Map<string, any>();
  for (const row of existingRows?.results ?? []) existingById.set(String(row.id), row);

  const existingGroups = new Map<string, any[]>();
  for (const row of existingGroupRows?.results ?? []) {
    const list = existingGroups.get(String(row.series_id)) ?? [];
    list.push({
      seq: row.seq,
      mode: row.mode === 'exclude' ? 'exclude' : 'merge',
      source: row.source,
      filter: row.filter,
    });
    existingGroups.set(String(row.series_id), list);
  }

  incoming.forEach((item: any, position: number) => {
    const groups = Array.isArray(item.groups) ? item.groups : [];
    const prev = existingById.get(String(item.id));
    const rowChanged =
      !prev ||
      prev.name !== (item.name ?? '') ||
      prev.position !== position ||
      Number(prev.created_at) !== Number(item.createdAt ?? 0);

    if (rowChanged) {
      statements.push(
        db
          .prepare(
            `INSERT INTO analysis_series (dataset_id, kind, id, name, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(dataset_id, kind, id) DO UPDATE SET
               name = excluded.name,
               position = excluded.position,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at
             ${SERIES_GUARD_WHERE}`,
          )
          .bind(datasetId, kind, String(item.id), item.name ?? '', position, Math.trunc(Number(item.createdAt ?? 0)), now, datasetId, kind, token),
      );
    }

    // 组：只在该系列的组内容变化时才重写它自己的组，不波及其他系列
    const prevGroups = (existingGroups.get(String(item.id)) ?? []).map(g => ({
      mode: g.mode,
      source: g.source,
      filter: parseJson(g.filter, {}),
    }));
    if (prev && groupSignature(prevGroups) === groupSignature(groups)) return;

    statements.push(
      db
        .prepare(`DELETE FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? AND series_id = ? ${SERIES_GUARD_AND}`)
        .bind(datasetId, kind, String(item.id), datasetId, kind, token),
    );
    groups.forEach((group: any, seq: number) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO analysis_series_groups (dataset_id, kind, series_id, seq, mode, source, filter)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE (SELECT write_token FROM series_meta WHERE dataset_id = ? AND kind = ?) = ?`,
          )
          .bind(
            datasetId,
            kind,
            String(item.id),
            seq,
            group?.mode === 'exclude' ? 'exclude' : 'merge',
            typeof group?.source === 'string' ? group.source : 'profitPercent',
            JSON.stringify(group?.filter ?? {}),
            datasetId,
            kind,
            token,
          ),
      );
    });
  });

  const staleIds = [...existingById.keys()].filter(id => !keep.has(id));
  for (const id of staleIds) {
    statements.push(
      db
        .prepare(`DELETE FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? AND series_id = ? ${SERIES_GUARD_AND}`)
        .bind(datasetId, kind, id, datasetId, kind, token),
    );
    statements.push(
      db
        .prepare(`DELETE FROM analysis_series WHERE dataset_id = ? AND kind = ? AND id = ? ${SERIES_GUARD_AND}`)
        .bind(datasetId, kind, id, datasetId, kind, token),
    );
  }

  const results = await db.batch(statements);
  const bumped = results?.[1]?.meta?.changes ?? 0;
  if (baseVersion !== null && bumped !== 1) {
    const latest = await getSeries(db, datasetId, kind);
    return { ok: false, version: latest.version, series: latest.series };
  }
  return { ok: true, version: nextVersion };
}

/** 迁移用：直接写入一个系列的整行与组 */
export async function upsertSeriesForMigration(db: any, datasetId: string, kind: string, series: any[]): Promise<void> {
  const now = nowIso();
  const statements: any[] = [];
  series.forEach((item: any, position: number) => {
    if (!item || typeof item.id !== 'string') return;
    statements.push(
      db
        .prepare(
          `INSERT INTO analysis_series (dataset_id, kind, id, name, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(dataset_id, kind, id) DO UPDATE SET
             name = excluded.name, position = excluded.position,
             created_at = excluded.created_at, updated_at = excluded.updated_at`,
        )
        .bind(datasetId, kind, String(item.id), item.name ?? '', position, Math.trunc(Number(item.createdAt ?? 0)), now),
    );
    const groups = Array.isArray(item.groups) ? item.groups : [];
    groups.forEach((group: any, seq: number) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO analysis_series_groups (dataset_id, kind, series_id, seq, mode, source, filter)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(dataset_id, kind, series_id, seq) DO UPDATE SET
               mode = excluded.mode, source = excluded.source, filter = excluded.filter`,
          )
          .bind(
            datasetId,
            kind,
            String(item.id),
            seq,
            group?.mode === 'exclude' ? 'exclude' : 'merge',
            typeof group?.source === 'string' ? group.source : 'profitPercent',
            JSON.stringify(group?.filter ?? {}),
          ),
      );
    });
    // 组数量变少时删掉多余序号
    statements.push(
      db
        .prepare('DELETE FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? AND series_id = ? AND seq >= ?')
        .bind(datasetId, kind, String(item.id), groups.length),
    );
  });

  // 迁移是全量语义，先把该 kind 下不存在的系列清掉
  const keep = new Set(series.filter((s: any) => s && typeof s.id === 'string').map((s: any) => String(s.id)));
  const existing = await db.prepare('SELECT id FROM analysis_series WHERE dataset_id = ? AND kind = ?').bind(datasetId, kind).all();
  for (const row of existing?.results ?? []) {
    const id = String(row.id);
    if (keep.has(id)) continue;
    statements.push(db.prepare('DELETE FROM analysis_series_groups WHERE dataset_id = ? AND kind = ? AND series_id = ?').bind(datasetId, kind, id));
    statements.push(db.prepare('DELETE FROM analysis_series WHERE dataset_id = ? AND kind = ? AND id = ?').bind(datasetId, kind, id));
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO series_meta (dataset_id, kind, version, write_token, updated_at) VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(dataset_id, kind) DO UPDATE SET version = series_meta.version + 1, updated_at = excluded.updated_at`,
      )
      .bind(datasetId, kind, crypto.randomUUID(), now),
  );

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
}

export async function countSeries(db: any, datasetId: string): Promise<{ tabs: number; stress: number }> {
  const rows = await db
    .prepare('SELECT kind, COUNT(*) AS c FROM analysis_series WHERE dataset_id = ? GROUP BY kind')
    .bind(datasetId)
    .all();
  const result = { tabs: 0, stress: 0 };
  for (const row of rows?.results ?? []) {
    if (row.kind === 'tab') result.tabs = Number(row.c ?? 0);
    if (row.kind === 'stress') result.stress = Number(row.c ?? 0);
  }
  return result;
}

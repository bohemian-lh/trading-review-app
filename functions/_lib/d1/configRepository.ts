// 字段配置仓储
// 配置是「整体读、整体写」的单个文档，服务端从不按字段查询，因此保持一行 JSON：
// 拆成多张子表只会把一次原子写变成多次跨表写，且没有查询收益。
// 并发：field_configs 单行上的 version + write_token 做 CAS（一条语句完成校验与写入）。
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

export async function getConfig(db: any, datasetId: string): Promise<{ config: any | null; version: number }> {
  const row = await db
    .prepare('SELECT payload, version FROM field_configs WHERE dataset_id = ?')
    .bind(datasetId)
    .first();
  if (!row) return { config: null, version: 0 };
  return { config: parseJson(row.payload, null), version: typeof row.version === 'number' ? row.version : 0 };
}

export type SaveConfigResult =
  | { ok: true; version: number }
  | { ok: false; version: number; config: any | null };

/**
 * 保存整份配置。
 * baseVersion 为 null 时退化为「强制写入」（兼容尚未带版本的旧客户端）。
 */
export async function saveConfig(
  db: any,
  datasetId: string,
  config: any,
  baseVersion: number | null = null,
): Promise<SaveConfigResult> {
  const now = nowIso();
  const token = crypto.randomUUID();
  const payload = JSON.stringify(config ?? {});

  const statements: any[] = [
    db
      .prepare(
        `INSERT INTO field_configs (dataset_id, version, write_token, payload, updated_at)
         VALUES (?, 0, ?, '{}', ?) ON CONFLICT(dataset_id) DO NOTHING`,
      )
      .bind(datasetId, token, now),
  ];

  if (baseVersion === null) {
    statements.push(
      db
        .prepare(
          `INSERT INTO field_configs (dataset_id, version, write_token, payload, updated_at)
           VALUES (?, 1, ?, ?, ?)
           ON CONFLICT(dataset_id) DO UPDATE SET
             version = field_configs.version + 1,
             write_token = excluded.write_token,
             payload = excluded.payload,
             updated_at = excluded.updated_at`,
        )
        .bind(datasetId, token, payload, now),
    );
  } else {
    // 版本守卫：只有版本仍是客户端读取时的值才写入
    statements.push(
      db
        .prepare(
          `UPDATE field_configs
              SET version = version + 1, write_token = ?, payload = ?, updated_at = ?
            WHERE dataset_id = ? AND version = ?`,
        )
        .bind(token, payload, now, datasetId, baseVersion),
    );
  }

  const results = await db.batch(statements);
  const changed = results?.[1]?.meta?.changes ?? 0;

  if (baseVersion !== null && changed !== 1) {
    const latest = await getConfig(db, datasetId);
    return { ok: false, version: latest.version, config: latest.config };
  }
  if (baseVersion !== null) return { ok: true, version: baseVersion + 1 };

  const latest = await getConfig(db, datasetId);
  return { ok: true, version: latest.version };
}

/** 迁移用：保留 R2 中的版本号 */
export async function saveConfigForMigration(db: any, datasetId: string, config: any, version: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO field_configs (dataset_id, version, write_token, payload, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(dataset_id) DO UPDATE SET
         version = excluded.version,
         write_token = excluded.write_token,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .bind(datasetId, version, crypto.randomUUID(), JSON.stringify(config ?? {}), nowIso())
    .run();
}

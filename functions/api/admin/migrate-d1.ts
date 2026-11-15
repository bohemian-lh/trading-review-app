// /api/admin/migrate-d1
// 作用：把 R2 上的结构化数据迁移到 D1（日志 / 记录 / 配置 / 分析系列 / 数据集）。
// 保护：必须配置 MIGRATE_SECRET，并在请求头带 x-migrate-secret。
//
// 用法（维护窗口内、客户端写入冻结后执行）：
//   GET  /api/admin/migrate-d1
//        查看各数据集在 R2 / D1 的数量
//   POST /api/admin/migrate-d1?stage=journals&dataset=<id>[&offset=&limit=]
//   POST /api/admin/migrate-d1?stage=records&dataset=<id>[&offset=&limit=]
//   POST /api/admin/migrate-d1?stage=config&dataset=<id>
//   POST /api/admin/migrate-d1?stage=series&dataset=<id>
//   POST /api/admin/migrate-d1?stage=datasets
//   POST /api/admin/migrate-d1?stage=cleanup-r2&dataset=<id>[&dryRun=1]
//        切到 d1 且确认运行正常后，清理该数据集在 R2 上的结构化 JSON（不碰上传的文件）
//   POST /api/admin/migrate-d1?stage=purge&dataset=<id>[&limit=500]
//        分批清理已软删除的数据集，反复调用直到 done=true
//
// 幂等：所有写入都是 upsert / 按主键差量，可重复执行。
// 限额：D1 每 Worker 调用最多 50 条查询（免费）/ 1000 条（付费），
//       因此日志与记录默认 limit=40，免费计划请勿调大。
import {
  ensureSchemaOnce,
} from '../../_lib/d1/schema';
import {
  upsertJournalsForMigration,
  replaceSnapshots,
  replaceWatchlist,
  setDatasetVersion,
  countJournals,
} from '../../_lib/d1/journalRepository';
import {
  upsertRecordsForMigration,
  setRecordMetaForMigration,
  upsertCustomAnalysisForMigration,
  replaceMonthlyForMigration,
  replaceCycleStatsForMigration,
  countRecords,
} from '../../_lib/d1/recordRepository';
import { saveConfigForMigration } from '../../_lib/d1/configRepository';
import { upsertSeriesForMigration, countSeries } from '../../_lib/d1/analysisSeriesRepository';
import { upsertDatasetsForMigration, purgeDatasetChunk } from '../../_lib/d1/datasetRepository';
import { shouldUseD1 } from '../../_lib/d1/store';

const DEFAULT_LIMIT = 40;

export async function onRequest(context: any) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-migrate-secret',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const secret = env.MIGRATE_SECRET;
  if (!secret) {
    return json({ success: false, error: '未配置 MIGRATE_SECRET，无法执行迁移' }, 503, corsHeaders);
  }
  if (request.headers.get('x-migrate-secret') !== secret) {
    return json({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
  }
  if (!env.D1SQL) {
    return json({ success: false, error: '未绑定 D1SQL 数据库' }, 503, corsHeaders);
  }

  try {
    if (request.method === 'GET') return await handleStatus(env, corsHeaders);
    if (request.method === 'POST') return await handleMigrate(request, env, corsHeaders);
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('migrate-d1 error:', e);
    return json({ success: false, error: e.message || 'Internal error' }, 500, corsHeaders);
  }
}

// ─── 状态 ──────────────────────────────────────────────────────
async function handleStatus(env: any, corsHeaders: any) {
  await ensureSchemaOnce(env.D1SQL);
  const datasets = await listDatasetIds(env);

  const results = [];
  for (const datasetId of datasets) {
    const r2Journals = await readR2Journals(env, datasetId);
    const r2Snapshots = await readR2Array(env, `journal-snapshots/${datasetId}.json`);
    const r2Watchlist = await readR2Array(env, `trading-journals/${datasetId}-watchlist.json`);
    const r2Records = await readR2Records(env, datasetId);
    const r2Tabs = await readR2Array(env, `trading-data/${datasetId}/analysis-tabs.json`);
    const r2Stress = await readR2Array(env, `trading-data/${datasetId}/stress-series.json`);
    const r2Config = await readR2Object(env, `trading-data/${datasetId}/field-config.json`);

    const [journalCount, recordCount, seriesCount] = await Promise.all([
      countJournals(env.D1SQL, datasetId),
      countRecords(env.D1SQL, datasetId),
      countSeries(env.D1SQL, datasetId),
    ]);

    results.push({
      datasetId,
      r2: {
        journals: r2Journals.journals.length,
        journalVersion: r2Journals.version,
        snapshots: r2Snapshots.length,
        watchlist: r2Watchlist.length,
        records: r2Records.records.length,
        monthly: Array.isArray(r2Records.customMonthly?.data) ? r2Records.customMonthly.data.length : 0,
        cycleStats: countCycleStats(r2Records.cycleStats),
        tabs: r2Tabs.length,
        stress: r2Stress.length,
        config: r2Config ? 1 : 0,
      },
      d1: { ...journalCount, ...recordCount, tabs: seriesCount.tabs, stress: seriesCount.stress },
    });
  }

  return json({ success: true, store: shouldUseD1(env) ? 'd1' : 'r2', datasets: results }, 200, corsHeaders);
}

// ─── 迁移 ──────────────────────────────────────────────────────
async function handleMigrate(request: any, env: any, corsHeaders: any) {
  const url = new URL(request.url);
  const stage = url.searchParams.get('stage') ?? 'journals';
  const datasetId = url.searchParams.get('dataset');
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

  await ensureSchemaOnce(env.D1SQL);

  if (stage === 'datasets') {
    const datasets = await readR2Array(env, 'trading-data/datasets.json');
    const count = await upsertDatasetsForMigration(env.D1SQL, datasets);
    return json({ success: true, stage, done: true, migrated: count }, 200, corsHeaders);
  }

  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, corsHeaders);
  }

  if (stage === 'journals') return await migrateJournals(env, datasetId, offset, limit, corsHeaders);
  if (stage === 'records') return await migrateRecords(env, datasetId, offset, limit, corsHeaders);
  if (stage === 'config') return await migrateConfig(env, datasetId, corsHeaders);
  if (stage === 'series') return await migrateSeries(env, datasetId, corsHeaders);
  if (stage === 'cleanup-r2') {
    return await cleanupR2(env, datasetId, url.searchParams.get('dryRun') === '1', corsHeaders);
  }
  if (stage === 'purge') {
    const purgeLimit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit') ?? 500) || 500));
    return await purgeDataset(env, datasetId, purgeLimit, corsHeaders);
  }

  return json({ success: false, error: `unknown stage: ${stage}` }, 400, corsHeaders);
}

/**
 * 分批清理已软删除的数据集。
 * 前端不允许删除数据集，删除流程是：
 *   1. 数据库里 UPDATE datasets SET deleted_at = ... WHERE id = '...';
 *   2. 反复调用本阶段直到 done=true（每次每张表最多删 limit 行）。
 */
async function purgeDataset(env: any, datasetId: string, limit: number, corsHeaders: any) {
  const result = await purgeDatasetChunk(env.D1SQL, datasetId, limit);
  if (!result.ok) {
    const message =
      result.reason === 'not_found'
        ? '数据集不存在'
        : '数据集未标记 deleted_at，请先在数据库中软删除';
    return json({ success: false, stage: 'purge', datasetId, error: message }, 400, corsHeaders);
  }
  return json({ success: true, stage: 'purge', datasetId, ...result }, 200, corsHeaders);
}

/**
 * 清理已迁移到 D1 的 R2 结构化 JSON。
 * 只删这 7 个已知 key，不碰 trading-data/{id}/ 下用户上传的表格与图片。
 */
function structuredR2Keys(datasetId: string): string[] {
  return [
    `trading-data/${datasetId}/records.json`,
    `trading-data/${datasetId}/field-config.json`,
    `trading-data/${datasetId}/analysis-tabs.json`,
    `trading-data/${datasetId}/stress-series.json`,
    `trading-journals/${datasetId}.json`,
    `trading-journals/${datasetId}-watchlist.json`,
    `journal-snapshots/${datasetId}.json`,
  ];
}

async function cleanupR2(env: any, datasetId: string, dryRun: boolean, corsHeaders: any) {
  // 只有真正切到 D1 之后才允许删 R2，避免把线上唯一数据源删掉
  if (!shouldUseD1(env)) {
    return json(
      { success: false, error: '当前 DATA_STORE 未切到 d1，拒绝清理 R2 数据' },
      409,
      corsHeaders,
    );
  }

  const keys = structuredR2Keys(datasetId);
  const existing: string[] = [];
  for (const key of keys) {
    const head = await env.R2_BUCKET.head(key);
    if (head) existing.push(key);
  }

  if (dryRun) {
    return json({ success: true, stage: 'cleanup-r2', datasetId, dryRun: true, wouldDelete: existing }, 200, corsHeaders);
  }

  for (const key of existing) {
    await env.R2_BUCKET.delete(key);
  }
  return json({ success: true, stage: 'cleanup-r2', datasetId, deleted: existing }, 200, corsHeaders);
}

async function migrateJournals(env: any, datasetId: string, offset: number, limit: number, corsHeaders: any) {
  const r2 = await readR2Journals(env, datasetId);
  const slice = r2.journals.slice(offset, offset + limit);
  await upsertJournalsForMigration(env.D1SQL, datasetId, slice);

  const nextOffset = offset + slice.length;
  if (nextOffset < r2.journals.length) {
    return json(
      { success: true, stage: 'journals', datasetId, done: false, migrated: slice.length, nextOffset, total: r2.journals.length },
      200,
      corsHeaders,
    );
  }

  const snapshots = await readR2Array(env, `journal-snapshots/${datasetId}.json`);
  const watchlist = await readR2Array(env, `trading-journals/${datasetId}-watchlist.json`);
  await replaceSnapshots(env.D1SQL, datasetId, snapshots);
  await replaceWatchlist(env.D1SQL, datasetId, watchlist.map((v: any) => String(v)));
  await setDatasetVersion(env.D1SQL, datasetId, r2.version);

  return json(
    {
      success: true,
      stage: 'journals',
      datasetId,
      done: true,
      version: r2.version,
      r2: { journals: r2.journals.length, snapshots: snapshots.length, watchlist: watchlist.length },
      d1: await countJournals(env.D1SQL, datasetId),
    },
    200,
    corsHeaders,
  );
}

async function migrateRecords(env: any, datasetId: string, offset: number, limit: number, corsHeaders: any) {
  const r2 = await readR2Records(env, datasetId);
  const slice = r2.records.slice(offset, offset + limit);
  await upsertRecordsForMigration(env.D1SQL, datasetId, slice);

  const nextOffset = offset + slice.length;
  if (nextOffset < r2.records.length) {
    return json(
      { success: true, stage: 'records', datasetId, done: false, migrated: slice.length, nextOffset, total: r2.records.length },
      200,
      corsHeaders,
    );
  }

  const monthly = Array.isArray(r2.customMonthly?.data) ? r2.customMonthly.data : [];
  if (r2.customAnalysis) await upsertCustomAnalysisForMigration(env.D1SQL, datasetId, r2.customAnalysis);
  await replaceMonthlyForMigration(env.D1SQL, datasetId, monthly);
  await replaceCycleStatsForMigration(env.D1SQL, datasetId, r2.cycleStats ?? {});
  await setRecordMetaForMigration(
    env.D1SQL,
    datasetId,
    typeof r2.version === 'number' ? r2.version : 0,
    !!r2.customMonthly?.useCustom,
    typeof r2.cycleStatsGeneratedAt === 'number' ? r2.cycleStatsGeneratedAt : null,
  );

  return json(
    {
      success: true,
      stage: 'records',
      datasetId,
      done: true,
      version: r2.version,
      r2: { records: r2.records.length, monthly: monthly.length, cycleStats: countCycleStats(r2.cycleStats) },
      d1: await countRecords(env.D1SQL, datasetId),
    },
    200,
    corsHeaders,
  );
}

async function migrateConfig(env: any, datasetId: string, corsHeaders: any) {
  const config = await readR2Object(env, `trading-data/${datasetId}/field-config.json`);
  if (!config) {
    return json({ success: true, stage: 'config', datasetId, done: true, migrated: 0 }, 200, corsHeaders);
  }
  await saveConfigForMigration(env.D1SQL, datasetId, config, 1);
  return json({ success: true, stage: 'config', datasetId, done: true, migrated: 1 }, 200, corsHeaders);
}

async function migrateSeries(env: any, datasetId: string, corsHeaders: any) {
  const tabs = await readR2Array(env, `trading-data/${datasetId}/analysis-tabs.json`);
  const stress = await readR2Array(env, `trading-data/${datasetId}/stress-series.json`);
  await upsertSeriesForMigration(env.D1SQL, datasetId, 'tab', tabs);
  await upsertSeriesForMigration(env.D1SQL, datasetId, 'stress', stress);
  return json(
    { success: true, stage: 'series', datasetId, done: true, r2: { tabs: tabs.length, stress: stress.length }, d1: await countSeries(env.D1SQL, datasetId) },
    200,
    corsHeaders,
  );
}

// ─── R2 读取辅助 ────────────────────────────────────────────────
async function listDatasetIds(env: any): Promise<string[]> {
  const ids = new Set<string>(['default']);
  try {
    const datasets = await readR2Array(env, 'trading-data/datasets.json');
    for (const item of datasets) {
      if (item && typeof item.id === 'string') ids.add(item.id);
    }
  } catch {
    // 读不到数据集列表时只迁 default
  }
  return [...ids];
}

async function readR2Journals(env: any, datasetId: string): Promise<{ journals: any[]; version: number }> {
  const data = await readR2Object(env, `trading-journals/${datasetId}.json`);
  if (!data) return { journals: [], version: 0 };
  if (Array.isArray(data)) return { journals: data, version: 0 };
  return {
    journals: Array.isArray(data?.journals) ? data.journals : [],
    version: typeof data?.version === 'number' ? data.version : 0,
  };
}

async function readR2Records(env: any, datasetId: string): Promise<any> {
  const data = await readR2Object(env, `trading-data/${datasetId}/records.json`);
  if (!data) return { records: [], version: 0 };
  const records = Array.isArray(data) ? data : (data.records ?? []);
  return {
    records: Array.isArray(records) ? records : [],
    version: typeof data?.version === 'number' ? data.version : 0,
    customAnalysis: data?.customAnalysis,
    customMonthly: data?.customMonthly,
    cycleStats: data?.cycleStats,
    cycleStatsGeneratedAt: data?.cycleStatsGeneratedAt,
  };
}

async function readR2Object(env: any, key: string): Promise<any> {
  try {
    const obj = await env.R2_BUCKET.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

async function readR2Array(env: any, key: string): Promise<any[]> {
  const data = await readR2Object(env, key);
  return Array.isArray(data) ? data : [];
}

function countCycleStats(cycleStats: any): number {
  if (!cycleStats || typeof cycleStats !== 'object') return 0;
  return Object.values(cycleStats).reduce<number>((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

function json(data: any, status: number, headers: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

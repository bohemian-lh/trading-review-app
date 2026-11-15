// /api/records?dataset=<id>[&limit=20&cursor=<openDate|id>]
// GET  → 键集分页：{ success, records, nextCursor, store }
//        首页（无 cursor）额外返回 version / total / customAnalysis / customMonthly / cycleStats / cycleStatsGeneratedAt
// POST → 增量：{ baseVersion, upserts, deletes, customAnalysis?, monthlyUpserts?, monthlyDeletes?,
//                monthlyUseCustom?, cycleStatsUpserts?, cycleStatsDeletes?, cycleStatsGeneratedAt? }
//        兼容旧版全量：{ records, version, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt }
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
import { ensureSchemaReady } from '../_lib/d1/schema';
import {
  getRecordsPage,
  getRecordsMeta,
  applyRecordChanges,
  replaceAllRecords,
} from '../_lib/d1/recordRepository';
import { shouldUseD1 } from '../_lib/d1/store';

const DEFAULT_PAGE_SIZE = 20;

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, corsHeaders);
  }

  try {
    if (shouldUseD1(env)) {
      await ensureSchemaReady(env);
      return await handleD1(env.D1SQL, request, url, datasetId, corsHeaders);
    }
    return await handleR2(env, request, datasetId, corsHeaders);
  } catch (e: any) {
    console.error('Records API error:', e);
    return json({ success: false, error: 'Internal error', details: e.message }, 500, corsHeaders);
  }
}

// ─── D1 ────────────────────────────────────────────────────────────
async function handleD1(db: any, request: any, url: URL, datasetId: string, corsHeaders: any) {
  if (request.method === 'GET') {
    const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
    const cursor = url.searchParams.get('cursor');
    const page = await getRecordsPage(db, datasetId, limitParam, cursor);

    // 首页才带元信息与派生数据，后续页只传记录
    if (!cursor) {
      const meta = await getRecordsMeta(db, datasetId);
      return json({ success: true, ...meta, ...page, store: 'd1' }, 200, corsHeaders);
    }
    return json({ success: true, ...page, store: 'd1' }, 200, corsHeaders);
  }

  if (request.method === 'POST') {
    const body = await request.json();

    // 旧版全量覆盖优先识别：旧客户端会带上完整 records 数组
    if (Array.isArray(body?.records)) {
      const result = await replaceAllRecords(db, datasetId, body);
      if (!result.ok) {
        return json({ success: false, conflict: true, ...result.snapshot, store: 'd1' }, 409, corsHeaders);
      }
      return json({ success: true, message: 'Records saved', version: result.version, store: 'd1' }, 200, corsHeaders);
    }

    if (isIncrementalBody(body)) {
      const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : 0;
      const result = await applyRecordChanges(
        db,
        datasetId,
        baseVersion,
        {
          upserts: body.upserts,
          deletes: body.deletes,
          customAnalysis: body.customAnalysis,
          monthlyUpserts: body.monthlyUpserts,
          monthlyDeletes: body.monthlyDeletes,
          monthlyUseCustom: body.monthlyUseCustom,
          cycleStatsUpserts: body.cycleStatsUpserts,
          cycleStatsDeletes: body.cycleStatsDeletes,
          cycleStatsGeneratedAt: body.cycleStatsGeneratedAt,
        },
        // 分页之后不再回传整份记录，客户端只需要版本号重放
        false,
      );
      if (!result.ok) {
        return json({ success: false, conflict: true, version: result.version, store: 'd1' }, 409, corsHeaders);
      }
      return json({ success: true, message: 'Records saved', version: result.version, store: 'd1' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'records or upserts array is required' }, 400, corsHeaders);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
}

function isIncrementalBody(body: any): boolean {
  return (
    Array.isArray(body?.upserts) ||
    Array.isArray(body?.deletes) ||
    body?.customAnalysis !== undefined ||
    Array.isArray(body?.monthlyUpserts) ||
    Array.isArray(body?.monthlyDeletes) ||
    Array.isArray(body?.cycleStatsUpserts) ||
    Array.isArray(body?.cycleStatsDeletes) ||
    typeof body?.monthlyUseCustom === 'boolean' ||
    body?.cycleStatsGeneratedAt !== undefined
  );
}

/**
 * R2 回退路径的增量合并：R2 只能整对象覆盖，因此在服务端把增量合进现有文档再写回。
 * 这样客户端切到增量协议后，把 DATA_STORE 回滚成 r2 也不会丢数据。
 */
function mergeIncremental(stored: any, body: any): any {
  const records = new Map<string, any>();
  for (const record of stored?.records ?? []) {
    if (record && typeof record.id === 'string') records.set(record.id, record);
  }
  for (const record of body?.upserts ?? []) {
    if (record && typeof record.id === 'string') records.set(record.id, record);
  }
  for (const id of body?.deletes ?? []) records.delete(String(id));

  const customAnalysis = body?.customAnalysis ?? stored?.customAnalysis;
  let customMonthly = stored?.customMonthly ?? { useCustom: false, data: [] };

  if (body?.monthlyUpserts || body?.monthlyDeletes || typeof body?.monthlyUseCustom === 'boolean') {
    const byMonth = new Map<string, any>();
    for (const item of customMonthly?.data ?? []) {
      if (item && typeof item.month === 'string') byMonth.set(item.month, item);
    }
    for (const item of body?.monthlyUpserts ?? []) {
      if (item && typeof item.month === 'string') byMonth.set(item.month, item);
    }
    for (const month of body?.monthlyDeletes ?? []) byMonth.delete(String(month));
    customMonthly = {
      useCustom: typeof body?.monthlyUseCustom === 'boolean' ? body.monthlyUseCustom : !!customMonthly?.useCustom,
      data: [...byMonth.values()],
    };
  }

  let cycleStats = stored?.cycleStats ?? {};
  if (body?.cycleStatsUpserts || body?.cycleStatsDeletes) {
    const byKey = new Map<string, any>();
    for (const [statType, list] of Object.entries(cycleStats ?? {})) {
      for (const item of (Array.isArray(list) ? list : []) as any[]) {
        byKey.set(`${(item as any).statType ?? statType}::${(item as any).cycleId}`, {
          ...(item as any),
          statType: (item as any).statType ?? statType,
        });
      }
    }
    for (const item of body?.cycleStatsUpserts ?? []) {
      if (item && typeof item.cycleId === 'string') byKey.set(`${item.statType}::${item.cycleId}`, item);
    }
    for (const item of body?.cycleStatsDeletes ?? []) {
      byKey.delete(`${item?.statType}::${item?.cycleId}`);
    }
    const grouped: Record<string, any[]> = {};
    for (const item of byKey.values()) (grouped[item.statType] ||= []).push(item);
    cycleStats = grouped;
  }

  return {
    records: [...records.values()],
    customAnalysis,
    customMonthly,
    cycleStats,
    cycleStatsGeneratedAt:
      body?.cycleStatsGeneratedAt !== undefined ? body.cycleStatsGeneratedAt : stored?.cycleStatsGeneratedAt,
  };
}

// ─── R2（回滚用）────────────────────────────────────────────────────
async function handleR2(env: any, request: any, datasetId: string, corsHeaders: any) {
  const key = `trading-data/${datasetId}/records.json`;

  if (request.method === 'GET') {
    const object = await env.R2_BUCKET.get(key);
    if (!object) {
      return json({ success: true, records: [], nextCursor: null, total: 0, version: 0, store: 'r2' }, 200, corsHeaders);
    }
    const data = JSON.parse(await object.text());
    const records = Array.isArray(data) ? data : (data.records || []);
    return json(
      {
        success: true,
        records,
        nextCursor: null,
        total: Array.isArray(records) ? records.length : 0,
        version: data.version || 0,
        customAnalysis: data.customAnalysis,
        customMonthly: data.customMonthly,
        cycleStats: data.cycleStats,
        cycleStatsGeneratedAt: data.cycleStatsGeneratedAt,
        store: 'r2',
      },
      200,
      corsHeaders,
    );
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const object = await env.R2_BUCKET.get(key);
    const stored = object ? JSON.parse(await object.text()) : {};

    let next: any;
    if (Array.isArray(body?.records)) {
      // 旧版全量覆盖
      next = {
        records: body.records,
        customAnalysis: body.customAnalysis,
        customMonthly: body.customMonthly,
        cycleStats: body.cycleStats,
        cycleStatsGeneratedAt: body.cycleStatsGeneratedAt,
      };
    } else if (isIncrementalBody(body)) {
      // 增量：在服务端合并进现有文档，保证 R2 回滚路径同样可用
      next = mergeIncremental(stored, body);
    } else {
      return json({ success: false, error: 'records or upserts array is required' }, 400, corsHeaders);
    }

    const newVersion = Date.now();
    await env.R2_BUCKET.put(key, JSON.stringify({ ...next, version: newVersion }), {
      httpMetadata: { contentType: 'application/json' },
    });
    return json({ success: true, message: 'Records saved', version: newVersion, store: 'r2' }, 200, corsHeaders);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
}

function json(data: any, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

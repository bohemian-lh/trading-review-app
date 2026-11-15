// /api/records?dataset=<id>[&limit=50&offset=0|&cursor=<YYYYMMDD|id>&sort=asc|desc&sortKey=openDate|stockCode]
//        [&from=YYYYMMDD&to=YYYYMMDD&code=600519&keyword=茅台&tradingType=xxx
//         &trendFeature=xxx&patternFeature=xxx][&meta=1]
// GET  → 分页：{ success, records, nextCursor, total, version, store }
//        meta=1（首屏）额外返回 datasetTotal / months / customAnalysis / customMonthly / cycleStats
// POST → 增量：{ baseVersion, upserts, deletes, customAnalysis?, monthlyUpserts?, monthlyDeletes?,
//                monthlyUseCustom?, cycleStatsUpserts?, cycleStatsDeletes?, cycleStatsGeneratedAt? }
//        兼容旧版全量：{ records, version, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt }
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2（R2 在 Worker 内存里实现同一套过滤/排序/分页）。
import { ensureSchemaReady } from '../_lib/d1/schema';
import {
  getRecordsPage,
  getRecordsMeta,
  applyRecordChanges,
  replaceAllRecords,
} from '../_lib/d1/recordRepository';
import { normalizeDay, parsePageParams } from '../_lib/d1/pagination';
import { shouldUseD1 } from '../_lib/d1/store';
import { corsHeaders } from '../_lib/http/cors';

const DEFAULT_PAGE_SIZE = 50;
/** 跳页上限：防止 offset=1e9 触发整表扫描 */
const MAX_OFFSET = 200000;

interface PageRequest {
  limit: number;
  cursor: string | null;
  sort: 'asc' | 'desc';
  sortKey: 'openDate' | 'stockCode';
  offset: number;
  fromDay: string | null;
  toDay: string | null;
  code: string | null;
  keyword: string | null;
  tradingType: string | null;
  trendFeature: string | null;
  patternFeature: string | null;
  withMeta: boolean;
}

/** 解析分页参数；日期格式非法时返回错误而不是静默当成“不筛选” */
function parsePageRequest(url: URL): { request: PageRequest } | { error: string } {
  const pageParams = parsePageParams(url, 'desc', DEFAULT_PAGE_SIZE);
  const rawFrom = url.searchParams.get('from');
  const rawTo = url.searchParams.get('to');
  if (rawFrom && !normalizeDay(rawFrom)) return { error: 'from must be YYYYMMDD' };
  if (rawTo && !normalizeDay(rawTo)) return { error: 'to must be YYYYMMDD' };

  const offsetRaw = url.searchParams.get('offset');
  const offset = offsetRaw
    ? Math.min(MAX_OFFSET, Math.max(0, Math.trunc(Number(offsetRaw)) || 0))
    : 0;

  return {
    request: {
      ...pageParams,
      sortKey: url.searchParams.get('sortKey') === 'stockCode' ? 'stockCode' : 'openDate',
      offset,
      fromDay: url.searchParams.get('from'),
      toDay: url.searchParams.get('to'),
      code: url.searchParams.get('code'),
      keyword: url.searchParams.get('keyword'),
      tradingType: url.searchParams.get('tradingType'),
      trendFeature: url.searchParams.get('trendFeature'),
      patternFeature: url.searchParams.get('patternFeature'),
      // 元信息与派生数据只在首屏请求，筛选/排序不再重复拉整份 cycle_stats
      withMeta: url.searchParams.get('meta') === '1',
    },
  };
}

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, cors);
  }

  const parsed = request.method === 'GET' ? parsePageRequest(url) : null;
  if (parsed && 'error' in parsed) {
    return json({ success: false, error: parsed.error }, 400, cors);
  }

  try {
    if (shouldUseD1(env)) {
      await ensureSchemaReady(env);
      return await handleD1(env.D1SQL, request, parsed?.request ?? null, datasetId, cors);
    }
    return await handleR2(env, request, parsed?.request ?? null, datasetId, cors);
  } catch (e: any) {
    console.error('Records API error:', e);
    return json({ success: false, error: 'Internal error', details: e.message }, 500, cors);
  }
}

// ─── D1 ────────────────────────────────────────────────────────────
async function handleD1(db: any, request: any, page: PageRequest | null, datasetId: string, cors: any) {
  if (request.method === 'GET' && page) {
    const result = await getRecordsPage(db, datasetId, page);
    if (page.withMeta) {
      const meta = await getRecordsMeta(db, datasetId);
      return json({ success: true, ...meta, ...result, store: 'd1' }, 200, cors);
    }
    return json({ success: true, ...result, store: 'd1' }, 200, cors);
  }

  if (request.method === 'POST') {
    const body = await request.json();

    // 旧版全量覆盖优先识别：旧客户端会带上完整 records 数组
    if (Array.isArray(body?.records)) {
      const result = await replaceAllRecords(db, datasetId, body);
      if (!result.ok) {
        return json({ success: false, conflict: true, ...result.snapshot, store: 'd1' }, 409, cors);
      }
      return json(
        {
          success: true,
          message: 'Records saved',
          version: result.version,
          // 覆盖导入的真实影响面：写入多少、删掉多少
          replaced: result.replaced ?? 0,
          removed: result.removed ?? 0,
          store: 'd1',
        },
        200,
        cors,
      );
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
        return json({ success: false, conflict: true, version: result.version, store: 'd1' }, 409, cors);
      }
      return json({ success: true, message: 'Records saved', version: result.version, store: 'd1' }, 200, cors);
    }

    return json({ success: false, error: 'records or upserts array is required' }, 400, cors);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, cors);
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
/** 开单日归一化为 8 位数字，与 D1 的 dayExpr 保持一致 */
function toDayKey(value: unknown): string {
  return String(value ?? '').replace(/-/g, '').slice(0, 8);
}

/**
 * R2 回退路径：在 Worker 内存里实现与 D1 相同的过滤 / 排序 / 分页语义。
 * R2 只能整对象读写，但至少保证“新前端 + R2 后端”不会静默退化成一次拉全量。
 */
function pageRecordsInMemory(all: any[], page: PageRequest) {
  const fromDay = normalizeDay(page.fromDay);
  const toDay = normalizeDay(page.toDay);
  const keyword = page.keyword ? page.keyword.toLowerCase() : '';
  const code = page.code ?? '';

  const filtered = all.filter((r) => {
    const day = toDayKey(r?.openDate);
    if (fromDay && (!day || day < fromDay)) return false;
    if (toDay && (!day || day > toDay)) return false;
    if (code && !String(r?.stockCode ?? '').includes(code)) return false;
    if (page.tradingType && r?.tradingType !== page.tradingType) return false;
    if (page.trendFeature && !(Array.isArray(r?.trendFeatures) ? r.trendFeatures : []).includes(page.trendFeature)) return false;
    if (page.patternFeature && !(Array.isArray(r?.patternFeatures) ? r.patternFeatures : []).includes(page.patternFeature)) return false;
    if (keyword) {
      const hay = `${r?.stockCode ?? ''}${r?.stockName ?? ''}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });

  const byStock = page.sortKey === 'stockCode';
  const dir = page.sort === 'asc' ? 1 : -1;
  const sortValue = (r: any) => (byStock ? String(r?.stockCode ?? '') : toDayKey(r?.openDate));
  filtered.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av !== bv) return av < bv ? -dir : dir;
    const ai = String(a?.id ?? '');
    const bi = String(b?.id ?? '');
    if (ai === bi) return 0;
    return ai < bi ? -dir : dir;
  });

  let start = page.offset;
  if (page.cursor && start === 0) {
    const [value, id] = page.cursor.split('|');
    const index = filtered.findIndex(r => sortValue(r) === value && String(r?.id ?? '') === id);
    if (index >= 0) start = index + 1;
  }

  const rows = filtered.slice(start, start + page.limit);
  const hasMore = start + page.limit < filtered.length;
  const last = rows[rows.length - 1];
  return {
    records: rows,
    total: filtered.length,
    nextCursor: hasMore && last ? `${sortValue(last)}|${String(last?.id ?? '')}` : null,
  };
}

async function handleR2(env: any, request: any, page: PageRequest | null, datasetId: string, cors: any) {
  const key = `trading-data/${datasetId}/records.json`;

  if (request.method === 'GET') {
    const object = await env.R2_BUCKET.get(key);
    if (!object) {
      return json({ success: true, records: [], nextCursor: null, total: 0, version: 0, store: 'r2' }, 200, cors);
    }
    const data = JSON.parse(await object.text());
    const all: any[] = Array.isArray(data) ? data : (data.records || []);
    const result = page ? pageRecordsInMemory(all, page) : { records: all, total: all.length, nextCursor: null };

    if (!page?.withMeta) {
      return json({ success: true, ...result, version: data?.version || 0, store: 'r2' }, 200, cors);
    }

    // 首页元信息：数据集全量条数 + 月份选项 + 派生数据
    const months = [...new Set(all
      .map(r => toDayKey(r?.openDate).slice(0, 6))
      .filter(m => m.length === 6))]
      .sort()
      .reverse();

    return json(
      {
        success: true,
        ...result,
        version: data?.version || 0,
        datasetTotal: all.length,
        months,
        customAnalysis: data?.customAnalysis,
        customMonthly: data?.customMonthly,
        cycleStats: data?.cycleStats,
        cycleStatsGeneratedAt: data?.cycleStatsGeneratedAt,
        store: 'r2',
      },
      200,
      cors,
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
      return json({ success: false, error: 'records or upserts array is required' }, 400, cors);
    }

    const newVersion = Date.now();
    await env.R2_BUCKET.put(key, JSON.stringify({ ...next, version: newVersion }), {
      httpMetadata: { contentType: 'application/json' },
    });
    return json({ success: true, message: 'Records saved', version: newVersion, store: 'r2' }, 200, cors);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, cors);
}

function json(data: any, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

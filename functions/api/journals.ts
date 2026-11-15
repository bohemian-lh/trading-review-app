// /api/journals?dataset=<id>
// GET  → { success, journals, version, store }
// POST → 支持增量 ops（推荐）与旧版全量覆盖
//   { baseVersion, ops: [{ op: 'upsert', journal }, { op: 'delete', id }] }
//   { journals: [...] }
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
import { ensureSchemaReady } from '../_lib/d1/schema';
import {
  getJournals,
  getJournalPage,
  applyJournalOps,
  replaceAllJournals,
} from '../_lib/d1/journalRepository';
import { shouldUseD1 } from '../_lib/d1/store';
import { corsHeaders as buildCorsHeaders } from '../_lib/http/cors';

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');

  // 日志会长期累积且包含完整交易思路，CORS 收紧到同源
  const corsHeaders = buildCorsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, corsHeaders);
  }

  try {
    if (shouldUseD1(env)) {
      await ensureSchemaReady(env);
      return await handleD1(env.D1SQL, request, datasetId, corsHeaders);
    }
    return await handleR2(env, request, datasetId, corsHeaders);
  } catch (e: any) {
    console.error('Journals API error:', e);
    return json({ success: false, error: e.message || 'Internal error' }, 500, corsHeaders);
  }
}

// ─── D1 ────────────────────────────────────────────────────────────
async function handleD1(db: any, request: any, datasetId: string, corsHeaders: any) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (isPagedQuery(url)) {
      const page = await getJournalPage(db, datasetId, parsePageQuery(url));
      return json({ success: true, ...page, store: 'd1' }, 200, corsHeaders);
    }
    const { journals, version } = await getJournals(db, datasetId);
    return json({ success: true, journals, version, store: 'd1' }, 200, corsHeaders);
  }

  if (request.method === 'POST') {
    const body = await request.json();

    if (Array.isArray(body?.ops)) {
      const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : 0;
      const result = await applyJournalOps(db, datasetId, baseVersion, body.ops);
      if (!result.ok) {
        return json(
          { success: false, conflict: true, version: result.version, journals: result.journals, store: 'd1' },
          409,
          corsHeaders,
        );
      }
      return json({ success: true, version: result.version, store: 'd1' }, 200, corsHeaders);
    }

    // 旧版全量覆盖，保留兼容
    if (Array.isArray(body?.journals)) {
      const version = await replaceAllJournals(db, datasetId, body.journals);
      return json({ success: true, version, store: 'd1' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'ops or journals array is required' }, 400, corsHeaders);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
}

// ─── R2（回滚用）────────────────────────────────────────────────────
async function handleR2(env: any, request: any, datasetId: string, corsHeaders: any) {
  const key = `trading-journals/${datasetId}.json`;

  if (request.method === 'GET') {
    const obj = await env.R2_BUCKET.get(key);
    if (!obj) return json({ success: true, journals: [], version: 0, nextCursor: null, total: 0, store: 'r2' }, 200, corsHeaders);
    const stored = parseStored(await obj.text());
    const url = new URL(request.url);
    if (isPagedQuery(url)) {
      const page = pageFromArray(stored.journals, parsePageQuery(url));
      return json({ success: true, ...page, version: stored.version, store: 'r2' }, 200, corsHeaders);
    }
    return json({ success: true, journals: stored.journals, version: stored.version, store: 'r2' }, 200, corsHeaders);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const obj = await env.R2_BUCKET.get(key);
    const stored = obj ? parseStored(await obj.text()) : { journals: [], version: 0 };
    const nextVersion = stored.version + 1;

    if (Array.isArray(body?.ops)) {
      if (typeof body.baseVersion === 'number' && body.baseVersion !== stored.version) {
        return json(
          { success: false, conflict: true, version: stored.version, journals: stored.journals, store: 'r2' },
          409,
          corsHeaders,
        );
      }
      const journals = applyOps(stored.journals, body.ops);
      await putJournals(env, key, journals, nextVersion);
      return json({ success: true, version: nextVersion, store: 'r2' }, 200, corsHeaders);
    }

    // 旧版全量覆盖，保留兼容
    if (Array.isArray(body?.journals)) {
      await putJournals(env, key, body.journals, nextVersion);
      return json({ success: true, version: nextVersion, store: 'r2' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'ops or journals array is required' }, 400, corsHeaders);
  }

  return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
}

function parseStored(text: string): { journals: any[]; version: number } {
  const data = JSON.parse(text);
  // 兼容旧格式：直接存数组
  if (Array.isArray(data)) return { journals: data, version: 0 };
  return {
    journals: Array.isArray(data?.journals) ? data.journals : [],
    version: typeof data?.version === 'number' ? data.version : 0,
  };
}

function applyOps(journals: any[], ops: any[]): any[] {
  const map = new Map<string, any>();
  for (const journal of journals) {
    if (journal && typeof journal.id === 'string') map.set(journal.id, journal);
  }
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'delete' && typeof op.id === 'string') {
      map.delete(op.id);
    } else if (op.op === 'upsert' && op.journal && typeof op.journal.id === 'string') {
      map.set(op.journal.id, op.journal);
    }
  }
  return [...map.values()];
}

async function putJournals(env: any, key: string, journals: any[], version: number) {
  await env.R2_BUCKET.put(key, JSON.stringify({ journals, version }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function isPagedQuery(url: URL): boolean {
  return ['limit', 'offset', 'cursor', 'status', 'from', 'to', 'code', 'sort', 'order'].some(key => url.searchParams.has(key));
}

function parsePageQuery(url: URL) {
  const offsetRaw = url.searchParams.get('offset');
  return {
    limit: Number(url.searchParams.get('limit') ?? 50),
    offset: offsetRaw ? Math.min(200000, Math.max(0, Math.trunc(Number(offsetRaw)) || 0)) : 0,
    cursor: url.searchParams.get('cursor'),
    status: url.searchParams.get('status'),
    fromDay: url.searchParams.get('from'),
    toDay: url.searchParams.get('to'),
    code: url.searchParams.get('code'),
    sort: (url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    // order=manual：「当前交易」的手动顺序（sort_order），其余情况按日期
    orderBy: (url.searchParams.get('order') === 'manual' ? 'manual' : 'date') as 'date' | 'manual',
  };
}

/** R2 回退：内存里做与 D1 相同的筛选、排序与键集分页 */
function pageFromArray(journals: any[], query: any) {
  const dayOf = (journal: any) => String(journal?.openDate ?? '').replace(/-/g, '').slice(0, 8);
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(query.limit)) || 50));
  const dir = query.sort === 'asc' ? 1 : -1;
  const manual = query.orderBy === 'manual';

  let list = journals.filter((journal: any) => {
    if (query.status && journal.status !== query.status) return false;
    const day = dayOf(journal);
    if (query.fromDay && day < query.fromDay) return false;
    if (query.toDay && day > query.toDay) return false;
    if (query.code && !String(journal.stockCode ?? '').includes(query.code)) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    if (manual) {
      // 与 D1 一致：按 sort_order 升序，同序时按日期倒序
      const av = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
      const bv = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
      if (av !== bv) return av - bv;
      const cmp =
        dayOf(a).localeCompare(dayOf(b)) ||
        String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) ||
        String(a.id).localeCompare(String(b.id));
      return -cmp;
    }
    const cmp =
      dayOf(a).localeCompare(dayOf(b)) ||
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) ||
      String(a.id).localeCompare(String(b.id));
    return cmp * dir;
  });

  const total = list.length;

  const offset = Math.max(0, Math.trunc(Number(query.offset) || 0));
  if (offset > 0) {
    // 页码模式：直接切片，不回传游标
    const page = list.slice(offset, offset + limit);
    return { journals: page, nextCursor: null, total };
  }

  if (query.cursor && !manual) {
    const [cursorDay, cursorCreatedAt, cursorId] = String(query.cursor).split('|');
    list = list.filter((journal: any) => {
      const day = dayOf(journal);
      const createdAt = String(journal.createdAt ?? '');
      const id = String(journal.id);
      if (day !== cursorDay) return dir === 1 ? day > cursorDay : day < cursorDay;
      if (createdAt !== cursorCreatedAt) return dir === 1 ? createdAt > cursorCreatedAt : createdAt < cursorCreatedAt;
      return dir === 1 ? id > cursorId : id < cursorId;
    });
  }

  const page = list.slice(0, limit);
  const last = page[page.length - 1];
  return {
    journals: page,
    nextCursor: list.length > limit && last ? `${dayOf(last)}|${last.createdAt}|${last.id}` : null,
    total,
  };
}

function json(data: any, status: number, headers: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

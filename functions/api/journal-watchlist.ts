// /api/journal-watchlist?dataset=<id>
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { getWatchlist, replaceWatchlist } from '../_lib/d1/journalRepository';
import { shouldUseD1 } from '../_lib/d1/store';
import { corsHeaders as buildCorsHeaders } from '../_lib/http/cors';

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');

  const corsHeaders = buildCorsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, corsHeaders);
  }

  try {
    const useD1 = shouldUseD1(env);
    if (useD1) await ensureSchemaReady(env);
    const key = `trading-journals/${datasetId}-watchlist.json`;

    if (request.method === 'GET') {
      if (useD1) {
        const { watchlist, version } = await getWatchlist(env.D1SQL, datasetId);
        return json({ success: true, watchlist, version, store: 'd1' }, 200, corsHeaders);
      }
      const obj = await env.R2_BUCKET.get(key);
      if (!obj) return json({ success: true, watchlist: [], version: 0, store: 'r2' }, 200, corsHeaders);
      const text = await obj.text();
      return json({ success: true, watchlist: JSON.parse(text), version: 0, store: 'r2' }, 200, corsHeaders);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { watchlist } = body;
      if (!Array.isArray(watchlist)) {
        return json({ success: false, error: 'watchlist must be an array' }, 400, corsHeaders);
      }
      if (useD1) {
        const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : null;
        const result = await replaceWatchlist(env.D1SQL, datasetId, watchlist, baseVersion);
        if (!result.ok) {
          return json(
            { success: false, conflict: true, version: result.version, watchlist: result.items, store: 'd1' },
            409,
            corsHeaders,
          );
        }
        return json({ success: true, version: result.version, store: 'd1' }, 200, corsHeaders);
      }
      await env.R2_BUCKET.put(key, JSON.stringify(watchlist), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ success: true, store: 'r2' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Watchlist API error:', e);
    return json({ success: false, error: e.message || 'Internal error' }, 500, corsHeaders);
  }
}

function json(data: any, status: number, headers: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

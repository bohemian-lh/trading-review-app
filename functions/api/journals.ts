// /api/journals?dataset=<id>
// GET  → { success, journals, version }
// POST → 支持增量 ops（推荐）与旧版全量覆盖
//   { baseVersion, ops: [{ op: 'upsert', journal }, { op: 'delete', id }] }
//   { journals: [...] }
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

  const key = `trading-journals/${datasetId}.json`;

  try {
    if (request.method === 'GET') {
      const obj = await env.R2_BUCKET.get(key);
      if (!obj) return json({ success: true, journals: [], version: 0 }, 200, corsHeaders);
      const stored = parseStored(await obj.text());
      return json({ success: true, journals: stored.journals, version: stored.version }, 200, corsHeaders);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const obj = await env.R2_BUCKET.get(key);
      const stored = obj ? parseStored(await obj.text()) : { journals: [], version: 0 };
      const nextVersion = stored.version + 1;

      if (Array.isArray(body?.ops)) {
        if (typeof body.baseVersion === 'number' && body.baseVersion !== stored.version) {
          return json(
            { success: false, conflict: true, version: stored.version, journals: stored.journals },
            409,
            corsHeaders,
          );
        }
        const journals = applyOps(stored.journals, body.ops);
        await putJournals(env, key, journals, nextVersion);
        return json({ success: true, version: nextVersion }, 200, corsHeaders);
      }

      // 旧版全量覆盖，保留兼容
      if (Array.isArray(body?.journals)) {
        await putJournals(env, key, body.journals, nextVersion);
        return json({ success: true, version: nextVersion }, 200, corsHeaders);
      }

      return json({ success: false, error: 'ops or journals array is required' }, 400, corsHeaders);
    }

    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Journals API error:', e);
    return json({ success: false, error: e.message || 'Internal error' }, 500, corsHeaders);
  }
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

function json(data: any, status: number, headers: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

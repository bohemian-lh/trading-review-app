// /api/journal-snapshots?dataset=<id>
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
    if (request.method === 'GET') {
      const key = `journal-snapshots/${datasetId}.json`;
      const obj = await env.R2_BUCKET.get(key);
      if (!obj) return json({ success: true, snapshots: [] }, 200, corsHeaders);
      const text = await obj.text();
      return json({ success: true, snapshots: JSON.parse(text) }, 200, corsHeaders);
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const { snapshots } = body;
      if (!Array.isArray(snapshots)) {
        return json({ success: false, error: 'snapshots must be an array' }, 400, corsHeaders);
      }
      const key = `journal-snapshots/${datasetId}.json`;
      await env.R2_BUCKET.put(key, JSON.stringify(snapshots, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ success: true }, 200, corsHeaders);
    }
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Journal snapshots API error:', e);
    return json({ success: false, error: e.message || 'Internal error' }, 500, corsHeaders);
  }
}

function json(data: any, status: number, headers: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

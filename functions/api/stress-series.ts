// @ts-nocheck
// /api/stress-series?dataset=<id> — 压测对比系列（dataset 级）
export async function onRequest(context) {
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
      return await handleGet(env, corsHeaders, datasetId);
    }
    if (request.method === 'POST') {
      return await handlePost(request, env, corsHeaders, datasetId);
    }
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e) {
    console.error('Error:', e);
    return json({ success: false, error: 'Internal error', details: e.message }, 500, corsHeaders);
  }
}

async function handleGet(env, corsHeaders, datasetId) {
  const KEY = `trading-data/${datasetId}/stress-series.json`;
  try {
    const object = await env.R2_BUCKET.get(KEY);
    if (!object) {
      return json({ success: true, series: [] }, 200, corsHeaders);
    }
    const text = await object.text();
    const series = JSON.parse(text);
    return json({ success: true, series: Array.isArray(series) ? series : [] }, 200, corsHeaders);
  } catch (e) {
    console.error('获取压测系列失败', e);
    return json({ success: false, error: 'Failed to get stress series', details: e.message }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders, datasetId) {
  const KEY = `trading-data/${datasetId}/stress-series.json`;
  try {
    const body = await request.json();
    const { series } = body;
    if (!Array.isArray(series)) {
      return json({ success: false, error: 'series is required' }, 400, corsHeaders);
    }
    await env.R2_BUCKET.put(KEY, JSON.stringify(series), {
      httpMetadata: { contentType: 'application/json' }
    });
    return json({ success: true, message: 'Stress series saved' }, 200, corsHeaders);
  } catch (e) {
    console.error('保存压测系列失败', e);
    return json({ success: false, error: 'Failed to save stress series', details: e.message }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

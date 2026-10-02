// @ts-nocheck
// /api/tabs?dataset=<id> — 分析页签（dataset 级）
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
  const KEY = `trading-data/${datasetId}/analysis-tabs.json`;
  try {
    const object = await env.R2_BUCKET.get(KEY);
    if (!object) {
      return json({ success: true, tabs: [] }, 200, corsHeaders);
    }
    const text = await object.text();
    const tabs = JSON.parse(text);
    return json({ success: true, tabs: Array.isArray(tabs) ? tabs : [] }, 200, corsHeaders);
  } catch (e) {
    console.error('获取页签失败', e);
    return json({ success: false, error: 'Failed to get tabs', details: e.message }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders, datasetId) {
  const KEY = `trading-data/${datasetId}/analysis-tabs.json`;
  try {
    const body = await request.json();
    const { tabs } = body;
    if (!Array.isArray(tabs)) {
      return json({ success: false, error: 'tabs is required' }, 400, corsHeaders);
    }
    await env.R2_BUCKET.put(KEY, JSON.stringify(tabs), {
      httpMetadata: { contentType: 'application/json' }
    });
    return json({ success: true, message: 'Tabs saved' }, 200, corsHeaders);
  } catch (e) {
    console.error('保存页签失败', e);
    return json({ success: false, error: 'Failed to save tabs', details: e.message }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

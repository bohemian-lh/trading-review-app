// /api/config?dataset=<id> — 独立端点管理 fieldConfig
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
  const CONFIG_KEY = `trading-data/${datasetId}/field-config.json`;
  try {
    const object = await env.R2_BUCKET.get(CONFIG_KEY);
    if (!object) {
      return json({ success: true, config: null }, 200, corsHeaders);
    }
    const text = await object.text();
    const config = JSON.parse(text);
    return json({ success: true, config }, 200, corsHeaders);
  } catch (e) {
    console.error('获取配置失败', e);
    return json({ success: false, error: 'Failed to get config', details: e.message }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders, datasetId) {
  const CONFIG_KEY = `trading-data/${datasetId}/field-config.json`;
  try {
    const body = await request.json();
    const { config } = body;
    if (!config) {
      return json({ success: false, error: 'config is required' }, 400, corsHeaders);
    }
    await env.R2_BUCKET.put(CONFIG_KEY, JSON.stringify(config), {
      httpMetadata: { contentType: 'application/json' }
    });
    return json({ success: true, message: 'Config saved' }, 200, corsHeaders);
  } catch (e) {
    console.error('保存配置失败', e);
    return json({ success: false, error: 'Failed to save config', details: e.message }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

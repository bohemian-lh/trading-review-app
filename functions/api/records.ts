// /api/records?dataset=<id>
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
  const RECORDS_KEY = `trading-data/${datasetId}/records.json`;
  try {
    const object = await env.R2_BUCKET.get(RECORDS_KEY);
    if (!object) {
      return json({ success: true, records: [], version: 0 }, 200, corsHeaders);
    }
    const text = await object.text();
    const data = JSON.parse(text);
    const records = data.records || data || [];
    const version = data.version || 0;
    const customAnalysis = data.customAnalysis;
    const customMonthly = data.customMonthly;
    const cycleStats = data.cycleStats;
    const cycleStatsGeneratedAt = data.cycleStatsGeneratedAt;
    return json({
      success: true, records, version,
      customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt
    }, 200, corsHeaders);
  } catch (e) {
    console.error('获取记录失败', e);
    return json({ success: false, error: 'Failed to get', details: e.message }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders, datasetId) {
  const RECORDS_KEY = `trading-data/${datasetId}/records.json`;
  try {
    const body = await request.json();
    const { records, version: clientVersion, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt } = body;
    const newVersion = Date.now();
    const dataToSave = { records, version: newVersion, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt };
    await env.R2_BUCKET.put(RECORDS_KEY, JSON.stringify(dataToSave), {
      httpMetadata: { contentType: 'application/json' }
    });
    return json({ success: true, message: 'Records saved', version: newVersion }, 200, corsHeaders);
  } catch (e) {
    console.error('保存失败', e);
    return json({ success: false, error: 'Failed to save', details: e.message }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

// /api/records
export async function onRequest(context) {
  const { request, env } = context;
  console.log('=== /api/records 请求 ===', request.method);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (request.method === 'GET') {
      return await handleGet(env, corsHeaders);
    }
    
    if (request.method === 'POST') {
      return await handlePost(request, env, corsHeaders);
    }
    
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e) {
    console.error('Error:', e);
    return json({ 
      success: false, 
      error: 'Internal error', 
      details: e.message 
    }, 500, corsHeaders);
  }
}

async function handleGet(env, corsHeaders) {
  console.log('处理 GET /api/records');
  
  const RECORDS_KEY = 'trading-data/records.json';
  try {
    const object = await env.R2_BUCKET.get(RECORDS_KEY);
    if (!object) {
      console.log('没有找到记录，返回空数组');
      return json({ success: true, records: [], version: 0 }, 200, corsHeaders);
    }
    
    const text = await object.text();
    const data = JSON.parse(text);
    const records = data.records || data || [];
    const version = data.version || 0;
    const customAnalysis = data.customAnalysis;
    const customMonthly = data.customMonthly;
    console.log('成功获取记录', records.length, '条');
    
    return json({ success: true, records, version, customAnalysis, customMonthly }, 200, corsHeaders);
  } catch (e) {
    console.error('获取记录失败', e);
    return json({ 
      success: false, 
      error: 'Failed to get', 
      details: e.message 
    }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders) {
  console.log('处理 POST /api/records');
  
  const RECORDS_KEY = 'trading-data/records.json';
  try {
    const body = await request.json();
    const { records, version: clientVersion, customAnalysis, customMonthly } = body;
    const newVersion = Date.now();
    
    const dataToSave = { records, version: newVersion, customAnalysis, customMonthly };
    
    await env.R2_BUCKET.put(RECORDS_KEY, JSON.stringify(dataToSave), {
      httpMetadata: { contentType: 'application/json' }
    });
    
    console.log('成功保存记录');
    return json({ 
      success: true, 
      message: 'Records saved', 
      version: newVersion 
    }, 200, corsHeaders);
  } catch (e) {
    console.error('保存失败', e);
    return json({ 
      success: false, 
      error: 'Failed to save', 
      details: e.message 
    }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

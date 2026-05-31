// /api/file - 下载和删除单个文件
export async function onRequest(context) {
  const { request, env, url } = context;
  console.log('=== /api/file 请求 ===', request.method, url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 从查询参数获取文件名
    const urlObj = new URL(url);
    const filename = urlObj.searchParams.get('filename');
    
    if (!filename) {
      return json({ success: false, error: 'Filename required' }, 400, corsHeaders);
    }

    if (request.method === 'GET') {
      return await handleDownload(filename, env, corsHeaders);
    }
    
    if (request.method === 'DELETE') {
      return await handleDelete(filename, env, corsHeaders);
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

async function handleDownload(filename, env, corsHeaders) {
  const key = `excel-files/${filename}`;
  console.log('下载文件', key);
  
  const object = await env.R2_BUCKET.get(key);
  if (!object) {
    return json({ success: false, error: 'Not found' }, 404, corsHeaders);
  }

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  
  return new Response(object.body, { headers, status: 200 });
}

async function handleDelete(filename, env, corsHeaders) {
  const key = `excel-files/${filename}`;
  console.log('删除文件', key);
  await env.R2_BUCKET.delete(key);
  return json({ success: true, message: 'Deleted' }, 200, corsHeaders);
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

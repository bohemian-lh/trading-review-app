// /api/file - 下载和删除单个文件
export async function onRequest(context) {
  const { request, env, url } = context;
  console.log('=== /api/file 请求 ===', request.method, url);
  console.log('context.env keys:', Object.keys(env));
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 从查询参数获取文件名，并进行 URL 解码
    const urlObj = new URL(url);
    let filename = urlObj.searchParams.get('filename');
    console.log('filename from query (raw):', filename);
    
    // URL 解码
    if (filename) {
      try {
        filename = decodeURIComponent(filename);
        console.log('filename after decodeURIComponent:', filename);
      } catch (e) {
        console.error('decodeURIComponent failed:', e);
      }
    }
    
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
      details: e.message,
      stack: e.stack
    }, 500, corsHeaders);
  }
}

async function handleDownload(filename, env, corsHeaders) {
  const key = `excel-files/${filename}`;
  console.log('下载文件, key:', key);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    const object = await env.R2_BUCKET.get(key);
    console.log('object found:', !!object);
    
    if (!object) {
      return json({ success: false, error: 'Not found' }, 404, corsHeaders);
    }

    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    // 更好的 Content-Disposition，兼容不同浏览器
    // 使用 RFC5987 编码格式处理非 ASCII 字符
    const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_');
    headers.set('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    
    return new Response(object.body, { headers, status: 200 });
  } catch (e) {
    console.error('Download error:', e);
    return json({ 
      success: false, 
      error: 'Download failed', 
      details: e.message 
    }, 500, corsHeaders);
  }
}

async function handleDelete(filename, env, corsHeaders) {
  const key = `excel-files/${filename}`;
  console.log('删除文件, key:', key);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    await env.R2_BUCKET.delete(key);
    console.log('File deleted successfully');
    return json({ success: true, message: 'Deleted' }, 200, corsHeaders);
  } catch (e) {
    console.error('Delete error:', e);
    return json({ 
      success: false, 
      error: 'Delete failed', 
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

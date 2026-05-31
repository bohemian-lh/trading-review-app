// /api/files - 列出和上传文件
export async function onRequest(context) {
  const { request, env } = context;
  console.log('=== /api/files 请求 ===', request.method);
  
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
      return await handleList(env, corsHeaders);
    }
    
    if (request.method === 'POST') {
      return await handleUpload(request, env, corsHeaders);
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

async function handleList(env, corsHeaders) {
  console.log('列出文件');
  try {
    const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
    const files = listed.objects
      .filter(obj => !obj.key.endsWith('/'))
      .map(obj => ({
        key: obj.key,
        filename: obj.key.split('/').pop() || obj.key,
        lastModified: obj.uploaded,
        size: obj.size,
      }));
      
    console.log('找到文件数', files.length);
    return json({ success: true, files }, 200, corsHeaders);
  } catch (e) {
    console.error('列出失败', e);
    return json({ success: false, error: e.message }, 500, corsHeaders);
  }
}

async function handleUpload(request, env, corsHeaders) {
  console.log('上传文件');
  try {
    const contentType = request.headers.get('Content-Type') || '';
    let filename = 'unknown';
    let fileData;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return json({ success: false, error: 'No file' }, 400, corsHeaders);
      }
      filename = file.name;
      fileData = await file.arrayBuffer();
    } else {
      fileData = await request.arrayBuffer();
    }

    const safeFilename = filename.replace(/[^\w.\-_]/g, '_');
    const key = `excel-files/${safeFilename}`;

    await env.R2_BUCKET.put(key, fileData);
    console.log('文件上传成功', key);
    
    return json({ 
      success: true, 
      message: 'File uploaded',
      key,
      filename: safeFilename
    }, 200, corsHeaders);
  } catch (e) {
    console.error('上传失败', e);
    return json({ success: false, error: e.message }, 500, corsHeaders);
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

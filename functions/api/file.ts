// /api/file - 下载和删除单个文件
export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const urlObj = new URL(request.url);
    const key = urlObj.searchParams.get('key');
    const filename = urlObj.searchParams.get('filename');
    
    // 优先使用 key（精确的 R2 路径），其次用 filename 模糊匹配
    let r2Key = key;
    
    if (!r2Key && filename) {
      // 没有 key，用 filename 去列出文件并匹配
      const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
      for (const obj of listed.objects) {
        const objName = obj.key.split('/').pop();
        if (objName === filename) {
          r2Key = obj.key;
          break;
        }
      }
      // 精确匹配失败，尝试扩展名匹配
      if (!r2Key) {
        const ext = filename.includes('.') ? filename.split('.').pop() : '';
        for (const obj of listed.objects) {
          if (ext && obj.key.endsWith('.' + ext)) {
            r2Key = obj.key;
            break;
          }
        }
      }
    }
    
    if (!r2Key) {
      return json({ success: false, error: 'File not found. Provide ?key= or ?filename=' }, 404, corsHeaders);
    }

    if (request.method === 'GET') {
      return await handleDownload(r2Key, env, corsHeaders);
    }
    
    if (request.method === 'DELETE') {
      return await handleDelete(r2Key, env, corsHeaders);
    }
    
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e) {
    return json({ success: false, error: e.message }, 500, corsHeaders);
  }
}

async function handleDownload(r2Key, env, corsHeaders) {
  const object = await env.R2_BUCKET.get(r2Key);
  if (!object) {
    return json({ success: false, error: 'Object not found' }, 404, corsHeaders);
  }
  
  const actualFilename = r2Key.split('/').pop() || 'download.xlsx';
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  // RFC 5987: 兼容 ASCII + UTF-8 文件名
  const asciiName = actualFilename.replace(/[^\x20-\x7E]/g, '_');
  headers.set('Content-Disposition', 
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(actualFilename)}`);
  
  return new Response(object.body, { headers, status: 200 });
}

async function handleDelete(r2Key, env, corsHeaders) {
  await env.R2_BUCKET.delete(r2Key);
  return json({ success: true, message: 'Deleted' }, 200, corsHeaders);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

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
    
    // URL 解码（处理两次，因为可能被双重编码）
    if (filename) {
      try {
        // 尝试多次解码，处理可能的双重编码问题
        let decoded = filename;
        for (let i = 0; i < 2; i++) {
          if (decoded.includes('%')) {
            decoded = decodeURIComponent(decoded);
          }
        }
        filename = decoded;
        console.log('filename after decode:', filename);
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
  // 先尝试直接找文件
  let key = `excel-files/${filename}`;
  console.log('尝试下载文件, key:', key);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    let object = await env.R2_BUCKET.get(key);
    
    // 如果没找到，尝试列出所有文件找匹配（处理可能的编码问题）
    if (!object) {
      console.log('未找到文件，尝试列出所有文件查找');
      const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
      console.log('找到', listed.objects.length, '个文件');
      
      // 尝试模糊匹配
      for (const obj of listed.objects) {
        const objFilename = obj.key.split('/').pop();
        if (objFilename && (objFilename === filename || objFilename.includes(filename.replace(/[_\s]/g, '')))) {
          console.log('找到匹配文件:', obj.key);
          key = obj.key;
          object = await env.R2_BUCKET.get(key);
          filename = objFilename; // 更新为实际的文件名
          break;
        }
      }
    }
    
    if (!object) {
      console.log('文件未找到:', filename);
      return json({ success: false, error: 'Not found' }, 404, corsHeaders);
    }

    console.log('文件找到，准备下载');
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    
    // 更好的 Content-Disposition，兼容不同浏览器
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);
    headers.set('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
    
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
  // 先尝试直接删除
  let key = `excel-files/${filename}`;
  console.log('尝试删除文件, key:', key);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    // 先检查文件是否存在
    let object = await env.R2_BUCKET.get(key);
    
    // 如果没找到，尝试查找匹配的文件
    if (!object) {
      console.log('未找到文件，尝试列出所有文件查找');
      const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
      
      for (const obj of listed.objects) {
        const objFilename = obj.key.split('/').pop();
        if (objFilename && (objFilename === filename || objFilename.includes(filename.replace(/[_\s]/g, '')))) {
          console.log('找到匹配文件:', obj.key);
          key = obj.key;
          break;
        }
      }
    }
    
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

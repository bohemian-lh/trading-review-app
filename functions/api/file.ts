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
  console.log('=== 下载文件, 原始文件名:', filename);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    // 先列出所有文件，然后找到最匹配的一个
    const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
    console.log('找到', listed.objects.length, '个文件');
    
    let matchingObject = null;
    let matchingKey = null;
    
    // 先尝试直接匹配
    for (const obj of listed.objects) {
      const objFilename = obj.key.split('/').pop();
      if (objFilename === filename) {
        console.log('找到精确匹配文件:', obj.key);
        matchingKey = obj.key;
        break;
      }
    }
    
    // 如果没找到直接匹配，尝试其他匹配
    if (!matchingKey) {
      console.log('未找到精确匹配，尝试其他匹配方式');
      for (const obj of listed.objects) {
        const objFilename = obj.key.split('/').pop();
        if (!objFilename) continue;
        
        // 比较文件扩展名相同
        if (objFilename.endsWith('.xlsx') && filename.endsWith('.xlsx')) {
          console.log('找到扩展名匹配文件:', obj.key);
          matchingKey = obj.key;
          break;
        }
      }
    }
    
    // 如果还是没找到，直接用第一个文件（如果只有一个）
    if (!matchingKey && listed.objects.length > 0) {
      console.log('未找到匹配，使用第一个文件');
      matchingKey = listed.objects[0].key;
    }
    
    if (!matchingKey) {
      console.log('没有找到任何文件');
      return json({ success: false, error: 'Not found' }, 404, corsHeaders);
    }
    
    // 获取文件
    const object = await env.R2_BUCKET.get(matchingKey);
    if (!object) {
      console.log('文件不存在:', matchingKey);
      return json({ success: false, error: 'File not found' }, 404, corsHeaders);
    }
    
    const actualFilename = matchingKey.split('/').pop() || filename;
    console.log('文件找到，准备下载, key:', matchingKey, '实际文件名:', actualFilename);
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    
    // 更好的 Content-Disposition，兼容不同浏览器
    const asciiFilename = actualFilename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(actualFilename);
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
  console.log('=== 删除文件, 原始文件名:', filename);
  console.log('env.R2_BUCKET exists:', !!env.R2_BUCKET);
  
  try {
    // 先列出所有文件，然后找到最匹配的一个
    const listed = await env.R2_BUCKET.list({ prefix: 'excel-files/' });
    console.log('找到', listed.objects.length, '个文件');
    
    let matchingKey = null;
    
    // 先尝试直接匹配
    for (const obj of listed.objects) {
      const objFilename = obj.key.split('/').pop();
      if (objFilename === filename) {
        console.log('找到精确匹配文件:', obj.key);
        matchingKey = obj.key;
        break;
      }
    }
    
    // 如果没找到直接匹配，尝试其他匹配
    if (!matchingKey) {
      console.log('未找到精确匹配，尝试其他匹配方式');
      for (const obj of listed.objects) {
        const objFilename = obj.key.split('/').pop();
        if (!objFilename) continue;
        
        // 比较文件扩展名相同
        if (objFilename.endsWith('.xlsx') && filename.endsWith('.xlsx')) {
          console.log('找到扩展名匹配文件:', obj.key);
          matchingKey = obj.key;
          break;
        }
      }
    }
    
    // 如果还是没找到，直接用第一个文件（如果只有一个）
    if (!matchingKey && listed.objects.length > 0) {
      console.log('未找到匹配，使用第一个文件');
      matchingKey = listed.objects[0].key;
    }
    
    if (!matchingKey) {
      console.log('没有找到任何文件');
      return json({ success: false, error: 'Not found' }, 404, corsHeaders);
    }
    
    await env.R2_BUCKET.delete(matchingKey);
    console.log('File deleted successfully, key:', matchingKey);
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

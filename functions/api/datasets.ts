// /api/datasets — 数据集 CRUD
export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    if (request.method === 'DELETE') {
      return await handleDelete(request, env, corsHeaders);
    }
    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e) {
    console.error('Error:', e);
    return json({ success: false, error: 'Internal error', details: e.message }, 500, corsHeaders);
  }
}

async function handleGet(env, corsHeaders) {
  const DATASETS_KEY = 'trading-data/datasets.json';
  try {
    const object = await env.R2_BUCKET.get(DATASETS_KEY);
    if (!object) {
      return json({ success: true, datasets: [] }, 200, corsHeaders);
    }
    const text = await object.text();
    const datasets = JSON.parse(text);
    return json({ success: true, datasets }, 200, corsHeaders);
  } catch (e) {
    console.error('获取数据集列表失败', e);
    return json({ success: false, error: 'Failed to get datasets', details: e.message }, 500, corsHeaders);
  }
}

async function handlePost(request, env, corsHeaders) {
  const DATASETS_KEY = 'trading-data/datasets.json';
  try {
    const body = await request.json();
    const { name } = body;
    if (!name || !name.trim()) {
      return json({ success: false, error: 'name is required' }, 400, corsHeaders);
    }

    const dataset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    // 读取现有列表追加
    let datasets = [];
    const object = await env.R2_BUCKET.get(DATASETS_KEY);
    if (object) {
      const text = await object.text();
      datasets = JSON.parse(text);
    }
    datasets.push(dataset);

    await env.R2_BUCKET.put(DATASETS_KEY, JSON.stringify(datasets), {
      httpMetadata: { contentType: 'application/json' },
    });

    return json({ success: true, dataset }, 200, corsHeaders);
  } catch (e) {
    console.error('创建数据集失败', e);
    return json({ success: false, error: 'Failed to create dataset', details: e.message }, 500, corsHeaders);
  }
}

async function handleDelete(request, env, corsHeaders) {
  const DATASETS_KEY = 'trading-data/datasets.json';
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return json({ success: false, error: 'id is required' }, 400, corsHeaders);
    }

    // 从列表中移除
    const object = await env.R2_BUCKET.get(DATASETS_KEY);
    let datasets = [];
    if (object) {
      const text = await object.text();
      datasets = JSON.parse(text);
    }
    const filtered = datasets.filter((d: any) => d.id !== id);
    if (filtered.length === datasets.length) {
      return json({ success: false, error: 'Dataset not found' }, 404, corsHeaders);
    }

    await env.R2_BUCKET.put(DATASETS_KEY, JSON.stringify(filtered), {
      httpMetadata: { contentType: 'application/json' },
    });

    // 删除该数据集下的所有 R2 对象
    // R2 没有"删除目录"API，需要列出前缀后逐个删除
    const prefix = `trading-data/${id}/`;
    let truncated = true;
    let cursor: string | undefined;
    while (truncated) {
      const listOpts: any = { prefix, limit: 100 };
      if (cursor) listOpts.cursor = cursor;
      const listResult = await env.R2_BUCKET.list(listOpts);
      const keys = listResult.objects.map((o: any) => o.key);
      if (keys.length > 0) {
        await Promise.all(keys.map((key: string) => env.R2_BUCKET.delete(key)));
      }
      truncated = listResult.truncated;
      cursor = listResult.cursor;
    }

    return json({ success: true, message: 'Dataset deleted' }, 200, corsHeaders);
  } catch (e) {
    console.error('删除数据集失败', e);
    return json({ success: false, error: 'Failed to delete dataset', details: e.message }, 500, corsHeaders);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

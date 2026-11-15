// /api/datasets — 数据集读取与创建
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
//
// 删除已从接口层移除：数据集删除属于高危操作，只允许在数据库里把
// datasets.deleted_at 置位，再用 /api/admin/migrate-d1?stage=purge 分批清理。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { listDatasets, createDataset } from '../_lib/d1/datasetRepository';
import { shouldUseD1 } from '../_lib/d1/store';

export async function onRequest(context: any) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const useD1 = shouldUseD1(env);

  try {
    if (useD1) await ensureSchemaReady(env);

    if (request.method === 'GET') {
      if (useD1) {
        return json({ success: true, datasets: await listDatasets(env.D1SQL), store: 'd1' }, 200, corsHeaders);
      }
      const object = await env.R2_BUCKET.get('trading-data/datasets.json');
      if (!object) return json({ success: true, datasets: [], store: 'r2' }, 200, corsHeaders);
      return json({ success: true, datasets: JSON.parse(await object.text()), store: 'r2' }, 200, corsHeaders);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json({ success: false, error: 'name is required' }, 400, corsHeaders);

      if (useD1) {
        return json({ success: true, dataset: await createDataset(env.D1SQL, name), store: 'd1' }, 200, corsHeaders);
      }

      // R2 回退：原先是「读数组 → push → 整份写回」，这里保持不变
      const DATASETS_KEY = 'trading-data/datasets.json';
      const dataset = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
      let datasets: any[] = [];
      const object = await env.R2_BUCKET.get(DATASETS_KEY);
      if (object) datasets = JSON.parse(await object.text());
      datasets.push(dataset);
      await env.R2_BUCKET.put(DATASETS_KEY, JSON.stringify(datasets), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ success: true, dataset, store: 'r2' }, 200, corsHeaders);
    }

    if (request.method === 'DELETE') {
      return json(
        { success: false, error: '删除数据集已禁用：请在数据库中标记 deleted_at 后调用迁移端点的 purge 阶段' },
        403,
        corsHeaders,
      );
    }

    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Datasets API error:', e);
    return json({ success: false, error: 'Failed to handle dataset', details: e.message }, 500, corsHeaders);
  }
}

function json(data: any, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// /api/config?dataset=<id> — 字段配置（单文档）
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { getConfig, saveConfig } from '../_lib/d1/configRepository';
import { shouldUseD1 } from '../_lib/d1/store';

export async function onRequest(context: any) {
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
    const useD1 = shouldUseD1(env);
    if (useD1) await ensureSchemaReady(env);
    const key = `trading-data/${datasetId}/field-config.json`;

    if (request.method === 'GET') {
      if (useD1) {
        const { config, version } = await getConfig(env.D1SQL, datasetId);
        return json({ success: true, config, version, store: 'd1' }, 200, corsHeaders);
      }
      const object = await env.R2_BUCKET.get(key);
      if (!object) return json({ success: true, config: null, store: 'r2' }, 200, corsHeaders);
      return json({ success: true, config: JSON.parse(await object.text()), store: 'r2' }, 200, corsHeaders);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { config } = body;
      if (!config) {
        return json({ success: false, error: 'config is required' }, 400, corsHeaders);
      }
      if (useD1) {
        const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : null;
        const result = await saveConfig(env.D1SQL, datasetId, config, baseVersion);
        if (!result.ok) {
          return json(
            { success: false, conflict: true, version: result.version, config: result.config, store: 'd1' },
            409,
            corsHeaders,
          );
        }
        return json({ success: true, message: 'Config saved', version: result.version, store: 'd1' }, 200, corsHeaders);
      }
      await env.R2_BUCKET.put(key, JSON.stringify(config), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ success: true, message: 'Config saved', store: 'r2' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Config API error:', e);
    return json({ success: false, error: 'Failed to handle config', details: e.message }, 500, corsHeaders);
  }
}

function json(data: any, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

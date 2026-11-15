// /api/tabs?dataset=<id> — 分析页签（dataset 级）
// 存储：DATA_STORE=d1 且绑定 D1SQL 时走 D1，否则回退 R2。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { getSeries, saveSeries } from '../_lib/d1/analysisSeriesRepository';
import { shouldUseD1 } from '../_lib/d1/store';

const KIND = 'tab';

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
    const key = `trading-data/${datasetId}/analysis-tabs.json`;

    if (request.method === 'GET') {
      if (useD1) {
        const { series, version } = await getSeries(env.D1SQL, datasetId, KIND);
        return json({ success: true, tabs: series, version, store: 'd1' }, 200, corsHeaders);
      }
      const object = await env.R2_BUCKET.get(key);
      if (!object) return json({ success: true, tabs: [], version: 0, store: 'r2' }, 200, corsHeaders);
      const tabs = JSON.parse(await object.text());
      return json({ success: true, tabs: Array.isArray(tabs) ? tabs : [], version: 0, store: 'r2' }, 200, corsHeaders);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { tabs } = body;
      if (!Array.isArray(tabs)) {
        return json({ success: false, error: 'tabs is required' }, 400, corsHeaders);
      }
      if (useD1) {
        const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : null;
        const result = await saveSeries(env.D1SQL, datasetId, KIND, tabs, baseVersion);
        if (!result.ok) {
          return json(
            { success: false, conflict: true, version: result.version, tabs: result.series, store: 'd1' },
            409,
            corsHeaders,
          );
        }
        return json({ success: true, message: 'Tabs saved', version: result.version, store: 'd1' }, 200, corsHeaders);
      }
      await env.R2_BUCKET.put(key, JSON.stringify(tabs), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ success: true, message: 'Tabs saved', store: 'r2' }, 200, corsHeaders);
    }

    return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  } catch (e: any) {
    console.error('Tabs API error:', e);
    return json({ success: false, error: 'Failed to handle tabs', details: e.message }, 500, corsHeaders);
  }
}

function json(data: any, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

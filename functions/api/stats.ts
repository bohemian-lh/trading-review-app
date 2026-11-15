// /api/stats?dataset=<id>
// GET  → 读取预计算统计：{ success, version, overview, monthly, analysisResults, store }
// POST → 用 SQL 重算并写入结果表：{ kinds?: string[], ids?: string[] }
//        版本冲突（重算期间记录被改动）返回 409 + 最新 version
// 存储：仅 D1；R2 模式下返回 501，由前端回退到浏览器计算。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { getStats, recomputeStats } from '../_lib/d1/statsRepository';
import { shouldUseD1 } from '../_lib/d1/store';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400);
  }
  if (!shouldUseD1(env)) {
    return json({ success: false, error: '统计数据需要 D1 存储' }, 501);
  }

  try {
    await ensureSchemaReady(env);
    const db = env.D1SQL;

    if (request.method === 'GET') {
      const stats = await getStats(db, datasetId);
      return json({ success: true, ...stats, store: 'd1' });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const result = await recomputeStats(db, datasetId, {
        kinds: Array.isArray(body?.kinds) ? body.kinds : undefined,
        ids: Array.isArray(body?.ids) ? body.ids : undefined,
      });
      if (!result.ok) {
        return json({ success: false, conflict: true, version: result.version, store: 'd1' }, 409);
      }
      return json({ success: true, version: result.version, store: 'd1' });
    }

    return json({ success: false, error: 'Method not allowed' }, 405);
  } catch (e: any) {
    console.error('Stats API error:', e);
    return json({ success: false, error: 'Internal error', details: e?.message }, 500);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

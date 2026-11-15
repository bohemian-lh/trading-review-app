// /api/stats?dataset=<id>[&recordIds=1]
// GET  → 读取预计算统计：{ success, version, overview, monthly, analysisResults, cycleStats,
//        cycleStatsGeneratedAt, staleKinds, store }
//        recordIds=1 时给每个周期回填 cycle_records 里的记录 id
// POST → 用 SQL 重算并写入结果表：{ kinds?: ('overview'|'month'|'dimension'|'tab'|'stress'|'cycle')[], ids?: string[] }
//        版本冲突（重算期间记录被改动）返回 409 + 最新 version
// 存储：仅 D1；R2 模式下返回 501。
import { ensureSchemaReady } from '../_lib/d1/schema';
import { getStats, recomputeStats } from '../_lib/d1/statsRepository';
import { shouldUseD1 } from '../_lib/d1/store';
import { corsHeaders } from '../_lib/http/cors';

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('dataset');
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (!datasetId) {
    return json({ success: false, error: 'dataset parameter is required' }, 400, cors);
  }
  if (!shouldUseD1(env)) {
    return json({ success: false, error: '统计数据需要 D1 存储' }, 501, cors);
  }

  try {
    await ensureSchemaReady(env);
    const db = env.D1SQL;

    if (request.method === 'GET') {
      const stats = await getStats(db, datasetId, {
        withRecordIds: url.searchParams.get('recordIds') === '1',
      });
      return json({ success: true, ...stats, store: 'd1' }, 200, cors);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const result = await recomputeStats(db, datasetId, {
        kinds: Array.isArray(body?.kinds) ? body.kinds : undefined,
        ids: Array.isArray(body?.ids) ? body.ids : undefined,
      });
      if (!result.ok) {
        return json({ success: false, conflict: true, version: result.version, store: 'd1' }, 409, cors);
      }
      return json({ success: true, version: result.version, store: 'd1' }, 200, cors);
    }

    return json({ success: false, error: 'Method not allowed' }, 405, cors);
  } catch (e: any) {
    console.error('Stats API error:', e);
    return json({ success: false, error: 'Internal error', details: e?.message }, 500, cors);
  }
}

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

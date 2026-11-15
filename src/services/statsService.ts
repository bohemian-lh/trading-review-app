// 预计算统计结果服务（D1 /api/stats）
// 读取直接取结果表；刷新由服务端用 SQL 重算，前端不再计算总览与配置化序列。
import type { AnalysisSeriesResult, MonthlyAnalysis, StatOverview } from '@/types';

const API_BASE = '';

export interface StatsSnapshot {
  version: number;
  overview: StatOverview | null;
  monthly: MonthlyAnalysis[];
  analysisResults: AnalysisSeriesResult[];
}

export interface RecomputeResult {
  ok: boolean;
  version: number;
  error?: string;
  /** 当前部署未启用 D1，前端回退到浏览器计算，不视为错误 */
  unsupported?: boolean;
}

/** 读取结果表；D1 未启用 / 表为空时返回 null，调用方回退到浏览器计算 */
export async function fetchStats(datasetId: string): Promise<StatsSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/api/stats?dataset=${encodeURIComponent(datasetId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success !== true) return null;
    return {
      version: typeof data.version === 'number' ? data.version : 0,
      overview: data.overview ?? null,
      monthly: Array.isArray(data.monthly) ? data.monthly : [],
      analysisResults: Array.isArray(data.analysisResults) ? data.analysisResults : [],
    };
  } catch {
    return null;
  }
}

/** 触发服务端重算；409 表示重算期间记录被改动，调用方保存后重试一次 */
export async function recomputeStats(
  datasetId: string,
  options: { kinds?: string[]; ids?: string[] } = {},
): Promise<RecomputeResult> {
  try {
    const res = await fetch(`${API_BASE}/api/stats?dataset=${encodeURIComponent(datasetId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 501) return { ok: false, version: 0, unsupported: true };
    if (res.status === 409 || data?.conflict) {
      return { ok: false, version: typeof data?.version === 'number' ? data.version : 0 };
    }
    if (!res.ok || data?.success !== true) {
      return {
        ok: false,
        version: typeof data?.version === 'number' ? data.version : 0,
        error: data?.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, version: typeof data.version === 'number' ? data.version : 0 };
  } catch (e) {
    return { ok: false, version: 0, error: e instanceof Error ? e.message : '统计数据更新失败' };
  }
}

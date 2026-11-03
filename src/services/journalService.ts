// 交易日志 R2 存储服务
import type { TradingJournal, JournalConfigSnapshot } from '@/types';

const API_BASE = '';

/** 日志增量操作 */
export type JournalOp =
  | { op: 'upsert'; journal: TradingJournal }
  | { op: 'delete'; id: string };

/** 服务端版本冲突：携带最新数据供客户端重放未确认操作 */
export class JournalConflictError extends Error {
  readonly version: number;
  readonly journals: TradingJournal[];

  constructor(payload: { version: number; journals: TradingJournal[] }) {
    super('journal version conflict');
    this.name = 'JournalConflictError';
    this.version = payload.version;
    this.journals = payload.journals;
  }
}

async function apiGet<T>(endpoint: string, datasetId: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}?dataset=${encodeURIComponent(datasetId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost<T>(endpoint: string, datasetId: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}?dataset=${encodeURIComponent(datasetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 加载所有日志（含服务端版本号，用于增量写冲突检测） */
export async function loadJournals(datasetId: string): Promise<{ journals: TradingJournal[]; version: number }> {
  const data = await apiGet<{ success: boolean; journals: TradingJournal[]; version?: number }>('/api/journals', datasetId);
  return { journals: data.journals || [], version: typeof data.version === 'number' ? data.version : 0 };
}

/** 提交增量操作，仅上传变更条目 */
export async function saveJournalOps(
  datasetId: string,
  baseVersion: number,
  ops: JournalOp[],
  keepalive = false,
): Promise<{ version: number }> {
  const res = await fetch(`${API_BASE}/api/journals?dataset=${encodeURIComponent(datasetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, ops }),
    keepalive,
  });

  let data: any = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应按错误处理 */ }

  if (res.status === 409 && data?.conflict) {
    throw new JournalConflictError({
      version: typeof data.version === 'number' ? data.version : 0,
      journals: Array.isArray(data.journals) ? data.journals : [],
    });
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

  return { version: typeof data?.version === 'number' ? data.version : baseVersion + 1 };
}

/** 加载所有配置快照 */
export async function loadSnapshots(datasetId: string): Promise<JournalConfigSnapshot[]> {
  const data = await apiGet<{ success: boolean; snapshots: JournalConfigSnapshot[] }>('/api/journal-snapshots', datasetId);
  return data.snapshots || [];
}

/** 保存配置快照（全量覆盖，仅在快照集合真正变化时调用） */
export async function saveSnapshots(datasetId: string, snapshots: JournalConfigSnapshot[]): Promise<void> {
  await apiPost('/api/journal-snapshots', datasetId, { snapshots });
}

/** 加载「后续可关注」列表 */
export async function loadWatchlist(datasetId: string): Promise<string[]> {
  const data = await apiGet<{ success: boolean; watchlist: string[] }>('/api/journal-watchlist', datasetId);
  return data.watchlist || [];
}

/** 保存「后续可关注」列表（全量覆盖） */
export async function saveWatchlist(datasetId: string, watchlist: string[]): Promise<void> {
  await apiPost('/api/journal-watchlist', datasetId, { watchlist });
}

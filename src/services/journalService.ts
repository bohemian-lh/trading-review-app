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

/** 集合类数据（快照 / 关注列表）版本冲突：携带服务端最新数据 */
export class CollectionConflictError extends Error {
  readonly version: number;
  readonly items: any[];

  constructor(version: number, items: any[]) {
    super('collection version conflict');
    this.name = 'CollectionConflictError';
    this.version = version;
    this.items = items;
  }
}

async function apiGet<T>(endpoint: string, datasetId: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}?dataset=${encodeURIComponent(datasetId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.success !== true) throw new Error(data?.error || '读取失败');
  return data as T;
}

/** 日志分页查询参数（服务端分页：页码优先，cursor 仅保留兼容） */
export interface JournalPageQuery {
  limit?: number;
  /** 页码起点 = (页码 - 1) * limit */
  offset?: number;
  cursor?: string | null;
  status?: string;
  fromDay?: string;
  toDay?: string;
  code?: string;
  sort?: 'asc' | 'desc';
  /** manual = 「当前交易」的手动顺序（sort_order），默认按日期 */
  orderBy?: 'date' | 'manual';
}

export interface JournalPage {
  journals: TradingJournal[];
  version: number;
  nextCursor: string | null;
  total: number;
}

/** 按需加载一页日志 */
export async function loadJournalPage(
  datasetId: string,
  query: JournalPageQuery = {},
): Promise<JournalPage> {
  const params = new URLSearchParams({ dataset: datasetId });
  params.set('limit', String(query.limit ?? 50));
  if (typeof query.offset === 'number' && query.offset > 0) params.set('offset', String(query.offset));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.status) params.set('status', query.status);
  if (query.fromDay) params.set('from', query.fromDay);
  if (query.toDay) params.set('to', query.toDay);
  if (query.code) params.set('code', query.code);
  if (query.sort) params.set('sort', query.sort);
  if (query.orderBy === 'manual') params.set('order', 'manual');

  const res = await fetch(`${API_BASE}/api/journals?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.success !== true) throw new Error(data?.error || '读取失败');
  return {
    journals: Array.isArray(data.journals) ? data.journals : [],
    version: typeof data.version === 'number' ? data.version : 0,
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    total: typeof data.total === 'number' ? data.total : 0,
  };
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
  // 严格 ACK：必须明确 success 且回传新版本号，否则视为未写入
  // （旧后端 / 网关登录页 / 静默失败都会走到这里，避免把未落盘误判为已保存）
  if (data?.success !== true) throw new Error(data?.error || '服务端未确认保存');
  if (typeof data.version !== 'number') throw new Error('服务端未返回版本号，保存可能未生效');

  return { version: data.version };
}

/** 加载所有配置快照（含版本号，用于 CAS 保存） */
export async function loadSnapshots(
  datasetId: string,
): Promise<{ snapshots: JournalConfigSnapshot[]; version: number }> {
  const data = await apiGet<{ success: boolean; snapshots: JournalConfigSnapshot[]; version?: number }>(
    '/api/journal-snapshots',
    datasetId,
  );
  return {
    snapshots: data.snapshots || [],
    version: typeof data.version === 'number' ? data.version : 0,
  };
}

/** 保存配置快照（全量语义，服务端按 id 差量落库；带版本号做 CAS） */
export async function saveSnapshots(
  datasetId: string,
  snapshots: JournalConfigSnapshot[],
  baseVersion: number | null = null,
): Promise<{ version: number }> {
  const res = await fetch(`${API_BASE}/api/journal-snapshots?dataset=${encodeURIComponent(datasetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshots, baseVersion: baseVersion ?? undefined }),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应按错误处理 */ }
  if (res.status === 409 && data?.conflict) {
    throw new CollectionConflictError(data.version ?? 0, data.snapshots ?? []);
  }
  if (!res.ok || data?.success !== true) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return { version: typeof data.version === 'number' ? data.version : 0 };
}

/** 加载「后续可关注」列表（含版本号） */
export async function loadWatchlist(datasetId: string): Promise<{ watchlist: string[]; version: number }> {
  const data = await apiGet<{ success: boolean; watchlist: string[]; version?: number }>(
    '/api/journal-watchlist',
    datasetId,
  );
  return {
    watchlist: data.watchlist || [],
    version: typeof data.version === 'number' ? data.version : 0,
  };
}

/** 保存「后续可关注」列表（全量语义，服务端按 position 差量；带版本号做 CAS） */
export async function saveWatchlist(
  datasetId: string,
  watchlist: string[],
  baseVersion: number | null = null,
): Promise<{ version: number }> {
  const res = await fetch(`${API_BASE}/api/journal-watchlist?dataset=${encodeURIComponent(datasetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist, baseVersion: baseVersion ?? undefined }),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应按错误处理 */ }
  if (res.status === 409 && data?.conflict) {
    throw new CollectionConflictError(data.version ?? 0, data.watchlist ?? []);
  }
  if (!res.ok || data?.success !== true) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return { version: typeof data.version === 'number' ? data.version : 0 };
}

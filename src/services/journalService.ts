// 交易日志 R2 存储服务
import type { TradingJournal, JournalConfigSnapshot } from '@/types';

const API_BASE = '';

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

/** 加载所有已提交日志 */
export async function loadJournals(datasetId: string): Promise<TradingJournal[]> {
  const data = await apiGet<{ success: boolean; journals: TradingJournal[] }>('/api/journals', datasetId);
  return data.journals || [];
}

/** 保存日志（全量覆盖） */
export async function saveJournals(datasetId: string, journals: TradingJournal[]): Promise<void> {
  await apiPost('/api/journals', datasetId, { journals });
}

/** 加载所有配置快照 */
export async function loadSnapshots(datasetId: string): Promise<JournalConfigSnapshot[]> {
  const data = await apiGet<{ success: boolean; snapshots: JournalConfigSnapshot[] }>('/api/journal-snapshots', datasetId);
  return data.snapshots || [];
}

/** 保存配置快照（全量覆盖） */
export async function saveSnapshots(datasetId: string, snapshots: JournalConfigSnapshot[]): Promise<void> {
  await apiPost('/api/journal-snapshots', datasetId, { snapshots });
}

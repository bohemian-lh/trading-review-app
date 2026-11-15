// 记录出站队列（Outbox）
// 纯基础设施层：只负责 IndexedDB 读写，不依赖 React / store。
// 作用：记录变更先落盘到本地队列，再请求服务端；请求失败或页面被关掉时，
//      刷新后仍能把未确认的改动重放上去，避免「界面显示已保存、实际没落库」。
import type { RecordsSavePayload } from '@/services/r2Service';
import type { TradingRecord, MonthlyAnalysis, CycleStats } from '@/types';

const DB_NAME = 'trading-records-outbox';
const DB_VERSION = 1;
const STORE = 'pending';

/** 一个数据集只有一条待发记录：多次变更按主键合并成一份最终增量 */
export interface RecordsOutboxEntry {
  datasetId: string;
  upserts: Record<string, TradingRecord>;
  deletes: Record<string, true>;
  customAnalysis?: any;
  customAnalysisSet: boolean;
  monthlyUpserts: Record<string, MonthlyAnalysis>;
  monthlyDeletes: Record<string, true>;
  monthlyUseCustom?: boolean;
  cycleStatsUpserts: Record<string, CycleStats>;
  cycleStatsDeletes: Record<string, { statType: string; cycleId: string }>;
  cycleStatsGeneratedAt?: number | null;
  cycleStatsGeneratedAtSet: boolean;
  /** 本次队列快照的标识，用于 ACK 时判断期间是否有新改动 */
  opId: string;
  updatedAt: number;
}

export function cycleEntryKey(statType: string, cycleId: string): string {
  return `${statType}::${cycleId}`;
}

function emptyEntry(datasetId: string): RecordsOutboxEntry {
  return {
    datasetId,
    upserts: {},
    deletes: {},
    customAnalysisSet: false,
    monthlyUpserts: {},
    monthlyDeletes: {},
    cycleStatsUpserts: {},
    cycleStatsDeletes: {},
    cycleStatsGeneratedAtSet: false,
    opId: '',
    updatedAt: 0,
  };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'datasetId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  dbPromise = pending;
  // 打开失败不缓存，下次变更时再试
  void pending.then(db => {
    if (!db && dbPromise === pending) dbPromise = null;
  });
  return pending;
}

async function putEntry(entry: RecordsOutboxEntry): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function recordsOutboxGet(datasetId: string): Promise<RecordsOutboxEntry | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<RecordsOutboxEntry | null>(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(datasetId);
    req.onsuccess = () => resolve((req.result as RecordsOutboxEntry) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function deleteEntry(datasetId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(datasetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 把一次增量合并进待发队列（同一 id 以最后一次为准，删除覆盖更新） */
export async function recordsOutboxMerge(
  datasetId: string,
  payload: RecordsSavePayload,
): Promise<RecordsOutboxEntry> {
  const existing = (await recordsOutboxGet(datasetId)) ?? emptyEntry(datasetId);
  const next: RecordsOutboxEntry = {
    ...existing,
    upserts: { ...existing.upserts },
    deletes: { ...existing.deletes },
    monthlyUpserts: { ...existing.monthlyUpserts },
    monthlyDeletes: { ...existing.monthlyDeletes },
    cycleStatsUpserts: { ...existing.cycleStatsUpserts },
    cycleStatsDeletes: { ...existing.cycleStatsDeletes },
    opId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    updatedAt: Date.now(),
  };

  for (const record of payload.upserts ?? []) {
    if (!record || typeof record.id !== 'string') continue;
    next.upserts[record.id] = record;
    delete next.deletes[record.id];
  }
  for (const id of payload.deletes ?? []) {
    delete next.upserts[id];
    next.deletes[id] = true;
  }

  if (payload.customAnalysis !== undefined) {
    next.customAnalysis = payload.customAnalysis;
    next.customAnalysisSet = true;
  }

  for (const item of payload.monthlyUpserts ?? []) {
    if (!item || typeof item.month !== 'string') continue;
    next.monthlyUpserts[item.month] = item;
    delete next.monthlyDeletes[item.month];
  }
  for (const month of payload.monthlyDeletes ?? []) {
    delete next.monthlyUpserts[month];
    next.monthlyDeletes[month] = true;
  }
  if (payload.monthlyUseCustom !== undefined) next.monthlyUseCustom = payload.monthlyUseCustom;

  for (const item of payload.cycleStatsUpserts ?? []) {
    if (!item || typeof item.cycleId !== 'string' || typeof item.statType !== 'string') continue;
    const key = cycleEntryKey(item.statType, item.cycleId);
    next.cycleStatsUpserts[key] = item;
    delete next.cycleStatsDeletes[key];
  }
  for (const item of payload.cycleStatsDeletes ?? []) {
    if (!item) continue;
    const key = cycleEntryKey(item.statType, item.cycleId);
    delete next.cycleStatsUpserts[key];
    next.cycleStatsDeletes[key] = item;
  }
  if (payload.cycleStatsGeneratedAt !== undefined) {
    next.cycleStatsGeneratedAt = payload.cycleStatsGeneratedAt;
    next.cycleStatsGeneratedAtSet = true;
  }

  await putEntry(next);
  return next;
}

/** 服务端确认后清理；期间若又产生新改动（opId 变化）则保留 */
export async function recordsOutboxClear(datasetId: string, opId: string): Promise<void> {
  const existing = await recordsOutboxGet(datasetId);
  if (!existing) return;
  if (opId && existing.opId !== opId) return;
  await deleteEntry(datasetId);
}

/** 无条件清空（批量导入等「已整体落盘」的场景） */
export async function recordsOutboxReset(datasetId: string): Promise<void> {
  await deleteEntry(datasetId);
}

export function entryHasChanges(entry: RecordsOutboxEntry): boolean {
  return (
    Object.keys(entry.upserts).length > 0 ||
    Object.keys(entry.deletes).length > 0 ||
    entry.customAnalysisSet ||
    Object.keys(entry.monthlyUpserts).length > 0 ||
    Object.keys(entry.monthlyDeletes).length > 0 ||
    entry.monthlyUseCustom !== undefined ||
    Object.keys(entry.cycleStatsUpserts).length > 0 ||
    Object.keys(entry.cycleStatsDeletes).length > 0 ||
    entry.cycleStatsGeneratedAtSet
  );
}

/** 队列条目 → 上行载荷 */
export function entryToPayload(entry: RecordsOutboxEntry, baseVersion: number): RecordsSavePayload {
  const payload: RecordsSavePayload = { baseVersion };

  const upserts = Object.values(entry.upserts);
  const deletes = Object.keys(entry.deletes);
  if (upserts.length > 0) payload.upserts = upserts;
  if (deletes.length > 0) payload.deletes = deletes;
  if (entry.customAnalysisSet) payload.customAnalysis = entry.customAnalysis;

  const monthlyUpserts = Object.values(entry.monthlyUpserts);
  const monthlyDeletes = Object.keys(entry.monthlyDeletes);
  if (monthlyUpserts.length > 0) payload.monthlyUpserts = monthlyUpserts;
  if (monthlyDeletes.length > 0) payload.monthlyDeletes = monthlyDeletes;
  if (entry.monthlyUseCustom !== undefined) payload.monthlyUseCustom = entry.monthlyUseCustom;

  const cycleUpserts = Object.values(entry.cycleStatsUpserts);
  const cycleDeletes = Object.values(entry.cycleStatsDeletes);
  if (cycleUpserts.length > 0) payload.cycleStatsUpserts = cycleUpserts;
  if (cycleDeletes.length > 0) payload.cycleStatsDeletes = cycleDeletes;
  if (entry.cycleStatsGeneratedAtSet) payload.cycleStatsGeneratedAt = entry.cycleStatsGeneratedAt ?? null;

  return payload;
}

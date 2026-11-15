// 交易日志出站队列（Outbox）
// 定位：纯基础设施层，只做 IndexedDB 读写，不依赖 React / Zustand。
// 作用：日志变更先落盘再更新 UI，刷新、断网、崩溃后仍可重放，
//       避免「网页已显示保存成功、实际未推送到 R2」造成的数据丢失。
import type { TradingJournal, JournalConfigSnapshot } from '@/types';

const DB_NAME = 'trading-journal-outbox';
const DB_VERSION = 1;
const STORE = 'ops';
const DATASET_INDEX = 'byDataset';

export interface JournalOutboxEntry {
  /** 主键 `${datasetId}::${journalId}`：同一条日志在队列中只保留最新一次变更 */
  key: string;
  datasetId: string;
  journalId: string;
  op: 'upsert' | 'delete';
  /** upsert 时的完整日志；delete 时为 null */
  journal: TradingJournal | null;
  /** 新日志引用的配置快照，随日志一起重放，避免刷新后缺配置 */
  snapshot: JournalConfigSnapshot | null;
  /** 客户端幂等标识：同一次变更在重试中保持不变，用于 ACK 比对 */
  opId: string;
  updatedAt: number;
}

export function outboxKey(datasetId: string, journalId: string): string {
  return `${datasetId}::${journalId}`;
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
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex(DATASET_INDEX, 'datasetId');
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
  // 打开失败不缓存，下次变更时再试（隐私模式/被占用等场景可能恢复）
  void pending.then(db => {
    if (!db && dbPromise === pending) dbPromise = null;
  });
  return pending;
}

/** 写入一条待发变更；返回是否真正落盘（IndexedDB 不可用时为 false） */
export async function outboxPut(entry: JournalOutboxEntry): Promise<boolean> {
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

/** 删除已确认的变更（服务端 ACK 之后调用） */
export async function outboxRemove(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 读取某个数据集下所有未确认变更，按写入时间升序 */
export async function outboxList(datasetId: string): Promise<JournalOutboxEntry[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise<JournalOutboxEntry[]>(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index(DATASET_INDEX).getAll(datasetId);
    req.onsuccess = () => {
      const rows = (req.result as JournalOutboxEntry[]) ?? [];
      rows.sort((a, b) => a.updatedAt - b.updatedAt);
      resolve(rows);
    };
    req.onerror = () => resolve([]);
  });
}

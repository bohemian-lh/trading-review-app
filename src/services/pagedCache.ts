// 分页数据本地缓存（IndexedDB，行级）
// 定位：纯基础设施层，只做 IndexedDB 读写，不依赖 React / Zustand。
//
// 为什么是行级：
//   - 同一行可能出现在不同查询的分页里，行级存储才不会出现多份副本互相漂移；
//   - 写操作（编辑/删除）只需按 id 覆盖或删除，不必让整页缓存失效。
//
// 结构：
//   rows  一行一条：{ datasetId, resource, id, data, version, updatedAt }
//   pages 一页一条：{ datasetId, resource, queryKey, ids, nextCursor, total, version, updatedAt }
//
// 一致性：
//   - 读：先出缓存直接渲染，再用服务端返回的 version 判断是否需要覆盖；
//   - 写：按 id 覆盖 rows；pages 只存 id 顺序，因此正文自动跟随。
//   IndexedDB 不可用（隐私模式 / 被占用）时所有方法静默降级为 no-op。

const DB_NAME = 'trading-paged-cache';
const DB_VERSION = 1;
const STORE_ROWS = 'rows';
const STORE_PAGES = 'pages';
const DATASET_INDEX = 'byDataset';

export interface CachedPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
  version: number;
}

interface StoredRow {
  datasetId: string;
  resource: string;
  id: string;
  data: unknown;
  version: number;
  updatedAt: number;
}

interface StoredPage {
  datasetId: string;
  resource: string;
  queryKey: string;
  ids: string[];
  nextCursor: string | null;
  total: number;
  version: number;
  updatedAt: number;
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
        if (!db.objectStoreNames.contains(STORE_ROWS)) {
          const rows = db.createObjectStore(STORE_ROWS, { keyPath: ['datasetId', 'resource', 'id'] });
          rows.createIndex(DATASET_INDEX, 'datasetId');
        }
        if (!db.objectStoreNames.contains(STORE_PAGES)) {
          const pages = db.createObjectStore(STORE_PAGES, { keyPath: ['datasetId', 'resource', 'queryKey'] });
          pages.createIndex(DATASET_INDEX, 'datasetId');
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
  // 打开失败不缓存，下次访问再试（隐私模式等场景可能恢复）
  void pending.then(db => {
    if (!db && dbPromise === pending) dbPromise = null;
  });
  return pending;
}

/** 读取一页缓存；未命中返回 null */
export async function readPage<T>(
  datasetId: string,
  resource: string,
  queryKey: string,
): Promise<CachedPage<T> | null> {
  const db = await openDb();
  if (!db) return null;

  const page = await new Promise<StoredPage | null>(resolve => {
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const req = tx.objectStore(STORE_PAGES).get([datasetId, resource, queryKey]);
    req.onsuccess = () => resolve((req.result as StoredPage | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
  if (!page) return null;

  const ids: string[] = Array.isArray(page.ids) ? page.ids : [];
  const meta = {
    nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null,
    total: Number(page.total ?? 0),
    version: Number(page.version ?? 0),
  };
  if (ids.length === 0) return { items: [], ...meta };

  const rows = await new Promise<StoredRow[]>(resolve => {
    const tx = db.transaction(STORE_ROWS, 'readonly');
    const req = tx.objectStore(STORE_ROWS).getAll(ids.map(id => [datasetId, resource, id]));
    req.onsuccess = () => resolve((req.result as StoredRow[]) ?? []);
    req.onerror = () => resolve([]);
  });

  const byId = new Map<string, T>();
  for (const row of rows) byId.set(String(row.id), row.data as T);
  // 行被删除时（本地删除 / 清理）直接从结果里剔除，避免渲染空行
  const items = ids.map(id => byId.get(id)).filter((item): item is T => item !== undefined);
  return { items, ...meta };
}

/** 写入一页缓存：行内容与 id 顺序一起落盘 */
export async function writePage<T>(params: {
  datasetId: string;
  resource: string;
  queryKey: string;
  items: T[];
  nextCursor: string | null;
  total: number;
  version: number;
  idOf: (item: T) => string;
}): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const { datasetId, resource, queryKey, items, nextCursor, total, version, idOf } = params;
  const now = Date.now();

  await new Promise<void>(resolve => {
    const tx = db.transaction([STORE_ROWS, STORE_PAGES], 'readwrite');
    const rowStore = tx.objectStore(STORE_ROWS);
    const ids: string[] = [];
    for (const item of items) {
      const id = idOf(item);
      ids.push(id);
      rowStore.put({ datasetId, resource, id, data: item, version, updatedAt: now });
    }
    tx.objectStore(STORE_PAGES).put({ datasetId, resource, queryKey, ids, nextCursor, total, version, updatedAt: now });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 只覆盖行内容（本地编辑后调用），页的 id 顺序保持不变 */
export async function writeRows<T>(
  datasetId: string,
  resource: string,
  items: T[],
  idOf: (item: T) => string,
): Promise<void> {
  const db = await openDb();
  if (!db || items.length === 0) return;
  const now = Date.now();
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE_ROWS, 'readwrite');
    const store = tx.objectStore(STORE_ROWS);
    for (const item of items) {
      const id = idOf(item);
      store.put({ datasetId, resource, id, data: item, version: 0, updatedAt: now });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 删除指定行（本地删除后调用） */
export async function removeRows(datasetId: string, resource: string, ids: string[]): Promise<void> {
  const db = await openDb();
  if (!db || ids.length === 0) return;
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE_ROWS, 'readwrite');
    const store = tx.objectStore(STORE_ROWS);
    for (const id of ids) store.delete([datasetId, resource, id]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 清理某个资源（或整个数据集）的分页缓存 */
export async function clearResource(datasetId: string, resource?: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    const tx = db.transaction([STORE_ROWS, STORE_PAGES], 'readwrite');
    for (const name of [STORE_ROWS, STORE_PAGES]) {
      const store = tx.objectStore(name);
      const req = store.index(DATASET_INDEX).openCursor(datasetId);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const value = cursor.value as StoredRow;
        if (!resource || value?.resource === resource) cursor.delete();
        cursor.continue();
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

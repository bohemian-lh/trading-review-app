import { Font } from '@react-pdf/renderer';

// ─── 字体清单 ──────────────────────────────────────────────────────
const FONT_SPECS = [
  { family: 'Noto Sans SC', url: '/fonts/noto-sans-sc-regular.ttf', fontWeight: 400 },
  { family: 'Noto Sans SC', url: '/fonts/noto-sans-sc-bold.ttf', fontWeight: 700 },
] as const;

// ─── IndexedDB 持久化（刷新后零网络下载）───────────────────────────
const DB_NAME = 'pdf_font_cache';
const DB_VERSION = 1;
const STORE = 'fonts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedFont(key: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

async function setCachedFont(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(buffer, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

// 获取字体 ArrayBuffer：优先 IndexedDB，未命中则网络下载并缓存
async function loadFontBuffer(url: string): Promise<ArrayBuffer> {
  try {
    const cached = await getCachedFont(url);
    if (cached) return cached;
  } catch { /* IndexedDB 不可用时回退网络下载 */ }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`字体加载失败: ${url} (${res.status})`);
  const buffer = await res.arrayBuffer();
  try { await setCachedFont(url, buffer); } catch { /* 缓存失败不影响使用 */ }
  return buffer;
}

let registerPromise: Promise<void> | null = null;

// 注册并预加载 Noto Sans SC 字体（幂等：多次调用复用同一 Promise）
// 浏览器版 @react-pdf 仅支持标准字体名 / data URL / fetch URL，故用 blob URL 让 fetch 从内存读取
export function ensurePdfFontsRegistered(): Promise<void> {
  if (!registerPromise) {
    registerPromise = (async () => {
      await Promise.all(FONT_SPECS.map(async (spec) => {
        const buffer = await loadFontBuffer(spec.url);
        const blob = new Blob([buffer], { type: 'font/ttf' });
        const url = URL.createObjectURL(blob);
        try {
          Font.register({ family: spec.family, fonts: [{ src: url, fontWeight: spec.fontWeight }] });
          await Font.load({ fontFamily: spec.family, fontWeight: spec.fontWeight });
        } finally {
          // load 完成后字体已缓存进内存，可安全释放 blob URL
          URL.revokeObjectURL(url);
        }
      }));
    })();
  }
  return registerPromise;
}

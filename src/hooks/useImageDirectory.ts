import { useCallback, useEffect, useState } from 'react';

const IDB_NAME = 'trading-image-dir';
const IDB_VERSION = 1;
const IDB_STORE = 'handles';

interface DirState {
  handle: FileSystemDirectoryHandle | null;
  path: string;
  ready: boolean;
  error: string | null;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, 'root');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('root');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function queryPerm(h: FileSystemDirectoryHandle): Promise<PermissionState> {
  return (h as any).queryPermission?.({ mode: 'readwrite' }) ?? 'prompt';
}
async function requestPerm(h: FileSystemDirectoryHandle): Promise<PermissionState> {
  return (h as any).requestPermission?.({ mode: 'readwrite' }) ?? 'denied';
}

export function useImageDirectory() {
  const [state, setState] = useState<DirState>({ handle: null, path: '', ready: false, error: null });

  // 初始化：从 IndexedDB 恢复句柄
  useEffect(() => {
    (async () => {
      try {
        const handle = await loadHandle();
        if (handle) {
          const permission = await queryPerm(handle);
          if (permission === 'granted') {
            setState({ handle, path: handle.name, ready: true, error: null });
          } else {
            setState({ handle: null, path: '', ready: true, error: '目录权限已过期，请重新选择' });
          }
        } else {
          setState({ handle: null, path: '', ready: true, error: null });
        }
      } catch (e) {
        setState({ handle: null, path: '', ready: true, error: '浏览器不支持本地文件系统 (需要 Chrome)' });
      }
    })();
  }, []);

  // 选择目录
  const selectDirectory = useCallback(async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await storeHandle(handle);
      setState({ handle, path: handle.name, ready: true, error: null });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setState(s => ({ ...s, error: '选择目录失败: ' + e.message }));
      }
    }
  }, []);

  // 确保年度子目录存在
  const ensureYearDir = useCallback(async (): Promise<FileSystemDirectoryHandle> => {
    if (!state.handle) throw new Error('未选择图片存储目录');
    const year = new Date().getFullYear().toString();
    const permission = await queryPerm(state.handle);
    if (permission !== 'granted') {
      const req = await requestPerm(state.handle);
      if (req !== 'granted') throw new Error('目录写入权限被拒绝');
    }
    try {
      return await state.handle.getDirectoryHandle(year, { create: true });
    } catch (e) {
      throw new Error('创建年度目录失败: ' + e);
    }
  }, [state.handle]);

  // 从剪切板粘贴图片到本地目录
  const saveImagesFromClipboard = useCallback(async (prefix: string): Promise<string[]> => {
    if (!state.handle) throw new Error('未选择图片存储目录');
    const items = await navigator.clipboard.read();
    const yearDir = await ensureYearDir();
    const saved: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const imageTypes = items[i].types.filter(t => t.startsWith('image/'));
      if (imageTypes.length === 0) continue;

      const ext = imageTypes[0].includes('png') ? 'png'
        : imageTypes[0].includes('webp') ? 'webp'
        : imageTypes[0].includes('gif') ? 'gif'
        : 'jpg';

      const blob = await items[i].getType(imageTypes[0]);
      const seq = String(i + 1).padStart(2, '0');
      const filename = `${prefix}_${seq}.${ext}`;

      const fileHandle = await yearDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      saved.push(filename);
    }

    return saved;
  }, [state.handle, ensureYearDir]);

  // 删除指定前缀的所有图片
  const deleteImages = useCallback(async (prefix: string): Promise<void> => {
    if (!state.handle) return;
    try {
      const yearDir = await ensureYearDir();
      for await (const [name] of (yearDir as any).entries?.() ?? []) {
        if (typeof name === 'string' && name.startsWith(prefix)) {
          await yearDir.removeEntry(name);
        }
      }
    } catch { /* 目录或文件可能不存在 */ }
  }, [state.handle, ensureYearDir]);

  // 获取图片 Blob URL（用于预览）
  const getImageBlobUrl = useCallback(async (filename: string): Promise<string> => {
    if (!state.handle) throw new Error('未选择图片存储目录');
    const year = new Date().getFullYear().toString();
    const yearDir = await state.handle.getDirectoryHandle(year, { create: false });
    const fileHandle = await yearDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  }, [state.handle]);

  // 生成前缀：YYMMDD + 2位全局序号
  const generatePrefix = useCallback((openDate: string, seq: number): string => {
    const datePart = openDate.replace(/-/g, '').slice(2);
    return datePart + String(seq).padStart(2, '0');
  }, []);

  // 图片的完整本地路径
  const getImageFullPath = useCallback((filename: string): string => {
    const year = new Date().getFullYear().toString();
    return `${state.path}/${year}/${filename}`;
  }, [state.path]);

  return {
    ...state,
    selectDirectory,
    saveImagesFromClipboard,
    deleteImages,
    getImageBlobUrl,
    generatePrefix,
    getImageFullPath,
  };
}

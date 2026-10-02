import { useCallback, useEffect, useReducer, useRef } from 'react';

interface CacheEntry {
  result: unknown;
  deps: unknown[];
}

// 模块级缓存：跨页面切换 / 组件卸载保留，避免每次进入都重新计算
const cache = new Map<string, CacheEntry>();

function depsEqual(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 按需计算：结果快照缓存，不随 deps 变化自动重算。
 * - 首次（无缓存）自动计算一次
 * - deps 变化仅标记 isStale，不自动重算
 * - 调用 refresh() 手动重算
 */
export function useOnDemandCompute<T>(
  key: string | null,
  deps: unknown[],
  compute: () => T,
): { result: T | null; refresh: () => void; isStale: boolean } {
  const computeRef = useRef(compute);
  computeRef.current = compute;

  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // 首次自动计算
  useEffect(() => {
    if (!key) return;
    if (cache.has(key)) return;
    const r = computeRef.current();
    cache.set(key, { result: r, deps: depsRef.current });
    forceUpdate();
  }, [key]);

  const refresh = useCallback(() => {
    if (!key) return;
    const r = computeRef.current();
    cache.set(key, { result: r, deps: depsRef.current });
    forceUpdate();
  }, [key]);

  const entry = key ? cache.get(key) : undefined;
  const result = (entry?.result ?? null) as T | null;
  const isStale = !!key && !!entry && !depsEqual(entry.deps, deps);

  return { result, refresh, isStale };
}

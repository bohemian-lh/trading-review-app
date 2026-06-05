import { useState, useCallback, useEffect } from 'react';

/**
 * 通用的图表可配置 hook
 * 读取/写入 localStorage，管理选中状态
 * 
 * @param chartKey - 图表唯一标识（如 'monthly-total-profit'）
 * @param allKeys - 所有可选项的 key 数组
 * @param defaultSelected - 默认选中的 key 数组（首次使用或 localStorage 无数据时）
 * @returns [selectedKeys, setSelectedKeys, isReady]
 */
export function useChartConfig(
  chartKey: string,
  allKeys: string[],
  defaultSelected?: string[]
): [string[], (keys: string[]) => void, boolean] {
  const storageKey = `chart-config-${chartKey}`;
  const [selected, setSelected] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((k: string) => allKeys.includes(k));
          if (valid.length > 0) {
            setSelected(valid);
            setIsReady(true);
            return;
          }
        }
      }
    } catch {
      // 格式错误，使用默认值
    }
    // 无有效存储数据时使用默认值
    setSelected(defaultSelected || allKeys);
    setIsReady(true);
  }, [storageKey]);

  const updateSelected = useCallback(
    (keys: string[]) => {
      setSelected(keys);
      try {
        localStorage.setItem(storageKey, JSON.stringify(keys));
      } catch {
        // 忽略存储失败
      }
    },
    [storageKey]
  );

  return [selected, updateSelected, isReady];
}

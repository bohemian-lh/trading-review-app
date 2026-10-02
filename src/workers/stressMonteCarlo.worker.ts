// @ts-nocheck
// 蒙特卡洛模拟 Web Worker：在后台执行大量模拟，避免阻塞主线程。
import { runMonteCarloCore } from '../services/stressStatisticsService';

self.onmessage = (e) => {
  const { returns, positions, config } = e.data || {};
  try {
    const result = runMonteCarloCore(returns, positions, config);
    self.postMessage({ success: true, result });
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : '蒙特卡洛模拟失败',
    });
  }
};

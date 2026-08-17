import type { CustomStrategy } from '@/types';

/** 策略项 */
export interface StrategyItem {
  text: string;
  strategyId: string;
  isCustom?: boolean;
}

/** 参与收盘价涨幅计算的价位索引（第一硬止损位/目标位/固定目标位/压力1/压力2） */
export const GAIN_PRICE_INDEXES = [1, 2, 3, 4, 5];

/** 从字符串提取所有数字（纯字符遍历，无正则开销） */
export function extractNumbers(s: string): number[] {
  const nums: number[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      cur += ch;
    } else if (cur) {
      const n = parseFloat(cur);
      if (!isNaN(n)) nums.push(n);
      cur = '';
    }
  }
  if (cur) {
    const n = parseFloat(cur);
    if (!isNaN(n)) nums.push(n);
  }
  return nums;
}

/** 从 priceLevels 提取今日收盘价（趋势最低点 index 6 的第 4 个数字） */
export function getClosePrice(priceLevels: string[]): number | null {
  const nums = extractNumbers(priceLevels?.[6] || '');
  return nums.length >= 4 ? nums[3] : null;
}

/** 涨幅展示片段：isGain 为 true 的片段为涨幅百分比，需红色渲染 */
export interface GainSegment {
  text: string;
  isGain: boolean;
}

/** 计算价位相对收盘价的涨幅，返回片段数组（数字段与涨幅段分离，保留原始数字与分隔符）；无收盘价或无值时返回 null */
export function computeGainSegments(value: string, closePrice: number | null): GainSegment[] | null {
  if (!value || !closePrice) return null;
  const segments: GainSegment[] = [];
  let cur = ''; // 数字缓冲区
  let sep = ''; // 分隔符缓冲区
  let hasNumber = false;

  const flushNum = () => {
    if (cur) {
      const n = parseFloat(cur);
      if (!isNaN(n)) {
        segments.push({ text: cur, isGain: false });
        segments.push({ text: `(${Math.round(((n - closePrice) / closePrice) * 100)}%)`, isGain: true });
        hasNumber = true;
      } else {
        segments.push({ text: cur, isGain: false });
      }
      cur = '';
    }
  };
  const flushSep = () => {
    if (sep) { segments.push({ text: sep, isGain: false }); sep = ''; }
  };

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      flushSep();
      cur += ch;
    } else {
      flushNum();
      sep += ch;
    }
  }
  flushNum();
  flushSep();

  return hasNumber ? segments : null;
}

/** 按 strategyGroup 分组已命中的策略 */
export function groupStrategies(
  journal: { stage: string; strategies: string[]; stageStrategies?: Record<string, string[]>; customStrategies?: Record<string, CustomStrategy[]>; stageCustomStrategies?: Record<string, Record<string, CustomStrategy[]>> },
  stages: any[],
  snapshots: any[],
  stageOverride?: string,  // 可选：指定阶段（用于编辑时预览非当前阶段）
): Record<string, StrategyItem[]> {
  const stageId = stageOverride ?? journal.stage;
  // 优先从 stageStrategies 读取，兼容旧数据 fallback 到 strategies
  const strategyIds: string[] = journal.stageStrategies?.[stageId] ?? (stageId === journal.stage ? journal.strategies : []);
  const customMap: Record<string, CustomStrategy[]> = journal.stageCustomStrategies?.[stageId] ?? (stageId === journal.stage && journal.customStrategies ? journal.customStrategies : {});

  const snapshot = snapshots.find((s: any) => s.snapshotId === (journal as any).snapshotId);
  const stageConfigs = snapshot?.stages || stages;
  const stage = stageConfigs.find((s: any) => s.stageId === stageId);
  if (!stage) return {};
  const result: Record<string, StrategyItem[]> = {};
  for (const g of stage.strategyGroups) {
    result[g.groupId] = [];
    for (const s of g.strategies) {
      if (strategyIds.includes(s.strategyId)) {
        result[g.groupId].push({ text: s.text, strategyId: s.strategyId });
      }
    }
    // 自定义策略
    const customs = customMap?.[g.groupId];
    if (Array.isArray(customs) && customs.length > 0) {
      for (const cs of customs) {
        if (cs.text && cs.text.trim()) {
          result[g.groupId].push({ text: cs.text.trim(), strategyId: cs.id, isCustom: true });
        }
      }
    }
  }
  return result;
}

/** 按自定义顺序排序策略项，无 order 时保持原序 */
export function applySort(items: StrategyItem[], order?: string[]): StrategyItem[] {
  if (!order || order.length === 0) return items;
  const idIndex = new Map<string, number>();
  order.forEach((id, i) => idIndex.set(id, i));
  return [...items].sort((a, b) => {
    const ai = idIndex.get(a.strategyId);
    const bi = idIndex.get(b.strategyId);
    if (ai === undefined && bi === undefined) return 0;
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });
}

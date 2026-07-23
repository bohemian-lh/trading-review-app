import type { TradingJournal } from '@/types';

/** 策略项 */
export interface StrategyItem {
  text: string;
  strategyId: string;
  isCustom?: boolean;
}

/** 按 strategyGroup 分组已命中的策略 */
export function groupStrategies(
  journal: TradingJournal,
  stages: any[],
  snapshots: any[]
): Record<string, StrategyItem[]> {
  const snapshot = snapshots.find((s: any) => s.snapshotId === journal.snapshotId);
  const stageConfigs = snapshot?.stages || stages;
  const stage = stageConfigs.find((s: any) => s.stageId === journal.stage);
  if (!stage) return {};
  const result: Record<string, StrategyItem[]> = {};
  for (const g of stage.strategyGroups) {
    result[g.groupId] = [];
    for (const s of g.strategies) {
      if (journal.strategies.includes(s.strategyId)) {
        result[g.groupId].push({ text: s.text, strategyId: s.strategyId });
      }
    }
    // 自定义策略
    const customs = journal.customStrategies?.[g.groupId];
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

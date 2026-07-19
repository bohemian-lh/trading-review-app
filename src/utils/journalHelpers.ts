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

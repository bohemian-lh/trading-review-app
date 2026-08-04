import type { CustomStrategy } from '@/types';

/** 策略项 */
export interface StrategyItem {
  text: string;
  strategyId: string;
  isCustom?: boolean;
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

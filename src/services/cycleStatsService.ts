import type { TradingRecord, CycleStats, CycleStatType, CycleStatsResult, FieldConfig } from '@/types';
import { generateId } from '@/utils';

// 每周期的记录数
const CYCLE_SIZE = 30;

// 固定的 4 个系统维度（不受配置影响）
const FIXED_STAT_TYPES = ['系统', '系统无失误', '系统有失误', '非系统'];

/**
 * 从 FieldConfig 动态构建完整的 statType 列表
 */
export function buildStatTypes(config: FieldConfig): string[] {
  const types: string[] = [...FIXED_STAT_TYPES];
  for (const t of config.tradingTypes) {
    if (t !== '未知') types.push(t);
  }
  for (const e of config.entryTypes) {
    if (e !== '未知') types.push(e);
  }
  for (const r of config.aggregateRules) {
    types.push(r.name);
  }
  return types;
}

/**
 * 计算盈亏比
 */
export function calculateProfitRatio(records: TradingRecord[]): { profitRatio: number | null; profitSum: number; lossSum: number } {
  if (records.length === 0) {
    return { profitRatio: null, profitSum: 0, lossSum: 0 };
  }

  let profitSum = 0;
  let lossSum = 0;

  for (const record of records) {
    if (record.profitPercent > 0) {
      profitSum += record.profitPercent;
    } else if (record.profitPercent < 0) {
      lossSum += Math.abs(record.profitPercent);
    }
  }

  profitSum = parseFloat(profitSum.toFixed(2));
  lossSum = parseFloat(lossSum.toFixed(2));

  if (profitSum === 0 && lossSum === 0) {
    return { profitRatio: null, profitSum: 0, lossSum: 0 };
  }

  if (profitSum === 0) {
    return { profitRatio: -lossSum, profitSum: 0, lossSum };
  }
  if (lossSum === 0) {
    return { profitRatio: profitSum, profitSum, lossSum: 0 };
  }

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat((larger / smaller).toFixed(2));

  return {
    profitRatio: profitSum > lossSum ? ratio : -ratio,
    profitSum,
    lossSum
  };
}

/**
 * 通用匹配：判断记录是否属于特定统计类型
 */
export function matchesStatType(record: TradingRecord, statType: string, config: FieldConfig): boolean {
  // 4 个固定系统维度
  if (statType === '系统') return record.isSystem === '是';
  if (statType === '系统无失误') return record.isSystem === '是' && record.hasMistake === '否';
  if (statType === '系统有失误') return record.isSystem === '是' && record.hasMistake === '是';
  if (statType === '非系统') return record.isSystem === '否';

  // 交易类型维度
  if (config.tradingTypes.includes(statType)) return record.tradingType === statType;

  // 交易切入类型维度
  if (config.entryTypes.includes(statType)) return record.entryType === statType;

  // 聚合规则维度
  const rule = config.aggregateRules.find(r => r.name === statType);
  if (rule) return rule.includedTypes.includes(record.tradingType);

  return false;
}

/**
 * 创建单个周期统计
 */
function createCycleStats(
  records: TradingRecord[],
  statType: CycleStatType,
  isComplete: boolean,
  existingStats: CycleStats[] = []
): CycleStats {
  const sortedRecords = [...records].sort((a, b) => a.openDate.localeCompare(b.openDate));
  const { profitRatio, profitSum, lossSum } = calculateProfitRatio(sortedRecords);
  const now = Date.now();
  const existingIncomplete = existingStats.find(s => s.statType === statType && !s.isComplete);

  return {
    cycleId: existingIncomplete?.cycleId || generateId(),
    statType,
    startDate: sortedRecords[0].openDate,
    endDate: sortedRecords[sortedRecords.length - 1].openDate,
    recordCount: sortedRecords.length,
    isComplete,
    profitSum,
    lossSum,
    profitRatio,
    recordIds: sortedRecords.map(r => r.id),
    createdAt: existingIncomplete?.createdAt || now,
    updatedAt: now
  };
}

/**
 * 生成周期统计
 * @param records 所有记录
 * @param config 字段配置（驱动 statTypes）
 * @param existingStats 现有的周期统计
 */
export function generateCycleStats(
  records: TradingRecord[],
  config: FieldConfig,
  existingStats: Record<string, CycleStats[]> = {}
): {
  result: CycleStatsResult;
  updatedRecords: TradingRecord[];
} {
  const statTypes = buildStatTypes(config);
  const result: Record<string, CycleStats[]> = {};
  const updatedRecords = [...records];
  const recordIdToIndex = new Map(updatedRecords.map((r, i) => [r.id, i]));

  for (const statType of statTypes) {
    const eligibleRecords = updatedRecords
      .filter(r => matchesStatType(r, statType, config))
      .sort((a, b) => a.openDate.localeCompare(b.openDate));

    if (eligibleRecords.length === 0) {
      result[statType] = existingStats[statType] || [];
      continue;
    }

    const existingComplete = (existingStats[statType] || []).filter(s => s.isComplete);
    const existingIncomplete = (existingStats[statType] || []).filter(s => !s.isComplete);
    const allCycles: CycleStats[] = [...existingComplete];

    if (existingIncomplete.length > 0) {
      const incomplete = existingIncomplete[0];
      const existingRecs = updatedRecords.filter(r => incomplete.recordIds.includes(r.id));
      const newRecs = eligibleRecords.filter(r => !incomplete.recordIds.includes(r.id));
      const mergedRecords = [...existingRecs, ...newRecs].sort((a, b) => a.openDate.localeCompare(b.openDate));

      let index = 0;
      while (index < mergedRecords.length) {
        const batch = mergedRecords.slice(index, index + CYCLE_SIZE);
        index += CYCLE_SIZE;
        const isComplete = batch.length === CYCLE_SIZE;
        const cycle = createCycleStats(batch, statType, isComplete, [incomplete]);
        allCycles.push(cycle);

        if (isComplete) {
          for (const recordId of cycle.recordIds) {
            const idx = recordIdToIndex.get(recordId);
            if (idx !== undefined) {
              updatedRecords[idx] = { ...updatedRecords[idx], hasCycleStats: true, cycleId: cycle.cycleId };
            }
          }
        }
      }
    } else {
      let index = 0;
      while (index < eligibleRecords.length) {
        const batch = eligibleRecords.slice(index, index + CYCLE_SIZE);
        index += CYCLE_SIZE;
        const isComplete = batch.length === CYCLE_SIZE;
        const cycle = createCycleStats(batch, statType, isComplete);
        allCycles.push(cycle);

        if (isComplete) {
          for (const recordId of cycle.recordIds) {
            const idx = recordIdToIndex.get(recordId);
            if (idx !== undefined) {
              updatedRecords[idx] = { ...updatedRecords[idx], hasCycleStats: true, cycleId: cycle.cycleId };
            }
          }
        }
      }
    }

    result[statType] = allCycles;
  }

  return {
    result: { stats: result, generatedAt: Date.now() },
    updatedRecords
  };
}

export function recalculateSingleCycle(cycle: CycleStats, records: TradingRecord[]): CycleStats {
  const cycleRecords = records.filter(r => cycle.recordIds.includes(r.id));
  const { profitRatio, profitSum, lossSum } = calculateProfitRatio(cycleRecords);
  return { ...cycle, profitSum, lossSum, profitRatio, updatedAt: Date.now() };
}

export function removeRecordFromCycle(cycle: CycleStats, recordId: string): CycleStats | null {
  const newRecordIds = cycle.recordIds.filter(id => id !== recordId);
  if (newRecordIds.length === 0) return null;
  return {
    ...cycle,
    recordIds: newRecordIds,
    recordCount: newRecordIds.length,
    isComplete: newRecordIds.length >= CYCLE_SIZE,
    updatedAt: Date.now()
  };
}

export { CYCLE_SIZE };

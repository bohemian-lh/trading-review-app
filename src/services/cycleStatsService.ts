import type { TradingRecord, CycleStats, CycleStatType, CycleStatsResult } from '@/types';
import { generateId } from '@/utils';

// 每周期的记录数
const CYCLE_SIZE = 30;

// 8类统计类型
const STAT_TYPES: CycleStatType[] = [
  '系统',
  '系统无失误',
  '系统有失误',
  '非系统',
  '齐飞水底',
  '齐飞前多踩MA',
  '风险释放平台转一致',
  '双阳平台转一致'
];

/**
 * 计算盈亏比
 * @param records 符合条件的记录数组
 * @returns 盈亏比（带符号，保留两位小数），或 null（没有数据）
 */
export function calculateProfitRatio(records: TradingRecord[]): { profitRatio: number | null; profitSum: number; lossSum: number } {
  if (records.length === 0) {
    return { profitRatio: null, profitSum: 0, lossSum: 0 };
  }

  // 计算盈利和亏损
  let profitSum = 0;
  let lossSum = 0;

  for (const record of records) {
    if (record.profitPercent > 0) {
      profitSum += record.profitPercent;
    } else if (record.profitPercent < 0) {
      lossSum += Math.abs(record.profitPercent);
    }
  }

  // 计算盈亏比
  if (profitSum === 0 && lossSum === 0) {
    return { profitRatio: null, profitSum: 0, lossSum: 0 };
  }

  // 避免除零
  if (profitSum === 0) {
    // 全是亏损
    return { profitRatio: -100.00, profitSum: 0, lossSum };
  }
  if (lossSum === 0) {
    // 全是盈利
    return { profitRatio: 100.00, profitSum, lossSum: 0 };
  }

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat(((larger / smaller) * 100).toFixed(2));

  return {
    profitRatio: profitSum > lossSum ? ratio : -ratio,
    profitSum,
    lossSum
  };
}

/**
 * 判断记录是否属于特定统计类型
 */
function matchesStatType(record: TradingRecord, statType: CycleStatType): boolean {
  switch (statType) {
    case '系统':
      return record.isSystem === '是';
    case '系统无失误':
      return record.isSystem === '是' && record.hasMistake === '否';
    case '系统有失误':
      return record.isSystem === '是' && record.hasMistake === '是';
    case '非系统':
      return record.isSystem === '否' || record.tradingType === '非系统';
    case '齐飞水底':
      return record.tradingType === '齐飞水底';
    case '齐飞前多踩MA':
      return record.tradingType === '齐飞前多踩MA';
    case '风险释放平台转一致':
      return record.tradingType === '风险释放平台转一致';
    case '双阳平台转一致':
      return record.tradingType === '双阳平台转一致';
    default:
      return false;
  }
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
  
  // 查找是否有现有不完整周期可合并
  let existingIncomplete = existingStats.find(s => s.statType === statType && !s.isComplete);
  
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
 * 生成周期统计（方案C：动态增量，支持与不完整周期合并）
 * @param records 所有记录
 * @param existingStats 现有的周期统计
 * @returns 新的周期统计结果和更新后的记录
 */
export function generateCycleStats(
  records: TradingRecord[],
  existingStats: Record<CycleStatType, CycleStats[]> = Object.fromEntries(
    STAT_TYPES.map(type => [type, []])
  ) as unknown as Record<CycleStatType, CycleStats[]>
): { 
  result: CycleStatsResult; 
  updatedRecords: TradingRecord[];
} {
  const result: Record<CycleStatType, CycleStats[]> = Object.fromEntries(
    STAT_TYPES.map(type => [type, []])
  ) as unknown as Record<CycleStatType, CycleStats[]>;

  const updatedRecords = [...records];
  const recordIdToIndex = new Map(updatedRecords.map((r, i) => [r.id, i]));

  // 对每类统计单独处理
  for (const statType of STAT_TYPES) {
    // 筛选该类符合条件的记录
    const eligibleRecords = updatedRecords
      .filter(r => matchesStatType(r, statType))
      .sort((a, b) => a.openDate.localeCompare(b.openDate));
    
    if (eligibleRecords.length === 0) {
      result[statType] = existingStats[statType] || [];
      continue;
    }

    // 获取该类型现有完整周期
    const existingComplete = (existingStats[statType] || []).filter(s => s.isComplete);
    const existingIncomplete = (existingStats[statType] || []).filter(s => !s.isComplete);
    
    // 筛选未标记的记录
    const unmarkedRecords = eligibleRecords.filter(r => !r.hasCycleStats);
    
    const allCycles: CycleStats[] = [...existingComplete];
    
    // 处理方式：先尝试与现有不完整周期合并，再生成新周期
    let currentBatch = [...unmarkedRecords];
    
    // 处理现有不完整周期
    if (existingIncomplete.length > 0) {
      const incomplete = existingIncomplete[0];
      // 获取原不完整周期包含的记录
      const existingRecords = updatedRecords.filter(r => incomplete.recordIds.includes(r.id));
      
      // 合并现有记录和新记录
      const mergedRecords = [...existingRecords, ...currentBatch].sort(
        (a, b) => a.openDate.localeCompare(b.openDate)
      );
      
      // 将合并后的记录切分
      let index = 0;
      while (index < mergedRecords.length) {
        const batch = mergedRecords.slice(index, index + CYCLE_SIZE);
        index += CYCLE_SIZE;
        
        const isComplete = batch.length === CYCLE_SIZE;
        const cycle = createCycleStats(batch, statType, isComplete, [incomplete]);
        allCycles.push(cycle);
        
        // 如果是完整周期，标记对应记录
        if (isComplete) {
          for (const recordId of cycle.recordIds) {
            const idx = recordIdToIndex.get(recordId);
            if (idx !== undefined) {
              updatedRecords[idx] = {
                ...updatedRecords[idx],
                hasCycleStats: true,
                cycleId: cycle.cycleId
              };
            }
          }
        }
      }
    } else {
      // 没有现有不完整周期，直接切分
      let index = 0;
      while (index < unmarkedRecords.length) {
        const batch = unmarkedRecords.slice(index, index + CYCLE_SIZE);
        index += CYCLE_SIZE;
        
        const isComplete = batch.length === CYCLE_SIZE;
        const cycle = createCycleStats(batch, statType, isComplete);
        allCycles.push(cycle);
        
        if (isComplete) {
          for (const recordId of cycle.recordIds) {
            const idx = recordIdToIndex.get(recordId);
            if (idx !== undefined) {
              updatedRecords[idx] = {
                ...updatedRecords[idx],
                hasCycleStats: true,
                cycleId: cycle.cycleId
              };
            }
          }
        }
      }
    }
    
    result[statType] = allCycles;
  }

  return {
    result: {
      stats: result,
      generatedAt: Date.now()
    },
    updatedRecords
  };
}

export { STAT_TYPES, CYCLE_SIZE };

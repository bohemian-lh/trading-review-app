import type { TradingRecord, YesNo, AggregateRule, TheoreticalDimension, FieldConfig, AnalysisResult } from '@/types';

// 盈亏比计算规则 (v3):
// - 总盈利绝对值 > 总亏损绝对值: 盈亏比 = 总盈利绝对值 / 总亏损绝对值 (正)
// - 总盈利绝对值 < 总亏损绝对值: 盈亏比 = -总亏损绝对值 / 总盈利绝对值 (负)
// - 全盈利(无亏损): 盈利之和 / 1.00
// - 全亏损(无盈利): |亏损之和| / -1.00
// - 无有效数据(双零): 'N/A'
// - 结果保留 2 位小数

export function calculateProfitRatio(
  records: TradingRecord[],
  isSystem?: YesNo,
  hasMistake?: YesNo
): number | 'N/A' {
  let sumPositive = 0;
  let sumNegative = 0;

  for (const record of records) {
    if (isSystem !== undefined) {
      const marker = isSystem === '是' ? '系统' : '非系统';
      if (!record.patternFeatures.includes(marker)) continue;
    }
    if (hasMistake !== undefined && record.hasMistake !== hasMistake) continue;

    const profit = record.profitPercent;
    if (profit > 0) sumPositive += profit;
    else if (profit < 0) sumNegative += profit;
  }

  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 && absLoss === 0) return 'N/A';
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  if (absProfit === 0 && absLoss > 0) return parseFloat((-absLoss / 1).toFixed(2));

  let ratio: number;
  if (absProfit > absLoss) {
    ratio = absProfit / absLoss;
  } else if (absProfit < absLoss) {
    ratio = -(absLoss / absProfit);
  } else {
    ratio = sumPositive > 0 ? 1.0 : -1.0;
  }

  return parseFloat(ratio.toFixed(2));
}

/** 获取某条记录在指定理论维度下的数值（未填则默认等于盈亏情况） */
export function getTheoreticalRatio(record: TradingRecord, dimensionId: string): number {
  return record.theoreticalProfitRatios[dimensionId] ?? record.profitPercent;
}

/** 计算某理论维度下的系统盈亏比 */
export function calculateTheoreticalSystemProfitRatio(records: TradingRecord[], dimensionId: string): number | 'N/A' {
  const systemRecords = records.filter(r => r.patternFeatures.includes('系统'));
  let sumPositive = 0;
  let sumNegative = 0;

  for (const r of systemRecords) {
    const val = getTheoreticalRatio(r, dimensionId);
    if (val > 0) sumPositive += val;
    else if (val < 0) sumNegative += val;
  }

  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 && absLoss === 0) return 'N/A';
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  if (absProfit === 0 && absLoss > 0) return parseFloat((-absLoss / 1).toFixed(2));

  let ratio: number;
  if (absProfit > absLoss) ratio = absProfit / absLoss;
  else if (absProfit < absLoss) ratio = -(absLoss / absProfit);
  else ratio = sumPositive > 0 ? 1.0 : -1.0;

  return parseFloat(ratio.toFixed(2));
}

/** 批量计算所有理论维度的系统盈亏比 */
export function calculateTheoreticalProfitRatios(
  records: TradingRecord[],
  dimensions: TheoreticalDimension[]
): Record<string, number | 'N/A'> {
  const result: Record<string, number | 'N/A'> = {};
  for (const d of dimensions) {
    result[d.id] = calculateTheoreticalSystemProfitRatio(records, d.id);
  }
  return result;
}

export function calculateAvgProfitRatio(
  records: TradingRecord[]
): number | 'N/A' {
  let sumPositive = 0;
  let sumNegative = 0;

  for (const record of records) {
    const profit = record.profitPercent;
    if (profit > 0) sumPositive += profit;
    else if (profit < 0) sumNegative += profit;
  }

  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 && absLoss === 0) return 'N/A';
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  if (absProfit === 0 && absLoss > 0) return parseFloat((-absLoss / 1).toFixed(2));

  let ratio: number;
  if (absProfit > absLoss) {
    ratio = absProfit / absLoss;
  } else if (absProfit < absLoss) {
    ratio = -(absLoss / absProfit);
  } else {
    ratio = sumPositive > 0 ? 1.0 : -1.0;
  }

  return parseFloat(ratio.toFixed(2));
}

export function calculateTotalProfit(
  records: TradingRecord[]
): number | 'N/A' {
  let total = 0;
  let hasData = false;

  for (const record of records) {
    total += record.profitPercent;
    hasData = true;
  }

  if (!hasData) return 'N/A';

  return Math.round(total * 100) / 100;
}

export function calculateAverageHoldDays(
  records: TradingRecord[],
  isSystem?: YesNo,
  profitType?: 'positive' | 'negative'
): number | 'N/A' {
  const holdDays: number[] = [];

  for (const record of records) {
    if (isSystem !== undefined) {
      const marker = isSystem === '是' ? '系统' : '非系统';
      if (!record.patternFeatures.includes(marker)) continue;
    }

    const profit = record.profitPercent;
    if (profitType === 'positive' && profit <= 0) continue;
    if (profitType === 'negative' && profit >= 0) continue;

    holdDays.push(record.holdDays);
  }

  if (holdDays.length === 0) return 'N/A';

  const avg = holdDays.reduce((sum, days) => sum + days, 0) / holdDays.length;
  return Math.round(avg * 100) / 100;
}

export function calculateProfitRatioByType(records: TradingRecord[], tradingType: string): number {
  const typeRecords = records.filter(r => r.tradingType === tradingType);

  let profitSum = 0;
  let lossSum = 0;

  for (const r of typeRecords) {
    if (r.profitPercent > 0) profitSum += r.profitPercent;
    else if (r.profitPercent < 0) lossSum += Math.abs(r.profitPercent);
  }

  if (profitSum === 0 && lossSum === 0) return 0;
  if (profitSum > 0 && lossSum === 0) return parseFloat((profitSum / 1).toFixed(2));
  if (profitSum === 0 && lossSum > 0) return parseFloat((-lossSum / 1).toFixed(2));

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat((larger / smaller).toFixed(2));
  return profitSum > lossSum ? ratio : -ratio;
}

export function calculateProfitRatioByMultipleTypes(records: TradingRecord[], tradingTypes: string[]): number {
  const typeRecords = records.filter(r => tradingTypes.includes(r.tradingType));

  let profitSum = 0;
  let lossSum = 0;

  for (const r of typeRecords) {
    if (r.profitPercent > 0) profitSum += r.profitPercent;
    else if (r.profitPercent < 0) lossSum += Math.abs(r.profitPercent);
  }

  if (profitSum === 0 && lossSum === 0) return 0;
  if (profitSum > 0 && lossSum === 0) return parseFloat((profitSum / 1).toFixed(2));
  if (profitSum === 0 && lossSum > 0) return parseFloat((-lossSum / 1).toFixed(2));

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat((larger / smaller).toFixed(2));
  return profitSum > lossSum ? ratio : -ratio;
}

export function calculateProfitRatioByTrendFeature(records: TradingRecord[], trendFeature: string): number {
  const typeRecords = records.filter(r => r.trendFeatures.includes(trendFeature));

  let profitSum = 0;
  let lossSum = 0;

  for (const r of typeRecords) {
    if (r.profitPercent > 0) profitSum += r.profitPercent;
    else if (r.profitPercent < 0) lossSum += Math.abs(r.profitPercent);
  }

  if (profitSum === 0 && lossSum === 0) return 0;
  if (profitSum > 0 && lossSum === 0) return parseFloat((profitSum / 1).toFixed(2));
  if (profitSum === 0 && lossSum > 0) return parseFloat((-lossSum / 1).toFixed(2));

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat((larger / smaller).toFixed(2));
  return profitSum > lossSum ? ratio : -ratio;
}

// ============ 动态批量计算函数（Phase 2：从 fieldConfig 驱动）===========

export function calculateTradingTypeRatios(
  records: TradingRecord[],
  tradingTypes: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const type of tradingTypes) {
    if (type === '未知') continue;
    result[type] = calculateProfitRatioByType(records, type);
  }
  return result;
}

export function calculateTrendFeatureRatios(
  records: TradingRecord[],
  trendFeatures: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const type of trendFeatures) {
    if (type === '未知') continue;
    result[type] = calculateProfitRatioByTrendFeature(records, type);
  }
  return result;
}

export function calculateAggregateRatios(
  records: TradingRecord[],
  rules: AggregateRule[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const rule of rules) {
    result[rule.name] = calculateProfitRatioByMultipleTypes(records, rule.includedTypes);
  }
  return result;
}

// ============ 单次遍历聚合（O(n)：一次扫描产出所有维度，替代逐维度全表扫描） ============
// 说明：以下 ratioV3 / ratioV2 与上方 calculateProfitRatio / calculateProfitRatioByType
// 的公式严格一致，仅供聚合函数复用；上方函数保留给其它调用点与既有测试。

interface AccV3 { sp: number; sn: number } // sp=总盈利(带符号+)，sn=总亏损(带符号-)
interface AccV2 { profit: number; loss: number } // loss 为绝对值
interface HoldAcc { sum: number; count: number }

function addV3(acc: AccV3, v: number): void {
  if (v > 0) acc.sp += v;
  else if (v < 0) acc.sn += v;
}

function addV2(acc: AccV2, v: number): void {
  if (v > 0) acc.profit += v;
  else if (v < 0) acc.loss += Math.abs(v);
}

/** v3 盈亏比：由带符号的盈利/亏损总和求比例（与 calculateProfitRatio 一致） */
function ratioV3(sumPositive: number, sumNegative: number): number | 'N/A' {
  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 && absLoss === 0) return 'N/A';
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  if (absProfit === 0 && absLoss > 0) return parseFloat((-absLoss / 1).toFixed(2));

  let ratio: number;
  if (absProfit > absLoss) ratio = absProfit / absLoss;
  else if (absProfit < absLoss) ratio = -(absLoss / absProfit);
  else ratio = sumPositive > 0 ? 1.0 : -1.0;

  return parseFloat(ratio.toFixed(2));
}

/** v2 盈亏比：由盈利/亏损绝对值求比例（与 calculateProfitRatioByType 一致） */
function ratioV2(profitSum: number, lossSum: number): number {
  if (profitSum === 0 && lossSum === 0) return 0;
  if (profitSum > 0 && lossSum === 0) return parseFloat((profitSum / 1).toFixed(2));
  if (profitSum === 0 && lossSum > 0) return parseFloat((-lossSum / 1).toFixed(2));

  const larger = Math.max(profitSum, lossSum);
  const smaller = Math.min(profitSum, lossSum);
  const ratio = parseFloat((larger / smaller).toFixed(2));
  return profitSum > lossSum ? ratio : -ratio;
}

function holdAvg(acc: HoldAcc): number | 'N/A' {
  if (acc.count === 0) return 'N/A';
  return Math.round((acc.sum / acc.count) * 100) / 100;
}

/**
 * 一次遍历 records 计算完整分析结果（含所有 fieldConfig 驱动维度）。
 * 相比逐维度调用 calculate*（每次全表扫描），复杂度从 O(K·n) 降到 O(n + K)。
 */
export function computeAnalysisResult(records: TradingRecord[], config: FieldConfig): AnalysisResult {
  const system: AccV3 = { sp: 0, sn: 0 };
  const systemNoMistake: AccV3 = { sp: 0, sn: 0 };
  const systemWithMistake: AccV3 = { sp: 0, sn: 0 };
  const nonSystem: AccV3 = { sp: 0, sn: 0 };

  const holdSysProfit: HoldAcc = { sum: 0, count: 0 };
  const holdSysLoss: HoldAcc = { sum: 0, count: 0 };
  const holdNonProfit: HoldAcc = { sum: 0, count: 0 };
  const holdNonLoss: HoldAcc = { sum: 0, count: 0 };

  const tradingAcc = new Map<string, AccV2>();
  for (const t of config.tradingTypes) if (t !== '未知') tradingAcc.set(t, { profit: 0, loss: 0 });

  const trendAcc = new Map<string, AccV2>();
  for (const f of config.trendFeatures) if (f !== '未知') trendAcc.set(f, { profit: 0, loss: 0 });

  const aggregateAcc = new Map<string, AccV2>();
  for (const rule of config.aggregateRules) aggregateAcc.set(rule.name, { profit: 0, loss: 0 });

  const theoreticalAcc = new Map<string, AccV3>();
  for (const d of config.theoreticalDimensions) theoreticalAcc.set(d.id, { sp: 0, sn: 0 });

  for (const r of records) {
    const profit = r.profitPercent;
    const isSystem = r.patternFeatures.includes('系统');
    const isNonSystem = r.patternFeatures.includes('非系统');

    if (isSystem) {
      addV3(system, profit);
      if (r.hasMistake === '否') addV3(systemNoMistake, profit);
      else if (r.hasMistake === '是') addV3(systemWithMistake, profit);

      if (profit > 0) { holdSysProfit.sum += r.holdDays; holdSysProfit.count++; }
      else if (profit < 0) { holdSysLoss.sum += r.holdDays; holdSysLoss.count++; }
    }
    if (isNonSystem) {
      addV3(nonSystem, profit);
      if (profit > 0) { holdNonProfit.sum += r.holdDays; holdNonProfit.count++; }
      else if (profit < 0) { holdNonLoss.sum += r.holdDays; holdNonLoss.count++; }
    }

    const ta = tradingAcc.get(r.tradingType);
    if (ta) addV2(ta, profit);

    for (const f of new Set(r.trendFeatures)) {
      const fa = trendAcc.get(f);
      if (fa) addV2(fa, profit);
    }

    for (const rule of config.aggregateRules) {
      if (rule.includedTypes.includes(r.tradingType)) {
        addV2(aggregateAcc.get(rule.name)!, profit);
      }
    }

    if (isSystem) {
      for (const d of config.theoreticalDimensions) {
        addV3(theoreticalAcc.get(d.id)!, getTheoreticalRatio(r, d.id));
      }
    }
  }

  const result: AnalysisResult = {
    systemProfitRatio: ratioV3(system.sp, system.sn),
    systemNoMistakeProfitRatio: ratioV3(systemNoMistake.sp, systemNoMistake.sn),
    systemWithMistakeProfitRatio: ratioV3(systemWithMistake.sp, systemWithMistake.sn),
    nonSystemProfitRatio: ratioV3(nonSystem.sp, nonSystem.sn),
    systemProfitAvgHoldDays: holdAvg(holdSysProfit),
    systemLossAvgHoldDays: holdAvg(holdSysLoss),
    nonSystemProfitAvgHoldDays: holdAvg(holdNonProfit),
    nonSystemLossAvgHoldDays: holdAvg(holdNonLoss),
    tradingTypeRatios: {},
    trendFeatureRatios: {},
    aggregateRatios: {},
    theoreticalProfitRatios: {},
  };

  for (const [k, acc] of tradingAcc) result.tradingTypeRatios[k] = ratioV2(acc.profit, acc.loss);
  for (const [k, acc] of trendAcc) result.trendFeatureRatios[k] = ratioV2(acc.profit, acc.loss);
  for (const [k, acc] of aggregateAcc) result.aggregateRatios[k] = ratioV2(acc.profit, acc.loss);
  for (const [k, acc] of theoreticalAcc) result.theoreticalProfitRatios[k] = ratioV3(acc.sp, acc.sn);

  return result;
}

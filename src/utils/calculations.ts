import type { TradingRecord, YesNo, AggregateRule, SubsequentProfitAnalysis, SubsequentProfitStats, HistogramBucket, FieldConfig } from '@/types';
import { DEFAULT_HISTOGRAM_CUTS, buildHistogramLabels, bucketValue } from '@/types';

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
    if (isSystem !== undefined && record.isSystem !== isSystem) continue;
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

/** 计算理论盈亏比（使用 theoreticalProfitPercent 字段） */
export function calculateTheoreticalSystemProfitRatio(records: TradingRecord[]): number | 'N/A' {
  const systemRecords = records.filter(r => r.isSystem === '是');
  let sumPositive = 0;
  let sumNegative = 0;

  for (const r of systemRecords) {
    const val = r.theoreticalProfitPercent;
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
    if (isSystem !== undefined && record.isSystem !== isSystem) continue;

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

export function calculateProfitRatioByEntryType(records: TradingRecord[], entryType: string): number {
  const typeRecords = records.filter(r => r.entryType.includes(entryType));

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

export function calculateEntryTypeRatios(
  records: TradingRecord[],
  entryTypes: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const type of entryTypes) {
    if (type === '未知') continue;
    result[type] = calculateProfitRatioByEntryType(records, type);
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

// ============ 后续盈亏空间分析 ============

export function calculateSubsequentProfitAnalysis(
  records: TradingRecord[],
  tradingTypes: string[],
  fieldConfig?: FieldConfig
): SubsequentProfitAnalysis {
  const types = tradingTypes.filter(t => t !== '未知');
  const allPoints: SubsequentProfitAnalysis['allPoints'] = [];
  const stats: SubsequentProfitStats[] = [];

  for (const type of types) {
    const validRecords = records.filter(
      r => r.tradingType === type && r.subsequentProfitSpace !== null
    );

    // 散点图数据
    for (const r of validRecords) {
      allPoints.push({
        tradingType: type,
        value: r.subsequentProfitSpace as number,
        stockName: r.stockName,
      });
    }

    if (validRecords.length === 0) {
      stats.push({ tradingType: type, count: 0, avg: 0, max: 0, min: 0, histogram: [] });
      continue;
    }

    const values = validRecords.map(r => r.subsequentProfitSpace as number);
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const avg = parseFloat((sorted.reduce((s, v) => s + v, 0) / count).toFixed(2));

    // 直方图：从 fieldConfig 取切分点，否则用默认
    const cuts = fieldConfig?.histogramConfigs?.[type]?.cuts ?? DEFAULT_HISTOGRAM_CUTS;
    const labels = buildHistogramLabels(cuts);
    const histogram: HistogramBucket[] = labels.map(label => ({ label, count: 0 }));
    for (const v of values) {
      const idx = bucketValue(v, cuts);
      histogram[idx].count++;
    }

    stats.push({
      tradingType: type,
      count,
      avg,
      max: sorted[count - 1],
      min: sorted[0],
      histogram,
    });
  }

  return { stats, allPoints };
}

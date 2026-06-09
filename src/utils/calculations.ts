import type { TradingRecord, YesNo } from '@/types';

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

  // 无有效数据
  if (absProfit === 0 && absLoss === 0) return 'N/A';
  // 全盈利
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  // 全亏损
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

  // 无有效数据
  if (profitSum === 0 && lossSum === 0) return 0;
  // 全盈利
  if (profitSum > 0 && lossSum === 0) return parseFloat((profitSum / 1).toFixed(2));
  // 全亏损
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
  const typeRecords = records.filter(r => r.entryType === entryType);

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

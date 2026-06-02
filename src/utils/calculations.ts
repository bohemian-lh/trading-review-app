import type { TradingRecord, YesNo } from '@/types';

export function calculateProfitRatio(
  records: TradingRecord[],
  isSystem?: YesNo,
  hasMistake?: YesNo
): number | 'N/A' {
  let sumPositive = 0;
  let sumNegative = 0;

  for (const record of records) {
    if (isSystem !== undefined && record.isSystem !== isSystem) {
      continue;
    }
    if (hasMistake !== undefined && record.hasMistake !== hasMistake) {
      continue;
    }

    const profit = record.profitPercent;
    if (profit > 0) {
      sumPositive += profit;
    } else if (profit < 0) {
      sumNegative += profit;
    }
  }

  if (sumPositive === 0 && sumNegative === 0) {
    return 'N/A';
  }

  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 || absLoss === 0) {
    return 'N/A';
  }

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
    if (profit > 0) {
      sumPositive += profit;
    } else if (profit < 0) {
      sumNegative += profit;
    }
  }

  if (sumPositive === 0 && sumNegative === 0) {
    return 'N/A';
  }

  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 || absLoss === 0) {
    return 'N/A';
  }

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

  if (!hasData) {
    return 'N/A';
  }

  return Math.round(total * 100) / 100;
}

export function calculateAverageHoldDays(
  records: TradingRecord[],
  isSystem?: YesNo,
  profitType?: 'positive' | 'negative'
): number | 'N/A' {
  const holdDays: number[] = [];

  for (const record of records) {
    if (isSystem !== undefined && record.isSystem !== isSystem) {
      continue;
    }

    const profit = record.profitPercent;
    if (profitType === 'positive' && profit <= 0) {
      continue;
    }
    if (profitType === 'negative' && profit >= 0) {
      continue;
    }

    holdDays.push(record.holdDays);
  }

  if (holdDays.length === 0) {
    return 'N/A';
  }

  const avg = holdDays.reduce((sum, days) => sum + days, 0) / holdDays.length;
  return Math.round(avg * 100) / 100;
}

// 按交易类型维度计算盈亏比
// 盈亏比 = 盈利交易总金额 / |亏损交易总金额|，保留两位小数
// 若亏损交易总金额为 0，返回 0
export function calculateProfitRatioByType(records: TradingRecord[], tradingType: string): number {
  const typeRecords = records.filter(r => r.tradingType === tradingType);
  
  let profitSum = 0;
  let lossSum = 0;

  for (const r of typeRecords) {
    if (r.profitPercent > 0) {
      profitSum += r.profitPercent;
    } else if (r.profitPercent < 0) {
      lossSum += Math.abs(r.profitPercent);
    }
    // profitPercent === 0 忽略
  }

  if (lossSum === 0) return 0;
  
  return parseFloat((profitSum / lossSum).toFixed(2));
}

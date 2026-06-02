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

  return Math.round(ratio * 10) / 10;
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

  return Math.round(ratio * 10) / 10;
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

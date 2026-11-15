import { useMemo } from 'react';
import type { AnalysisResult, MonthlyAnalysis, TradingRecord } from '@/types';
import { useRecordsStore } from '@/stores/recordsStore';
import { calculateProfitRatio, calculateAvgProfitRatio, calculateTotalProfit, computeAnalysisResult } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';

export function useAnalysisResult(): AnalysisResult {
  const records = useRecordsStore((s) => s.records);
  const customAnalysis = useRecordsStore((s) => s.customAnalysis);
  const fieldConfig = useRecordsStore((s) => s.fieldConfig);
  const overview = useRecordsStore((s) => s.statOverview);

  return useMemo(() => {
    if (customAnalysis.useCustom) return customAnalysis.data;
    // 结果表优先：读取即取数，不再从明细重算
    if (overview) {
      // 结果表只包含出现过的键；按配置补齐缺失项，保证展示与本地计算一致
      const tradingTypeRatios = { ...overview.tradingTypeRatios };
      for (const type of fieldConfig.tradingTypes) {
        if (type !== '未知' && tradingTypeRatios[type] === undefined) tradingTypeRatios[type] = 0;
      }
      const trendFeatureRatios = { ...overview.trendFeatureRatios };
      for (const feature of fieldConfig.trendFeatures) {
        if (feature !== '未知' && trendFeatureRatios[feature] === undefined) trendFeatureRatios[feature] = 0;
      }
      const aggregateRatios = { ...overview.aggregateRatios };
      for (const rule of fieldConfig.aggregateRules) {
        if (aggregateRatios[rule.name] === undefined) aggregateRatios[rule.name] = 0;
      }
      const theoreticalProfitRatios = { ...overview.theoreticalProfitRatios };
      for (const dim of fieldConfig.theoreticalDimensions) {
        if (theoreticalProfitRatios[dim.id] === undefined) theoreticalProfitRatios[dim.id] = 'N/A';
      }

      return {
        systemProfitRatio: overview.systemProfitRatio,
        systemNoMistakeProfitRatio: overview.systemNoMistakeProfitRatio,
        systemWithMistakeProfitRatio: overview.systemWithMistakeProfitRatio,
        nonSystemProfitRatio: overview.nonSystemProfitRatio,
        systemProfitAvgHoldDays: overview.systemProfitAvgHoldDays,
        systemLossAvgHoldDays: overview.systemLossAvgHoldDays,
        nonSystemProfitAvgHoldDays: overview.nonSystemProfitAvgHoldDays,
        nonSystemLossAvgHoldDays: overview.nonSystemLossAvgHoldDays,
        tradingTypeRatios,
        trendFeatureRatios,
        aggregateRatios,
        theoreticalProfitRatios,
      };
    }
    return computeAnalysisResult(records, fieldConfig);
  }, [records, customAnalysis, fieldConfig, overview]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const records = useRecordsStore((s) => s.records);
  const customMonthly = useRecordsStore((s) => s.customMonthly);
  const statMonthly = useRecordsStore((s) => s.statMonthly);

  return useMemo(() => {
    if (customMonthly.useCustom) return customMonthly.data;
    // 结果表优先：没有结果表（迁移前 / R2 模式）才回退到浏览器计算
    if (statMonthly.length > 0) return statMonthly;
    const monthMap = new Map<string, TradingRecord[]>();
    for (const r of records) {
      const month = extractMonth(r.openDate);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month)!.push(r);
    }
    const months = Array.from(monthMap.keys()).sort();
    return months.map(month => {
      const monthRecords = monthMap.get(month)!;
      return {
        month,
        systemProfitRatio: calculateProfitRatio(monthRecords, '是'),
        systemNoMistakeProfitRatio: calculateProfitRatio(monthRecords, '是', '否'),
        systemWithMistakeProfitRatio: calculateProfitRatio(monthRecords, '是', '是'),
        nonSystemProfitRatio: calculateProfitRatio(monthRecords, '否'),
        avgProfitRatio: calculateAvgProfitRatio(monthRecords),
        totalProfit: calculateTotalProfit(monthRecords),
      };
    });
  }, [records, customMonthly, statMonthly]);
}

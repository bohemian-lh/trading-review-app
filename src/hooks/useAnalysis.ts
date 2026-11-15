import { useMemo } from 'react';
import type { AnalysisResult, MonthlyAnalysis } from '@/types';
import { useRecordsStore } from '@/stores/recordsStore';

/**
 * 统计结果一律来自服务端预计算（/api/stats）。
 *
 * 历史实现会在结果表为空时用内存里的 records 现算，但记录已经改成按页加载，
 * 那样算出来的是"当前页"的数字，看起来正常却完全错误 —— 所以这里不再回退，
 * 缺失时返回空结构，由页面提示"尚未生成统计"。
 */
const EMPTY_ANALYSIS: AnalysisResult = {
  systemProfitRatio: 'N/A',
  systemNoMistakeProfitRatio: 'N/A',
  systemWithMistakeProfitRatio: 'N/A',
  nonSystemProfitRatio: 'N/A',
  systemProfitAvgHoldDays: 'N/A',
  systemLossAvgHoldDays: 'N/A',
  nonSystemProfitAvgHoldDays: 'N/A',
  nonSystemLossAvgHoldDays: 'N/A',
  tradingTypeRatios: {},
  trendFeatureRatios: {},
  aggregateRatios: {},
  theoreticalProfitRatios: {},
};

export function useAnalysisResult(): AnalysisResult {
  const customAnalysis = useRecordsStore((s) => s.customAnalysis);
  const fieldConfig = useRecordsStore((s) => s.fieldConfig);
  const overview = useRecordsStore((s) => s.statOverview);

  return useMemo(() => {
    if (customAnalysis.useCustom) return customAnalysis.data;
    if (!overview) return EMPTY_ANALYSIS;

    // 结果表只包含出现过的键；按配置补齐缺失项，保证展示与配置一致
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
  }, [customAnalysis, fieldConfig, overview]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const customMonthly = useRecordsStore((s) => s.customMonthly);
  const statMonthly = useRecordsStore((s) => s.statMonthly);

  return useMemo(() => {
    if (customMonthly.useCustom) return customMonthly.data;
    // 与总览同理：不再用当前页记录现算，结果表为空就返回空
    return statMonthly;
  }, [customMonthly, statMonthly]);
}

/** 统计结果是否已生成（用于页面提示，避免把空表当成“没有数据”） */
export function useHasServerStats(): boolean {
  return useRecordsStore((s) => !!s.statOverview);
}

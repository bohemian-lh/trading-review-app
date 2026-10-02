import { useMemo } from 'react';
import type { AnalysisResult, MonthlyAnalysis, TradingRecord } from '@/types';
import { useRecordsStore } from '@/stores/recordsStore';
import { calculateProfitRatio, calculateAvgProfitRatio, calculateTotalProfit, computeAnalysisResult } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';

export function useAnalysisResult(): AnalysisResult {
  const records = useRecordsStore((s) => s.records);
  const customAnalysis = useRecordsStore((s) => s.customAnalysis);
  const fieldConfig = useRecordsStore((s) => s.fieldConfig);

  return useMemo(() => {
    if (customAnalysis.useCustom) return customAnalysis.data;
    return computeAnalysisResult(records, fieldConfig);
  }, [records, customAnalysis, fieldConfig]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const records = useRecordsStore((s) => s.records);
  const customMonthly = useRecordsStore((s) => s.customMonthly);

  return useMemo(() => {
    if (customMonthly.useCustom) return customMonthly.data;
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
  }, [records, customMonthly]);
}

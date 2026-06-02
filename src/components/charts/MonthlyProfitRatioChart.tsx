import React, { useMemo } from 'react';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import type { ChartDataPoint, MonthlyAnalysis } from '@/types';
import { BaseChart } from './BaseChart';

export const MonthlyProfitRatioChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();

  const chartData = useMemo<ChartDataPoint[]>(() => {
    return monthlyData.map((item: MonthlyAnalysis) => ({
      month: item.month,
      displayMonth: formatMonthDisplay(item.month),
      systemProfitRatio: item.systemProfitRatio,
      systemNoMistakeProfitRatio: item.systemNoMistakeProfitRatio,
      systemWithMistakeProfitRatio: item.systemWithMistakeProfitRatio,
      nonSystemProfitRatio: item.nonSystemProfitRatio,
      avgProfitRatio: item.avgProfitRatio,
      totalProfit: item.totalProfit,
    }));
  }, [monthlyData]);

  const lines = [
    { dataKey: 'avgProfitRatio', name: '平均盈亏比', color: '#8b5cf6' },
    { dataKey: 'systemProfitRatio', name: '符合系统', color: '#0ea5e9' },
    { dataKey: 'nonSystemProfitRatio', name: '不符合系统', color: '#ef4444' },
    { dataKey: 'totalProfit', name: '月总盈亏', color: '#10b981' },
  ];

  return (
    <BaseChart
      data={chartData}
      title="每月盈亏比趋势"
      xAxisKey="displayMonth"
      lines={lines}
      yAxisLabel="盈亏比"
      minWidth={500}
    />
  );
};

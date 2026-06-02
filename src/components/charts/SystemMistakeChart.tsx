import React, { useMemo } from 'react';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import type { MonthlyAnalysis } from '@/types';
import { BaseChart } from './BaseChart';

interface ChartData {
  month: string;
  displayMonth: string;
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
}

export const SystemMistakeChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();

  const chartData = useMemo<ChartData[]>(() => {
    return monthlyData.map((item: MonthlyAnalysis) => ({
      month: item.month,
      displayMonth: formatMonthDisplay(item.month),
      systemNoMistakeProfitRatio: item.systemNoMistakeProfitRatio,
      systemWithMistakeProfitRatio: item.systemWithMistakeProfitRatio,
    }));
  }, [monthlyData]);

  const lines = [
    { dataKey: 'systemNoMistakeProfitRatio', name: '系统无失误', color: '#10b981' },
    { dataKey: 'systemWithMistakeProfitRatio', name: '系统有失误', color: '#f59e0b' },
  ];

  return (
    <BaseChart
      data={chartData}
      title="系统盈亏比趋势（按是否失误）"
      xAxisKey="displayMonth"
      lines={lines}
      yAxisLabel="盈亏比"
      minWidth={500}
    />
  );
};

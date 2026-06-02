import React, { useMemo } from 'react';
import { useDataStore } from '@/stores';
import { GroupBarChart } from './GroupBarChart';

interface ChartDataPoint {
  period: string;
  '齐飞水底': number | null;
  '齐飞前多踩MA': number | null;
  '风险释放平台转一致': number | null;
  '双阳平台转一致': number | null;
}

export const CycleTypeChart: React.FC = () => {
  const cycleStats = useDataStore((state) => state.cycleStats);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    const type1 = cycleStats['齐飞水底'] || [];
    const type2 = cycleStats['齐飞前多踩MA'] || [];
    const type3 = cycleStats['风险释放平台转一致'] || [];
    const type4 = cycleStats['双阳平台转一致'] || [];

    const maxLength = Math.max(type1.length, type2.length, type3.length, type4.length);

    const points: ChartDataPoint[] = [];
    for (let i = 0; i < maxLength; i++) {
      points.push({
        period: `第${i + 1}周期`,
        '齐飞水底': type1[i]?.profitRatio ?? null,
        '齐飞前多踩MA': type2[i]?.profitRatio ?? null,
        '风险释放平台转一致': type3[i]?.profitRatio ?? null,
        '双阳平台转一致': type4[i]?.profitRatio ?? null,
      });
    }

    return points;
  }, [cycleStats]);

  const bars = [
    { dataKey: '齐飞水底', name: '齐飞水底', color: '#10b981' },
    { dataKey: '齐飞前多踩MA', name: '齐飞前多踩MA', color: '#0ea5e9' },
    { dataKey: '风险释放平台转一致', name: '风险释放平台转一致', color: '#8b5cf6' },
    { dataKey: '双阳平台转一致', name: '双阳平台转一致', color: '#f59e0b' },
  ];

  return (
    <GroupBarChart
      data={chartData}
      title="周期统计（按交易类型）"
      xAxisKey="period"
      bars={bars}
      yAxisLabel="盈亏比"
    />
  );
};

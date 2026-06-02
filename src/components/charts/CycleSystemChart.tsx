import React, { useMemo } from 'react';
import { useDataStore } from '@/stores';
import { BaseChart } from './BaseChart';

interface ChartDataPoint {
  period: string; // 周期序号
  systemProfitRatio: number | null;
  nonSystemProfitRatio: number | null;
}

export const CycleSystemChart: React.FC = () => {
  const cycleStats = useDataStore((state) => state.cycleStats);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    // 获取系统和非系统的周期列表
    const systemCycles = cycleStats['系统'] || [];
    const nonSystemCycles = cycleStats['非系统'] || [];

    // 找出最大周期数
    const maxLength = Math.max(systemCycles.length, nonSystemCycles.length);

    // 构建数据点
    const points: ChartDataPoint[] = [];
    for (let i = 0; i < maxLength; i++) {
      points.push({
        period: `第${i + 1}周期`,
        systemProfitRatio: systemCycles[i]?.profitRatio ?? null,
        nonSystemProfitRatio: nonSystemCycles[i]?.profitRatio ?? null,
      });
    }

    return points;
  }, [cycleStats]);

  const lines = [
    { dataKey: 'systemProfitRatio', name: '系统', color: '#0ea5e9' },
    { dataKey: 'nonSystemProfitRatio', name: '非系统', color: '#ef4444' },
  ];

  return (
    <BaseChart
      data={chartData}
      title="周期统计（系统vs非系统）"
      xAxisKey="period"
      lines={lines}
      yAxisLabel="盈亏比"
      minWidth={500}
    />
  );
};

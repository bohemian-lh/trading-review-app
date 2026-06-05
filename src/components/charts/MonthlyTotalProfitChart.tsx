import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';
import type { MonthlyAnalysis } from '@/types';

const CHART_KEY = 'monthly-total-profit';
const ALL_LINES = ['monthlyProfit', 'cumulativeProfit'];

interface LineConfig {
  key: string;
  name: string;
  color: string;
}

const lineConfigs: LineConfig[] = [
  { key: 'monthlyProfit', name: '月盈亏', color: '#10b981' },
  { key: 'cumulativeProfit', name: '总盈亏', color: '#f59e0b' },
];

export const MonthlyTotalProfitChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_LINES, ALL_LINES);

  const chartData = useMemo(() => {
    let cumulativeSum = 0;
    return monthlyData.map((item: MonthlyAnalysis) => {
      const monthlyProfit = typeof item.totalProfit === 'number' ? item.totalProfit : 0;
      cumulativeSum += monthlyProfit;
      return {
        month: item.month,
        displayMonth: formatMonthDisplay(item.month),
        monthlyProfit,
        cumulativeProfit: parseFloat(cumulativeSum.toFixed(2)),
      };
    });
  }, [monthlyData]);

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);
  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));

  // Y domain from visible lines only
  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of visibleData) {
      for (const line of visibleLines) {
        const v = item[line.key as keyof typeof item] as number;
        if (typeof v === 'number' && !isNaN(v)) values.push(Math.abs(v));
      }
    }
    if (values.length === 0) return [-10, 10];
    const maxAbs = Math.max(...values, 1);
    const margin = maxAbs * 0.12;
    return [-(maxAbs + margin), maxAbs + margin];
  }, [visibleData, visibleLines]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据可展示</p>
      </div>
    );
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={visibleData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="displayMonth" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: '盈亏率', angle: -90, position: 'insideLeft' }} />
        <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} />
        <Legend />
        {visibleLines.map(line => (
          <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 4, fill: line.color }} activeDot={{ r: 6 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">月度总盈亏</h3>
        <div className="flex items-center gap-2">
          {isZoomed && (
            <>
              <span className="text-xs text-gray-500">{Math.round(zoomRatio * 100)}%</span>
              <button onClick={resetZoom} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">重置</button>
            </>
          )}
          <span className="text-xs text-gray-400">Ctrl+滚轮缩放 · 拖拽平移</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {lineConfigs.map(l => (
          <label key={l.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(l.key)} onChange={() => setSelected(selected.includes(l.key) ? selected.filter(k => k !== l.key) : [...selected, l.key])} className="rounded" />
            <span style={{ color: l.color }}>{l.name}</span>
          </label>
        ))}
      </div>
      <div ref={containerRef} className="select-none">
        {chartContent}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">计算规则</h4>
        <p className="text-sm text-blue-800">月盈亏 = 当月所有交易记录的 profitPercent 求和，正数表示盈利，负数表示亏损</p>
        <p className="text-sm text-blue-800 mt-1">总盈亏 = 从第一个有数据的月开始，逐月累加月盈亏值</p>
      </div>
    </div>
  );
};

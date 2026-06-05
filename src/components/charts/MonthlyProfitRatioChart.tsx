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
} from 'recharts';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';
import type { MonthlyAnalysis } from '@/types';

const CHART_KEY = 'monthly-profit-ratio';

interface LineConfig {
  key: string;
  name: string;
  color: string;
}

const lineConfigs: LineConfig[] = [
  { key: 'avgProfitRatio', name: '月盈亏比', color: '#8b5cf6' },
  { key: 'systemProfitRatio', name: '系统盈亏比', color: '#0ea5e9' },
  { key: 'nonSystemProfitRatio', name: '非系统盈亏比', color: '#ef4444' },
];

const ALL_KEYS = lineConfigs.map(l => l.key);

export const MonthlyProfitRatioChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);

  const chartData = useMemo(() => {
    return monthlyData.map((item: MonthlyAnalysis) => {
      const toNum = (v: number | 'N/A') => typeof v === 'number' ? v : NaN;
      return {
        month: item.month,
        displayMonth: formatMonthDisplay(item.month),
        avgProfitRatio: toNum(item.avgProfitRatio),
        systemProfitRatio: toNum(item.systemProfitRatio),
        nonSystemProfitRatio: toNum(item.nonSystemProfitRatio),
      };
    });
  }, [monthlyData]);

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);
  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of visibleData) {
      for (const line of visibleLines) {
        const v = item[line.key as keyof typeof item] as number;
        if (typeof v === 'number' && !isNaN(v)) values.push(Math.abs(v));
      }
    }
    if (values.length === 0) return [0, 10];
    const maxAbs = Math.max(...values, 1);
    const margin = maxAbs * 0.12;
    return [-maxAbs - margin, maxAbs + margin];
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
        <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : 'N/A'} />
        <Legend />
        {visibleLines.map(line => (
          <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">每月盈亏比趋势</h3>
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
    </div>
  );
};

import React, { useMemo, useState, useRef } from 'react';
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
import type { MonthlyAnalysis } from '@/types';

const CHART_KEY = 'monthly-profit-ratio';

interface LineConfig {
  key: string;
  name: string;
  color: string;
  getValue: (item: MonthlyAnalysis) => number | 'N/A';
}

const lineConfigs: LineConfig[] = [
  { key: 'avgProfitRatio', name: '月盈亏比', color: '#8b5cf6', getValue: (d) => d.avgProfitRatio },
  { key: 'systemProfitRatio', name: '系统盈亏比', color: '#0ea5e9', getValue: (d) => d.systemProfitRatio },
  { key: 'nonSystemProfitRatio', name: '非系统盈亏比', color: '#ef4444', getValue: (d) => d.nonSystemProfitRatio },
];

const ALL_KEYS = lineConfigs.map(l => l.key);

export const MonthlyProfitRatioChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    return monthlyData.map((item: MonthlyAnalysis) => ({
      month: item.month,
      displayMonth: formatMonthDisplay(item.month),
      avgProfitRatio: item.avgProfitRatio,
      systemProfitRatio: item.systemProfitRatio,
      nonSystemProfitRatio: item.nonSystemProfitRatio,
    }));
  }, [monthlyData]);

  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据可展示</p>
      </div>
    );
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="displayMonth" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickCount={7} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} />
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
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2">
          <button onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.5))} disabled={zoom <= 0.5} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="缩小">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))} disabled={zoom >= 3} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="放大">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </button>
          <button onClick={() => setZoom(1)} className="p-2 rounded-md hover:bg-gray-100" title="重置">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {lineConfigs.map(l => (
          <label key={l.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(l.key)} onChange={() => {
              setSelected(selected.includes(l.key) ? selected.filter(k => k !== l.key) : [...selected, l.key]);
            }} className="rounded" />
            <span style={{ color: l.color }}>{l.name}</span>
          </label>
        ))}
      </div>
      <div ref={containerRef} className="overflow-x-auto touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div style={{ minWidth: 500 * zoom }}>{chartContent}</div>
      </div>
    </div>
  );
};

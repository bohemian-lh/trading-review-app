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
  ReferenceLine,
} from 'recharts';
import { useDataStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';
import type { CycleStatType } from '@/types';

const CHART_KEY = 'cycle-system';

interface LineConfig {
  key: string;
  name: string;
  color: string;
}

const lineConfigs: LineConfig[] = [
  { key: '系统', name: '系统', color: '#0ea5e9' },
  { key: '非系统', name: '非系统', color: '#ef4444' },
  { key: '系统无失误', name: '系统无失误', color: '#10b981' },
  { key: '系统有失误', name: '系统有失误', color: '#f59e0b' },
];

const ALL_KEYS = lineConfigs.map(l => l.key);
const DEFAULT_KEYS = ['系统', '非系统'];

export const CycleSystemChart: React.FC = () => {
  const cycleStats = useDataStore(state => state.cycleStats);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, DEFAULT_KEYS);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    const maxLen = Math.max(
      ...lineConfigs.map(l => {
        const stats = cycleStats[l.key as CycleStatType];
        return (stats || []).length;
      })
    );
    if (maxLen === 0) return [];

    const points: any[] = [];
    for (let i = 0; i < maxLen; i++) {
      const point: any = { period: `第${i + 1}周期` };
      for (const l of lineConfigs) {
        const stats = cycleStats[l.key as CycleStatType] || [];
        point[l.key] = stats[i]?.profitRatio ?? null;
      }
      points.push(point);
    }
    return points;
  }, [cycleStats]);

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
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickCount={7} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
        <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A'} />
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
        <h3 className="text-lg font-semibold text-gray-900">周期统计（系统 vs 非系统）</h3>
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
            <input type="checkbox" checked={selected.includes(l.key)} onChange={() => setSelected(selected.includes(l.key) ? selected.filter(k => k !== l.key) : [...selected, l.key])} className="rounded" />
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

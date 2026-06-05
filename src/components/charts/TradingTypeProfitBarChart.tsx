import React, { useMemo, useState, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAnalysisResult } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';

const CHART_KEY = 'trading-type-total-profit-ratio';

interface BarConfig {
  key: string;
  name: string;
  color: string;
}

const barConfigs: BarConfig[] = [
  { key: 'system', name: '系统', color: '#0ea5e9' },
  { key: 'qifeiShuidiZong', name: '齐飞水底总', color: '#06b6d4' },
  { key: 'zhuanYizhi', name: '转一致', color: '#ec4899' },
  { key: 'systemNoMistake', name: '系统无失误', color: '#10b981' },
  { key: 'systemWithMistake', name: '系统有失误', color: '#f59e0b' },
];

const ALL_KEYS = barConfigs.map(b => b.key);

export const TradingTypeProfitBarChart: React.FC = () => {
  const analysis = useAnalysisResult();
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    return [
      { key: 'system', name: '系统', value: analysis.systemProfitRatio === 'N/A' ? 0 : analysis.systemProfitRatio, color: '#0ea5e9' },
      { key: 'qifeiShuidiZong', name: '齐飞水底总', value: (analysis.typeQifeiShuidi + analysis.typeQifeiShuidiSandengliang + analysis.typeQifeiQianDuoCaiMA) || 0, color: '#06b6d4' },
      { key: 'zhuanYizhi', name: '转一致', value: (analysis.typeFengxianShifang + analysis.typeShuangyang) || 0, color: '#ec4899' },
      { key: 'systemNoMistake', name: '系统无失误', value: analysis.systemNoMistakeProfitRatio === 'N/A' ? 0 : analysis.systemNoMistakeProfitRatio, color: '#10b981' },
      { key: 'systemWithMistake', name: '系统有失误', value: analysis.systemWithMistakeProfitRatio === 'N/A' ? 0 : analysis.systemWithMistakeProfitRatio, color: '#f59e0b' },
    ].filter(d => selected.includes(d.key));
  }, [analysis, selected]);

  const allZero = chartData.every(d => d.value === 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无交易数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">交易类型总盈亏比</h3>
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
        {barConfigs.map(b => (
          <label key={b.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(b.key)} onChange={() => setSelected(selected.includes(b.key) ? selected.filter(k => k !== b.key) : [...selected, b.key])} className="rounded" />
            <span style={{ color: b.color }}>{b.name}</span>
          </label>
        ))}
      </div>
      <div ref={containerRef} className="overflow-x-auto touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div style={{ minWidth: 500 * zoom }}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickCount={7} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => [typeof v === 'number' ? v.toFixed(2) : v, '盈亏比']} />
              <Legend />
              <Bar dataKey="value" name="盈亏比" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

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
import { useDataStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';
import type { CycleStatType } from '@/types';

const CHART_KEY = 'cycle-trading-type';

interface LineConfig {
  key: string;
  name: string;
  color: string;
}

const lineConfigs: LineConfig[] = [
  { key: '齐飞水底', name: '齐飞水底', color: '#10b981' },
  { key: '齐飞水底三等量', name: '齐飞水底三等量', color: '#6366f1' },
  { key: '齐飞前多踩MA', name: '齐飞前多踩MA', color: '#0ea5e9' },
  { key: '风险释放平台转一致', name: '风险释放平台转一致', color: '#8b5cf6' },
  { key: '双阳平台转一致', name: '双阳平台转一致', color: '#f59e0b' },
  { key: '齐飞水底总', name: '齐飞水底总', color: '#06b6d4' },
  { key: '转一致', name: '转一致', color: '#ec4899' },
  { key: '非系统', name: '非系统', color: '#ef4444' },
];

const ALL_KEYS = lineConfigs.map(l => l.key);

export const CycleTypeChart: React.FC = () => {
  const cycleStats = useDataStore(state => state.cycleStats);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);

  const chartData = useMemo(() => {
    const maxLen = Math.max(
      ...lineConfigs.map(l => {
        const stats = cycleStats[l.key as CycleStatType];
        return (stats || []).length;
      }),
      0
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

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);
  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of visibleData) {
      for (const line of visibleLines) {
        const v = item[line.key] as number | null;
        if (typeof v === 'number' && !isNaN(v)) values.push(Math.abs(v));
      }
    }
    if (values.length === 0) return [-1, 1];
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
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
        <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A'} />
        <Legend />
        {visibleLines.map(line => (
          <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">周期盈亏比统计（按交易类型）</h3>
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

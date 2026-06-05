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

const CHART_KEY = 'cycle-profit';

interface TypeConfig {
  key: string;
  name: string;
  color: string;
}

const typeConfigs: TypeConfig[] = [
  { key: '系统', name: '系统', color: '#0ea5e9' },
  { key: '非系统', name: '非系统', color: '#ef4444' },
  { key: '齐飞水底总', name: '齐飞水底总', color: '#06b6d4' },
  { key: '转一致', name: '转一致', color: '#ec4899' },
  { key: '齐飞水底', name: '齐飞水底', color: '#10b981' },
  { key: '齐飞水底三等量', name: '齐飞水底三等量', color: '#6366f1' },
  { key: '齐飞前多踩MA', name: '齐飞前多踩MA', color: '#22d3ee' },
  { key: '风险释放平台转一致', name: '风险释放平台转一致', color: '#fb923c' },
  { key: '双阳平台转一致', name: '双阳平台转一致', color: '#f472b6' },
];

// 18 keys: {type}_profit and {type}_cumulative
const ALL_KEYS = typeConfigs.flatMap(t => [`${t.key}_profit`, `${t.key}_cumulative`]);

export const CycleProfitChart: React.FC = () => {
  const cycleStats = useDataStore(state => state.cycleStats);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);

  const chartData = useMemo(() => {
    const maxLen = Math.max(
      ...typeConfigs.map(t => {
        const stats = cycleStats[t.key as CycleStatType];
        return (stats || []).length;
      }),
      0
    );
    if (maxLen === 0) return [];

    // Build raw data: per period, per type, compute profit = profitSum - lossSum
    const raw: Record<string, any>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const point: any = { period: `第${i + 1}周期` };
      for (const t of typeConfigs) {
        const stats = cycleStats[t.key as CycleStatType] || [];
        const s = stats[i];
        if (s && s.profitSum !== undefined && s.lossSum !== undefined) {
          point[`${t.key}_profit`] = parseFloat((s.profitSum - s.lossSum).toFixed(2));
        } else {
          point[`${t.key}_profit`] = null;
        }
      }
      raw.push(point);
    }

    // Compute cumulative for each type
    const cumulatives: Record<string, number> = {};
    for (const t of typeConfigs) cumulatives[t.key] = 0;

    for (const point of raw) {
      for (const t of typeConfigs) {
        const v = point[`${t.key}_profit`];
        if (typeof v === 'number') {
          cumulatives[t.key] += v;
        }
        point[`${t.key}_cumulative`] = parseFloat(cumulatives[t.key].toFixed(2));
      }
    }

    return raw;
  }, [cycleStats]);

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);

  // Visible lines based on selected checkboxes
  const visibleLines = typeConfigs.flatMap(t => {
    const lines: { key: string; name: string; color: string; strokeDasharray?: string }[] = [];
    if (selected.includes(`${t.key}_profit`)) {
      lines.push({ key: `${t.key}_profit`, name: `${t.name}-盈亏`, color: t.color });
    }
    if (selected.includes(`${t.key}_cumulative`)) {
      lines.push({ key: `${t.key}_cumulative`, name: `${t.name}-总盈亏`, color: t.color, strokeDasharray: '5 5' });
    }
    return lines;
  });

  // Y domain from visible data
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
        <p className="text-gray-500">暂无周期数据，请先生成周期统计</p>
      </div>
    );
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={visibleData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: '盈亏', angle: -90, position: 'insideLeft' }} />
        <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
        <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A'} />
        <Legend />
        {visibleLines.map(line => (
          <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} strokeDasharray={line.strokeDasharray} dot={{ r: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">周期盈亏统计</h3>
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
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <span className="text-xs font-medium text-gray-500 w-full">总盈亏（虚线）:</span>
          {typeConfigs.map(t => (
            <label key={`cum_${t.key}`} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={selected.includes(`${t.key}_cumulative`)} onChange={() => {
                const key = `${t.key}_cumulative`;
                setSelected(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
              }} className="rounded" />
              <span style={{ color: t.color }}>{t.name}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="text-xs font-medium text-gray-500 w-full">盈亏（实线）:</span>
          {typeConfigs.map(t => (
            <label key={`profit_${t.key}`} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={selected.includes(`${t.key}_profit`)} onChange={() => {
                const key = `${t.key}_profit`;
                setSelected(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
              }} className="rounded" />
              <span style={{ color: t.color }}>{t.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="select-none">
        {chartContent}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">计算规则</h4>
        <p className="text-sm text-blue-800">盈亏 = 该周期内匹配类型的盈利总和 − 亏损绝对值总和</p>
        <p className="text-sm text-blue-800 mt-1">总盈亏 = 从第一个周期开始，逐周期累加盈亏值</p>
      </div>
    </div>
  );
};

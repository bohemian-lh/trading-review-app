import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useRecordsStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';

const CHART_KEY = 'cycle-trading-type';

const COLORS = ['#0ea5e9', '#ef4444', '#06b6d4', '#ec4899',
  '#10b981', '#6366f1', '#22d3ee', '#fb923c', '#f472b6',
  '#84cc16', '#a78bfa', '#8b5cf6', '#14b8a6', '#e11d48',
  '#d946ef', '#f97316', '#64748b', '#0891b2', '#ca8a04', '#be123c',
];

export const CycleTypeChart: React.FC = () => {
  const cycleStats = useRecordsStore(s => s.cycleStats);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  // 从 fieldConfig 动态生成 lineConfigs
  const lineConfigs = useMemo(() => {
    const configs: { key: string; name: string; color: string }[] = [];
    let ci = 0;
    // 聚合规则
    for (const rule of fieldConfig.aggregateRules) {
      configs.push({ key: rule.name, name: rule.name, color: COLORS[ci++ % COLORS.length] });
    }
    // 交易类型（排除未知）
    for (const t of fieldConfig.tradingTypes) {
      if (t === '未知') continue;
      configs.push({ key: t, name: t, color: COLORS[ci++ % COLORS.length] });
    }
    // 交易切入类型（排除未知）
    for (const e of fieldConfig.entryTypes) {
      if (e === '未知') continue;
      configs.push({ key: e, name: e, color: COLORS[ci++ % COLORS.length] });
    }
    return configs;
  }, [fieldConfig]);

  const ALL_KEYS = useMemo(() => lineConfigs.map(l => l.key), [lineConfigs]);
  const DEFAULT_KEYS = useMemo(() => lineConfigs.slice(0, Math.min(6, lineConfigs.length)).map(l => l.key), [lineConfigs]);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, DEFAULT_KEYS);

  const chartData = useMemo(() => {
    const maxLen = Math.max(...lineConfigs.map(l => (cycleStats[l.key] || []).length), 0);
    if (maxLen === 0) return [];
    const data: Record<string, any>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const point: any = { period: `第${i + 1}周期` };
      for (const l of lineConfigs) {
        const stats = cycleStats[l.key] || [];
        const s = stats[i];
        point[l.key] = s?.profitRatio !== undefined ? s.profitRatio : null;
      }
      data.push(point);
    }
    return data;
  }, [cycleStats, lineConfigs]);

  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));
  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);

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
      <div className="flex flex-wrap gap-3">
        {lineConfigs.map(l => (
          <label key={l.key} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={selected.includes(l.key)} onChange={() => setSelected(selected.includes(l.key) ? selected.filter(k => k !== l.key) : [...selected, l.key])} className="rounded" />
            <span style={{ color: l.color }}>{l.name}</span>
          </label>
        ))}
      </div>
      <div ref={containerRef} className="select-none">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={visibleData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
            <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A'} />
            <Legend />
            {visibleLines.map(l => (
              <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

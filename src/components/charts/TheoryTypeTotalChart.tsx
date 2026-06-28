import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useRecordsStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';

const CHART_KEY = 'theory-type-total-per-record';

const COLORS = [
  '#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export const TheoryTypeTotalChart: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  // 逐笔累计总盈亏（按交易类型分组）
  const lineConfigs = useMemo(() => {
    const configs: { key: string; name: string; color: string }[] = [];
    let ci = 0;
    for (const t of fieldConfig.tradingTypes) {
      if (t === '未知') continue;
      configs.push({ key: t, name: `${t}实际总盈亏`, color: COLORS[ci % COLORS.length] });
      configs.push({ key: `理论-${t}`, name: `${t}理论总盈亏`, color: COLORS[(ci + 1) % COLORS.length] });
      ci += 2;
    }
    return configs;
  }, [fieldConfig]);

  const ALL_KEYS = useMemo(() => lineConfigs.map(l => l.key), [lineConfigs]);
  const DEFAULT_KEYS = useMemo(() => lineConfigs.slice(0, Math.min(4, lineConfigs.length)).map(l => l.key), [lineConfigs]);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, DEFAULT_KEYS);

  const chartData = useMemo(() => {
    // 按 openDate 排序，逐条累计各交易类型的实际盈亏和理论盈亏
    const sorted = [...records].sort((a, b) => a.openDate.localeCompare(b.openDate));
    const accum: Record<string, number> = {};
    const accumTheo: Record<string, number> = {};
    const data: Record<string, any>[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const t = r.tradingType;
      if (t === '未知') continue;

      accum[t] = (accum[t] || 0) + r.profitPercent;
      accumTheo[t] = (accumTheo[t] || 0) + r.theoreticalProfitPercent;

      const point: any = { index: i + 1 };
      for (const l of lineConfigs) {
        if (l.key.startsWith('理论-')) {
          point[l.key] = parseFloat(accumTheo[l.key.slice(3)]?.toFixed(2) || '0');
        } else {
          point[l.key] = parseFloat(accum[l.key]?.toFixed(2) || '0');
        }
      }
      data.push(point);
    }
    return data;
  }, [records, lineConfigs]);

  const visibleLines = lineConfigs.filter(l => selected.includes(l.key));
  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of visibleData) {
      for (const line of visibleLines) {
        const v = item[line.key] as number | null;
        if (typeof v === 'number' && !isNaN(v)) values.push(v);
      }
    }
    if (values.length === 0) return [-1, 1];
    const maxAbs = Math.max(...values.map(Math.abs), 1);
    return [-maxAbs * 1.12, maxAbs * 1.12];
  }, [visibleData, visibleLines]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据可展示</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">图表4：各交易类型累计总盈亏 vs 理论总盈亏</h3>
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
            <XAxis dataKey="index" tick={{ fontSize: 12 }} label={{ value: '逐笔', position: 'insideBottom', offset: -5 }} />
            <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(0)} label={{ value: '累计盈亏', angle: -90, position: 'insideLeft' }} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
            <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A'} labelFormatter={(v: any) => `第${v}笔`} />
            <Legend />
            {visibleLines.map(l => (
              <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

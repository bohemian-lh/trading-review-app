import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useRecordsStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';

const CHART_KEY = 'cycle-profit';

const COLORS = ['#0ea5e9', '#ef4444', '#06b6d4', '#ec4899',
  '#10b981', '#6366f1', '#22d3ee', '#fb923c', '#f472b6',
  '#84cc16', '#a78bfa', '#8b5cf6', '#14b8a6', '#e11d48',
  '#d946ef', '#f97316', '#64748b', '#0891b2', '#ca8a04', '#be123c',
];

export const CycleProfitChart: React.FC = () => {
  const cycleStats = useRecordsStore(s => s.cycleStats);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  // 从 fieldConfig 动态生成 typeConfigs
  const typeConfigs = useMemo(() => {
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

  const ALL_KEYS = useMemo(() => typeConfigs.flatMap(t => [`${t.key}_profit`, `${t.key}_cumulative`]), [typeConfigs]);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, ALL_KEYS);

  const chartData = useMemo(() => {
    const maxLen = Math.max(...typeConfigs.map(t => (cycleStats[t.key] || []).length), 0);
    if (maxLen === 0) return [];

    const raw: Record<string, any>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const point: any = { period: `第${i + 1}周期` };
      for (const t of typeConfigs) {
        const stats = cycleStats[t.key] || [];
        const s = stats[i];
        if (s && s.profitSum !== undefined && s.lossSum !== undefined) {
          point[`${t.key}_profit`] = parseFloat((s.profitSum - s.lossSum).toFixed(2));
        } else {
          point[`${t.key}_profit`] = null;
        }
      }
      raw.push(point);
    }

    const cumulatives: Record<string, number> = {};
    for (const t of typeConfigs) cumulatives[t.key] = 0;
    for (const point of raw) {
      for (const t of typeConfigs) {
        const v = point[`${t.key}_profit`];
        if (typeof v === 'number') cumulatives[t.key] += v;
        point[`${t.key}_cumulative`] = parseFloat(cumulatives[t.key].toFixed(2));
      }
    }
    return raw;
  }, [cycleStats, typeConfigs]);

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);

  // 从配置构建可见线条（系统/非系统也加入，因为它们也在 cycleStats 中）
  const allTypes = useMemo(() => {
    // 合并固定类型 + 动态类型
    const types = [
      { key: '系统', name: '系统', color: '#0ea5e9' },
      { key: '非系统', name: '非系统', color: '#ef4444' },
      ...typeConfigs,
    ];
    // 去重
    return types.filter((t, i, arr) => arr.findIndex(x => x.key === t.key) === i);
  }, [typeConfigs]);

  const visibleLines = allTypes.flatMap(t => {
    const lines: { key: string; name: string; color: string; strokeDasharray?: string }[] = [];
    if (selected.includes(`${t.key}_profit`)) {
      lines.push({ key: `${t.key}_profit`, name: `${t.name}-盈亏`, color: t.color });
    }
    if (selected.includes(`${t.key}_cumulative`)) {
      lines.push({ key: `${t.key}_cumulative`, name: `${t.name}-总盈亏`, color: t.color, strokeDasharray: '5 5' });
    }
    return lines;
  });

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
          {allTypes.map(t => (
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
          {allTypes.map(t => (
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
      <div ref={containerRef} className="select-none">{chartContent}</div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">计算规则</h4>
        <p className="text-sm text-blue-800">盈亏 = 该周期内匹配类型的盈利总和 − 亏损绝对值总和</p>
        <p className="text-sm text-blue-800 mt-1">总盈亏 = 从第一个周期开始，逐周期累加盈亏值</p>
      </div>
    </div>
  );
};

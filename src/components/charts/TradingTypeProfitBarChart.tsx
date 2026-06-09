import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useAnalysisResult, useDataStore } from '@/stores';
import { useChartConfig } from '@/hooks/useChartConfig';

const CHART_KEY = 'trading-type-total-profit-ratio';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899',
  '#84cc16', '#a78bfa', '#22d3ee', '#fb923c', '#f472b6', '#8b5cf6', '#14b8a6',
  '#e11d48', '#d946ef', '#f97316', '#64748b', '#0891b2', '#ca8a04', '#be123c',
];

export const TradingTypeProfitBarChart: React.FC = () => {
  const analysis = useAnalysisResult();
  const fieldConfig = useDataStore(s => s.fieldConfig);

  // 从 fieldConfig 动态生成 barConfigs
  const barConfigs = useMemo(() => {
    const configs: { key: string; name: string; color: string }[] = [];
    let ci = 0;
    // 固定维度（系统归属）
    configs.push({ key: 'system', name: '系统', color: COLORS[ci++] });
    configs.push({ key: 'systemNoMistake', name: '系统无失误', color: COLORS[ci++] });
    configs.push({ key: 'systemWithMistake', name: '系统有失误', color: COLORS[ci++] });
    configs.push({ key: 'nonSystem', name: '非系统', color: COLORS[ci++] });
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

  const ALL_KEYS = useMemo(() => barConfigs.map(b => b.key), [barConfigs]);
  const DEFAULT_KEYS = useMemo(() => barConfigs.slice(0, 6).map(b => b.key), [barConfigs]);
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, DEFAULT_KEYS);

  const toValue = (v: number | 'N/A') => v === 'N/A' ? 0 : v;

  const chartData = useMemo(() => {
    return barConfigs.map(b => {
      let value: number;
      if (b.key === 'system') value = toValue(analysis.systemProfitRatio);
      else if (b.key === 'systemNoMistake') value = toValue(analysis.systemNoMistakeProfitRatio);
      else if (b.key === 'systemWithMistake') value = toValue(analysis.systemWithMistakeProfitRatio);
      else if (b.key === 'nonSystem') value = toValue(analysis.nonSystemProfitRatio);
      else if (analysis.aggregateRatios[b.key] !== undefined) value = analysis.aggregateRatios[b.key];
      else if (analysis.tradingTypeRatios[b.key] !== undefined) value = analysis.tradingTypeRatios[b.key];
      else if (analysis.entryTypeRatios[b.key] !== undefined) value = analysis.entryTypeRatios[b.key];
      else value = 0;
      return { key: b.key, name: b.name, value, color: b.color };
    }).filter(d => selected.includes(d.key));
  }, [analysis, selected, barConfigs]);

  const yDomain = useMemo(() => {
    const values = chartData.map(d => Math.abs(d.value)).filter(v => !isNaN(v) && v > 0);
    if (values.length === 0) return [0, 10];
    const maxVal = Math.max(...values, 1);
    const margin = maxVal * 0.12;
    return [-maxVal - margin, maxVal + margin];
  }, [chartData]);

  const allZero = chartData.every(d => d.value === 0);
  if (allZero) {
    return <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg"><p className="text-gray-500">暂无交易数据</p></div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">交易类型总盈亏比</h3>
      <div className="flex flex-wrap gap-4">
        {barConfigs.map(b => (
          <label key={b.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(b.key)} onChange={() => setSelected(selected.includes(b.key) ? selected.filter(k => k !== b.key) : [...selected, b.key])} className="rounded" />
            <span style={{ color: b.color }}>{b.name}</span>
          </label>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" />
          <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }} />
          <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
          <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => [typeof v === 'number' ? v.toFixed(2) : v, '盈亏比']} />
          <Legend />
          <Bar dataKey="value" name="盈亏比" radius={[4, 4, 0, 0]} maxBarSize={50}>
            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

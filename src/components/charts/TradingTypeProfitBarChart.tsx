import React, { useMemo } from 'react';
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
  ReferenceLine,
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
  { key: 'typeQifeiShuidi', name: '齐飞水底', color: '#84cc16' },
  { key: 'typeQifeiShuidiSandengliang', name: '齐飞水底三等量', color: '#a78bfa' },
  { key: 'typeQifeiQianDuoCaiMA', name: '齐飞前多踩MA', color: '#22d3ee' },
  { key: 'typeFengxianShifang', name: '风险释放平台转一致', color: '#fb923c' },
  { key: 'typeShuangyang', name: '双阳平台转一致', color: '#f472b6' },
];

const ALL_KEYS = barConfigs.map(b => b.key);
const DEFAULT_KEYS = barConfigs.slice(0, 5).map(b => b.key);

export const TradingTypeProfitBarChart: React.FC = () => {
  const analysis = useAnalysisResult();
  const [selected, setSelected] = useChartConfig(CHART_KEY, ALL_KEYS, DEFAULT_KEYS);

  const toValue = (v: number | 'N/A') => v === 'N/A' ? 0 : v;

  const chartData = useMemo(() => {
    return [
      { key: 'system', name: '系统', value: toValue(analysis.systemProfitRatio), color: '#0ea5e9' },
      { key: 'qifeiShuidiZong', name: '齐飞水底总', value: analysis.qifeiShuidiZong, color: '#06b6d4' },
      { key: 'zhuanYizhi', name: '转一致', value: analysis.zhuanYiZhi, color: '#ec4899' },
      { key: 'systemNoMistake', name: '系统无失误', value: toValue(analysis.systemNoMistakeProfitRatio), color: '#10b981' },
      { key: 'systemWithMistake', name: '系统有失误', value: toValue(analysis.systemWithMistakeProfitRatio), color: '#f59e0b' },
      { key: 'typeQifeiShuidi', name: '齐飞水底', value: analysis.typeQifeiShuidi, color: '#84cc16' },
      { key: 'typeQifeiShuidiSandengliang', name: '齐飞水底三等量', value: analysis.typeQifeiShuidiSandengliang, color: '#a78bfa' },
      { key: 'typeQifeiQianDuoCaiMA', name: '齐飞前多踩MA', value: analysis.typeQifeiQianDuoCaiMA, color: '#22d3ee' },
      { key: 'typeFengxianShifang', name: '风险释放平台转一致', value: analysis.typeFengxianShifang, color: '#fb923c' },
      { key: 'typeShuangyang', name: '双阳平台转一致', value: analysis.typeShuangyang, color: '#f472b6' },
    ].filter(d => selected.includes(d.key));
  }, [analysis, selected]);

  // Y domain from visible bars
  const yDomain = useMemo(() => {
    const values = chartData.map(d => Math.abs(d.value)).filter(v => !isNaN(v) && v > 0);
    if (values.length === 0) return [0, 10];
    const maxVal = Math.max(...values, 1);
    const margin = maxVal * 0.12;
    return [-maxVal - margin, maxVal + margin];
  }, [chartData]);

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
      </div>
      <div className="flex flex-wrap gap-4">
        {barConfigs.map(b => (
          <label key={b.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(b.key)} onChange={() => setSelected(selected.includes(b.key) ? selected.filter(k => k !== b.key) : [...selected, b.key])} className="rounded" />
            <span style={{ color: b.color }}>{b.name}</span>
          </label>
        ))}
      </div>
      <div>
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
    </div>
  );
};

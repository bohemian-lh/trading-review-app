import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useChartZoomPan } from '@/hooks/useChartZoomPan';

export interface SeriesData {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

interface SeriesLineChartProps {
  title: string;
  series: SeriesData[];
  xLabels: string[];
  yLabel: string;
  ruleText: React.ReactNode;
  noDataText?: string;
}

export const SeriesLineChart: React.FC<SeriesLineChartProps> = ({
  title, series, xLabels, yLabel, ruleText, noDataText,
}) => {
  const chartData = useMemo(() => {
    const maxLen = Math.max(...series.map(s => s.values.length), 0);
    if (maxLen === 0) return [];
    return Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, string | number | null> = { x: xLabels[i] ?? String(i + 1) };
      for (const s of series) {
        point[s.key] = s.values[i] ?? null;
      }
      return point;
    });
  }, [series, xLabels]);

  const { containerRef, startIdx, endIdx, zoomRatio, isZoomed, resetZoom } = useChartZoomPan(chartData.length);
  const visibleData = chartData.slice(startIdx, endIdx);

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of visibleData) {
      for (const s of series) {
        const v = item[s.key] as number | null;
        if (typeof v === 'number' && !isNaN(v)) values.push(Math.abs(v));
      }
    }
    if (values.length === 0) return [-1, 1];
    const maxAbs = Math.max(...values, 1);
    const margin = maxAbs * 0.12;
    return [-maxAbs - margin, maxAbs + margin];
  }, [visibleData, series]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">{noDataText || '暂无数据'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
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
      <div ref={containerRef} className="select-none">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={visibleData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="x" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickCount={7} domain={yDomain} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: yLabel, angle: -90, position: 'insideLeft' }} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={2} />
            <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }} formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : 'N/A')} />
            <Legend />
            {series.map(s => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">计算规则</h4>
        {ruleText}
      </div>
    </div>
  );
};

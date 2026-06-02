import React, { useState, useRef } from 'react';
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

interface LineConfig {
  dataKey: string;
  name: string;
  color: string;
  strokeWidth?: number;
}

interface BaseChartProps {
  data: any[];
  title: string;
  xAxisKey: string;
  lines: LineConfig[];
  minWidth?: number; // 最小宽度，用于水平滑动
  yAxisLabel?: string;
  showLegend?: boolean;
}

export const BaseChart: React.FC<BaseChartProps> = ({
  data,
  title,
  xAxisKey,
  lines,
  minWidth = 500,
  yAxisLabel = '数值',
  showLegend = true,
}) => {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算0轴居中的Y轴范围
  const yDomain = React.useMemo(() => {
    const values: number[] = [];
    for (const item of data) {
      for (const line of lines) {
        const value = item[line.dataKey];
        if (typeof value === 'number') {
          values.push(Math.abs(value));
        }
      }
    }

    if (values.length === 0) {
      return [-10, 10];
    }

    const maxAbs = Math.max(...values, 1);
    // 稍微加一点边距
    const margin = maxAbs * 0.1;
    const upper = maxAbs + margin;
    const lower = -upper;
    return [lower, upper];
  }, [data, lines]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据可展示</p>
      </div>
    );
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  const chartContent = (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fontSize: 12 }}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickCount={7}
          domain={yDomain}
          label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
        />
        <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            fontSize: 12,
          }}
          formatter={(value: number | 'N/A') =>
            typeof value === 'number' ? value.toFixed(1) : value
          }
        />
        {showLegend && <Legend />}
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="linear"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={line.strokeWidth || 2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="缩小"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="放大"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-md hover:bg-gray-100"
            title="重置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="overflow-x-auto touch-pan-x"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div style={{ minWidth: minWidth * zoom }}>
          {chartContent}
        </div>
      </div>
    </div>
  );
};

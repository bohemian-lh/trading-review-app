import React from 'react';
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
            type="monotone"
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
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <div
        className="overflow-x-auto"
        style={{ minWidth: minWidth > 0 ? 'auto' : undefined }}
      >
        <div style={{ minWidth }}>{chartContent}</div>
      </div>
    </div>
  );
};

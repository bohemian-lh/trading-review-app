import React, { useMemo, useState, useRef } from 'react';
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
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import type { ChartDataPoint, MonthlyAnalysis } from '@/types';

export const ProfitRatioChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    return monthlyData.map((item: MonthlyAnalysis) => ({
      month: item.month,
      displayMonth: formatMonthDisplay(item.month),
      systemProfitRatio: item.systemProfitRatio,
      systemNoMistakeProfitRatio: item.systemNoMistakeProfitRatio,
      systemWithMistakeProfitRatio: item.systemWithMistakeProfitRatio,
      nonSystemProfitRatio: item.nonSystemProfitRatio,
      avgProfitRatio: item.avgProfitRatio,
      totalProfit: item.totalProfit,
    }));
  }, [monthlyData]);

  // 计算0轴居中的Y轴范围
  const yDomain = useMemo(() => {
    const values: number[] = [];
    const keys = ['systemProfitRatio', 'systemNoMistakeProfitRatio', 'systemWithMistakeProfitRatio', 'nonSystemProfitRatio'];
    for (const item of chartData) {
      for (const key of keys) {
        const value = item[key as keyof ChartDataPoint];
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
  }, [chartData]);

  if (chartData.length === 0) {
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
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="displayMonth"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => value.split('-')[1]}
          interval={Math.floor(chartData.length / 6)}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickCount={7}
          domain={yDomain}
          label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }}
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
          labelFormatter={(label) => `${label}月`}
        />
        <Legend />
        <Line
          type="linear"
          dataKey="systemProfitRatio"
          name="符合系统"
          stroke="#0ea5e9"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
        <Line
          type="linear"
          dataKey="systemNoMistakeProfitRatio"
          name="符合系统无失误"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
        <Line
          type="linear"
          dataKey="systemWithMistakeProfitRatio"
          name="符合系统有失误"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
        <Line
          type="linear"
          dataKey="nonSystemProfitRatio"
          name="不符合系统"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">盈亏比趋势图</h3>
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
        <div style={{ minWidth: 500 * zoom }}>
          {chartContent}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">解读说明</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 正值：盈利能力强（数值越大盈利能力越强）</li>
          <li>• 负值：亏损能力强（数值越小亏损能力越强）</li>
          <li>• N/A：数据不足无法计算</li>
          <li>• 使用缩放按钮或左右滑动查看更多数据</li>
        </ul>
      </div>
    </div>
  );
};

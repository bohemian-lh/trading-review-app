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
} from 'recharts';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import type { ChartDataPoint, MonthlyAnalysis } from '@/types';

export const ProfitRatioChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();

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

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据可展示</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">盈亏比趋势图</h3>
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
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickCount={7}
            label={{ value: '盈亏比', angle: -90, position: 'insideLeft' }}
          />
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
            type="monotone"
            dataKey="systemProfitRatio"
            name="符合系统"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="systemNoMistakeProfitRatio"
            name="符合系统无失误"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="systemWithMistakeProfitRatio"
            name="符合系统有失误"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">解读说明</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 正值：盈利能力强（数值越大盈利能力越强）</li>
          <li>• 负值：亏损能力强（数值越小亏损能力越强）</li>
          <li>• N/A：数据不足无法计算</li>
        </ul>
      </div>
    </div>
  );
};

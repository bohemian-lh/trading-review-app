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
  BarChart,
  Bar
} from 'recharts';
import { useMonthlyAnalysis } from '@/stores';
import { formatMonthDisplay } from '@/utils/dateUtils';
import type { MonthlyAnalysis } from '@/types';

export const MonthlyTotalProfitChart: React.FC = () => {
  const monthlyData = useMonthlyAnalysis();

  const chartData = useMemo(() => {
    return monthlyData.map((item: MonthlyAnalysis) => ({
      month: item.month,
      displayMonth: formatMonthDisplay(item.month),
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value === 'N/A' ? 'N/A' : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">月度总盈亏</h3>
      
      {/* 折线图 */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 mb-3">盈亏趋势</h4>
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
              label={{ value: '盈亏金额', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="totalProfit"
              name="总盈亏"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4, fill: '#10b981' }}
              activeDot={{ r: 6, fill: '#059669' }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 柱状图 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">盈亏对比</h4>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
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
              label={{ value: '盈亏金额', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              dataKey="totalProfit"
              name="总盈亏"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">解读说明</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 展示每个月的总盈亏金额</li>
          <li>• 正数表示盈利，负数表示亏损</li>
          <li>• 折线图展示趋势变化，柱状图展示各月对比</li>
        </ul>
      </div>
    </div>
  );
};

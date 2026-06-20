import React from 'react';
import {
  MonthlyProfitRatioChart,
  CycleSystemChart,
  CycleTypeChart,
  MonthlyTotalProfitChart,
  TradingTypeProfitBarChart,
  CycleProfitChart
} from '@/components/charts';
import { useRecordsStore, useAnalysisResult } from '@/stores';

export const Dashboard: React.FC = () => {
  const records = useRecordsStore((state) => state.records);
  const analysis = useAnalysisResult();

  const analysisItems = [
    { label: '符合系统盈亏比', value: analysis.systemProfitRatio, color: 'text-blue-600' },
    { label: '符合系统无失误盈亏比', value: analysis.systemNoMistakeProfitRatio, color: 'text-green-600' },
    { label: '符合系统有失误盈亏比', value: analysis.systemWithMistakeProfitRatio, color: 'text-yellow-600' },
    { label: '不符合系统盈亏比', value: analysis.nonSystemProfitRatio, color: 'text-red-600' },
    { label: '符合系统盈利平均持仓', value: analysis.systemProfitAvgHoldDays, color: 'text-gray-600' },
    { label: '符合系统亏损平均持仓', value: analysis.systemLossAvgHoldDays, color: 'text-gray-600' },
    { label: '不符合系统盈利平均持仓', value: analysis.nonSystemProfitAvgHoldDays, color: 'text-gray-600' },
    { label: '不符合系统亏损平均持仓', value: analysis.nonSystemLossAvgHoldDays, color: 'text-gray-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">数据分析概览</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">总交易记录</p>
            <p className="text-2xl font-bold text-blue-900">{records.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">盈利交易</p>
            <p className="text-2xl font-bold text-green-900">
              {records.filter(r => r.profitPercent > 0).length}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">亏损交易</p>
            <p className="text-2xl font-bold text-red-900">
              {records.filter(r => r.profitPercent < 0).length}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 font-medium">持平交易</p>
            <p className="text-2xl font-bold text-gray-900">
              {records.filter(r => r.profitPercent === 0).length}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">总数据统计</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {analysisItems.map((item, index) => (
            <div key={index} className="border rounded-lg p-4">
              <p className="text-sm text-gray-500 font-medium">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>
                {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <MonthlyTotalProfitChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <MonthlyProfitRatioChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleProfitChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleSystemChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <TradingTypeProfitBarChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleTypeChart />
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { TheorySystemRatioChart } from '@/components/charts/TheorySystemRatioChart';
import { TheorySystemTotalChart } from '@/components/charts/TheorySystemTotalChart';
import { TheoryTypeRatioChart } from '@/components/charts/TheoryTypeRatioChart';
import { TheoryTypeTotalChart } from '@/components/charts/TheoryTypeTotalChart';

const TheoryVsActualPage: React.FC = () => {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">理论 vs 实际盈亏对比</h1>
        <p className="text-sm text-gray-500 mt-1">
          对比系统实际盈亏与理论盈亏（理论盈亏比 = 盈亏% + 后续盈亏空间%）
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <TheorySystemRatioChart />
        <TheorySystemTotalChart />
        <TheoryTypeRatioChart />
        <TheoryTypeTotalChart />
      </div>
    </div>
  );
};

export default TheoryVsActualPage;

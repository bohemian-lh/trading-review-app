import React from 'react';
import { ZoomControls } from '@/components/common';
import { useTableZoom } from '@/hooks/useTableZoom';

interface CycleStatsPanelProps {
  cycleStats: Record<string, Array<{
    startDate: string;
    endDate: string;
    recordCount: number;
    isComplete: boolean;
    profitSum: number;
    lossSum: number;
    profitRatio: number | null;
  }>>;
}

export const CycleStatsPanel: React.FC<CycleStatsPanelProps> = ({ cycleStats }) => {
  const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();

  const allStats: any[] = [];
  for (const [statType, cycles] of Object.entries(cycleStats)) {
    for (const cycle of cycles || []) {
      allStats.push({ ...cycle, statType });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">周期盈亏比统计</h2>
        <div className="flex items-center gap-3">
          <ZoomControls
            zoom={zoom}
            onZoomIn={increaseZoom}
            onZoomOut={decreaseZoom}
            onReset={resetZoom}
            isAtMin={isAtMin}
            isAtMax={isAtMax}
            hint={zoomHint}
            showHint={showZoomHint}
          />
          <div className="text-sm text-gray-600">
            共 {allStats.length} 个周期
          </div>
        </div>
      </div>

      {allStats.length === 0 ? (
        <div className="bg-gray-50 p-8 text-center rounded-lg border border-gray-200">
          <p className="text-gray-500">暂无周期统计数据</p>
          <p className="text-sm text-gray-400 mt-2">点击「手动更新统计数据」按钮生成周期盈亏比统计</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div ref={containerRef} className="overflow-auto">
            <div style={zoomStyle}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">统计类型</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">开始日期</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">结束日期</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">记录数</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">完整周期</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈利总和</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">亏损绝对值总和</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏比</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allStats.map((stat, index) => (
                    <tr key={`${stat.statType}-${index}`} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{stat.statType}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{stat.startDate}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{stat.endDate}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{stat.recordCount}</td>
                      <td className="px-3 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs rounded ${
                          stat.isComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {stat.isComplete ? '是' : '否'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{stat.profitSum}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{stat.lossSum}</td>
                      <td className={`px-3 py-3 text-sm font-medium ${
                        (stat.profitRatio ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stat.profitRatio ?? 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

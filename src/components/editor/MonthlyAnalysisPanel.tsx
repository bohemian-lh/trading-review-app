import React from 'react';
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { Button, Toggle, ZoomControls } from '@/components/common';
import { useTableZoom } from '@/hooks/useTableZoom';
import type { MonthlyAnalysis } from '@/types';

const MONTHLY_FIELDS: Array<{ key: keyof Omit<MonthlyAnalysis, 'month'>; label: string }> = [
  { key: 'systemProfitRatio', label: '系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '非系统盈亏比' },
  { key: 'avgProfitRatio', label: '平均盈亏比' },
  { key: 'totalProfit', label: '总盈亏' },
];

interface MonthlyAnalysisPanelProps {
  useCustom: boolean;
  customData: MonthlyAnalysis[];
  computedData: MonthlyAnalysis[];
  onToggleUseCustom: () => void;
  onSyncFromComputed: () => void;
  onAddMonthly: () => void;
  onEditMonthly: (item: MonthlyAnalysis) => void;
  onDeleteMonthly: (month: string) => void;
}

export const MonthlyAnalysisPanel: React.FC<MonthlyAnalysisPanelProps> = ({
  useCustom,
  customData,
  computedData,
  onToggleUseCustom,
  onSyncFromComputed,
  onAddMonthly,
  onEditMonthly,
  onDeleteMonthly,
}) => {
  const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();

  const displayed = useCustom ? customData : computedData;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">月度盈亏比统计</h2>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">使用自定义数据</span>
            <Toggle checked={useCustom} onChange={onToggleUseCustom} />
          </div>
          <Button variant="secondary" onClick={onSyncFromComputed}>
            从计算同步
          </Button>
          {useCustom && (
            <Button onClick={onAddMonthly}>
              <Plus className="mr-2 h-4 w-4" />
              添加月份
            </Button>
          )}
        </div>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {useCustom ? '当前使用自定义数据' : '当前使用自动计算数据'}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {useCustom
                ? '你可以在下方添加、编辑月份数据，这些数据会被保存和导出'
                : '数据会根据表1自动计算，切换到自定义模式后可以编辑'}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div ref={containerRef} className="overflow-auto">
          <div style={zoomStyle}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">月份</th>
                  {MONTHLY_FIELDS.map(({ label }) => (
                    <th key={label} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {label}
                    </th>
                  ))}
                  {useCustom && (
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={MONTHLY_FIELDS.length + 2} className="px-4 py-8 text-center text-gray-500">
                      暂无月度数据
                    </td>
                  </tr>
                ) : (
                  displayed.map((item) => (
                    <tr key={item.month} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.month}</td>
                      {MONTHLY_FIELDS.map(({ key }) => (
                        <td key={key} className="px-3 py-3 text-sm text-gray-700">
                          {item[key] === 'N/A' ? 'N/A' : String(item[key])}
                        </td>
                      ))}
                      {useCustom && (
                        <td className="px-3 py-3 text-sm space-x-2">
                          <button
                            onClick={() => onEditMonthly(item)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDeleteMonthly(item.month)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

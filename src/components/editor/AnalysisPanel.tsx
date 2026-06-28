import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Toggle, ZoomControls } from '@/components/common';
import { useTableZoom } from '@/hooks/useTableZoom';
import type { AnalysisResult } from '@/types';

const ANALYSIS_FIELDS: Array<{ key: keyof AnalysisResult; label: string }> = [
  { key: 'systemProfitRatio', label: '符合系统盈亏比' },
  { key: 'systemTheoreticalProfitRatio', label: '系统理论盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '符合系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '符合系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '不符合系统盈亏比' },
  { key: 'systemProfitAvgHoldDays', label: '符合系统盈利平均持仓' },
  { key: 'systemLossAvgHoldDays', label: '符合系统亏损平均持仓' },
  { key: 'nonSystemProfitAvgHoldDays', label: '不符合系统盈利平均持仓' },
  { key: 'nonSystemLossAvgHoldDays', label: '不符合系统亏损平均持仓' },
];

interface AnalysisPanelProps {
  useCustom: boolean;
  customData: AnalysisResult;
  computedData: AnalysisResult;
  onToggleUseCustom: () => void;
  onFieldChange: (field: keyof AnalysisResult, value: string) => void;
  onSyncFromComputed: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  useCustom,
  customData,
  computedData,
  onToggleUseCustom,
  onFieldChange,
  onSyncFromComputed,
}) => {
  const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">总数据统计</h2>
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
                ? '你可以在下方编辑自定义数据，这些数据会被保存和导出'
                : '数据会根据表1自动计算，切换到自定义模式后可以编辑'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div ref={containerRef}>
          <div style={zoomStyle} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
            {ANALYSIS_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                {useCustom ? (
                  <Input
                    type="text"
                    value={customData[key] === 'N/A' ? 'N/A' : String(customData[key])}
                    onChange={(e) => onFieldChange(key, e.target.value)}
                    placeholder="输入数值或 N/A"
                  />
                ) : (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                    {computedData[key] === 'N/A' ? 'N/A' : String(computedData[key])}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import type { AnalysisTab, AnalysisTabFilter, ProfitSource, MistakeStatus } from '@/types';
import { useRecordsStore } from '@/stores';
import { generateId } from '@/utils';

interface CreateAnalysisTabModalProps {
  onClose: () => void;
  onSave: (tab: AnalysisTab) => void;
}

const MISTAKE_OPTIONS: MistakeStatus[] = ['是', '否', '其他'];

function fromMonthInput(v: string): string | undefined {
  if (!v) return undefined;
  return v.replace('-', '');
}

export const CreateAnalysisTabModal: React.FC<CreateAnalysisTabModalProps> = ({ onClose, onSave }) => {
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  const sourceOptions = useMemo<Array<{ value: ProfitSource; label: string }>>(() => [
    { value: 'profitPercent', label: '盈亏情况' },
    ...fieldConfig.theoreticalDimensions.map(d => ({ value: `dim:${d.id}` as ProfitSource, label: d.name || '未命名维度' })),
  ], [fieldConfig.theoreticalDimensions]);

  const [name, setName] = useState('');
  const [source, setSource] = useState<ProfitSource>('profitPercent');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tradingTypes, setTradingTypes] = useState<string[]>([]);
  const [trendFeatures, setTrendFeatures] = useState<string[]>([]);
  const [patternFeatures, setPatternFeatures] = useState<string[]>([]);
  const [hasMistake, setHasMistake] = useState<MistakeStatus[]>([]);

  const toggle = <T,>(list: T[], value: T, setter: (v: T[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const handleSave = () => {
    const filter: AnalysisTabFilter = {
      startDate: fromMonthInput(startDate),
      endDate: fromMonthInput(endDate),
      tradingTypes,
      trendFeatures,
      patternFeatures,
      hasMistake,
    };
    const tab: AnalysisTab = {
      id: generateId(),
      name: name.trim() || '未命名页签',
      filter,
      source,
      createdAt: Date.now(),
    };
    onSave(tab);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">新增分析页签</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">页签名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：齐飞水底-系统"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 盈亏比信源 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">盈亏比信源</label>
            <div className="flex flex-wrap gap-3">
              {sourceOptions.map(s => (
                <label key={s.value} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="source" checked={source === s.value} onChange={() => setSource(s.value)} className="rounded" />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 数据范围：开单时间 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">开单时间（年份月份，起止）</label>
            <div className="flex items-center gap-3">
              <input type="month" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <span className="text-gray-400">至</span>
              <input type="month" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          {/* 交易类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">交易类型（留空=不限）</label>
            <div className="flex flex-wrap gap-3">
              {fieldConfig.tradingTypes.map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={tradingTypes.includes(t)} onChange={() => toggle(tradingTypes, t, setTradingTypes)} className="rounded" />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 趋势特征 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">趋势特征（留空=不限）</label>
            <div className="flex flex-wrap gap-3">
              {fieldConfig.trendFeatures.map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={trendFeatures.includes(t)} onChange={() => toggle(trendFeatures, t, setTrendFeatures)} className="rounded" />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 模式特征 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模式特征（留空=不限）</label>
            <div className="flex flex-wrap gap-3">
              {fieldConfig.patternFeatures.map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={patternFeatures.includes(t)} onChange={() => toggle(patternFeatures, t, setPatternFeatures)} className="rounded" />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 有无大的失误 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">有无大的失误（留空=不限）</label>
            <div className="flex flex-wrap gap-3">
              {MISTAKE_OPTIONS.map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={hasMistake.includes(m)} onChange={() => toggle(hasMistake, m, setHasMistake)} className="rounded" />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded">保存</button>
        </div>
      </div>
    </div>
  );
};

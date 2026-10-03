import React, { useState, useMemo } from 'react';
import type { AnalysisTabGroup, AnalysisTabFilter, ProfitSource, MistakeStatus, SeriesGroupMode } from '@/types';
import { useRecordsStore } from '@/stores';

interface SeriesFormModalProps {
  title: string;
  initialGroups?: AnalysisTabGroup[];
  name?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  onNameChange?: (v: string) => void;
  onClose: () => void;
  onSave: (groups: AnalysisTabGroup[]) => void;
}

const MISTAKE_OPTIONS: MistakeStatus[] = ['是', '否', '其他'];

function fromMonthInput(v: string): string | undefined {
  if (!v) return undefined;
  return v.replace('-', '');
}

function toMonthInput(v?: string): string {
  if (!v) return '';
  const m = v.replace('-', '');
  if (m.length !== 6) return '';
  return `${m.slice(0, 4)}-${m.slice(4, 6)}`;
}

interface GroupDraft {
  mode: SeriesGroupMode;
  source: ProfitSource;
  startDate: string;
  endDate: string;
  tradingTypes: string[];
  trendFeatures: string[];
  patternFeatures: string[];
  hasMistake: MistakeStatus[];
}

const emptyGroup = (mode: SeriesGroupMode): GroupDraft => ({
  mode,
  source: 'profitPercent',
  startDate: '',
  endDate: '',
  tradingTypes: [],
  trendFeatures: [],
  patternFeatures: [],
  hasMistake: [],
});

function toDraft(g: AnalysisTabGroup): GroupDraft {
  return {
    mode: g.mode,
    source: g.source,
    startDate: toMonthInput(g.filter.startDate),
    endDate: toMonthInput(g.filter.endDate),
    tradingTypes: g.filter.tradingTypes ?? [],
    trendFeatures: g.filter.trendFeatures ?? [],
    patternFeatures: g.filter.patternFeatures ?? [],
    hasMistake: g.filter.hasMistake ?? [],
  };
}

const GroupEditor: React.FC<{
  draft: GroupDraft;
  index: number;
  total: number;
  sourceOptions: Array<{ value: ProfitSource; label: string }>;
  fieldConfig: { tradingTypes: string[]; trendFeatures: string[]; patternFeatures: string[] };
  onChange: (patch: Partial<GroupDraft>) => void;
  onRemove: () => void;
}> = ({ draft, index, total, sourceOptions, fieldConfig, onChange, onRemove }) => {
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">序列 {index + 1}</span>
          <button
            onClick={() => onChange({ mode: draft.mode === 'exclude' ? 'merge' : 'exclude' })}
            title="点击切换：合并 / 排除"
            className={`px-2 py-0.5 rounded text-xs border ${
              draft.mode === 'exclude'
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}
          >
            {draft.mode === 'exclude' ? '排除' : '合并'}
          </button>
        </div>
        {total > 1 && (
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">删除本序列</button>
        )}
      </div>

      {/* 盈亏比信源 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">盈亏比信源</label>
        <div className="flex flex-wrap gap-3">
          {sourceOptions.map(s => (
            <label key={s.value} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name={`source-${index}`} checked={draft.source === s.value} onChange={() => onChange({ source: s.value })} className="rounded" />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 数据范围：开单时间 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">开单时间（年份月份，起止，留空=不限）</label>
        <div className="flex items-center gap-3">
          <input type="month" value={draft.startDate} onChange={e => onChange({ startDate: e.target.value })} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <span className="text-gray-400">至</span>
          <input type="month" value={draft.endDate} onChange={e => onChange({ endDate: e.target.value })} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {/* 交易类型 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">交易类型（留空=不限）</label>
        <div className="flex flex-wrap gap-3">
          {fieldConfig.tradingTypes.map(t => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={draft.tradingTypes.includes(t)} onChange={() => onChange({ tradingTypes: toggle(draft.tradingTypes, t) })} className="rounded" />
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
              <input type="checkbox" checked={draft.trendFeatures.includes(t)} onChange={() => onChange({ trendFeatures: toggle(draft.trendFeatures, t) })} className="rounded" />
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
              <input type="checkbox" checked={draft.patternFeatures.includes(t)} onChange={() => onChange({ patternFeatures: toggle(draft.patternFeatures, t) })} className="rounded" />
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
              <input type="checkbox" checked={draft.hasMistake.includes(m)} onChange={() => onChange({ hasMistake: toggle(draft.hasMistake, m) })} className="rounded" />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export const SeriesFormModal: React.FC<SeriesFormModalProps> = ({
  title,
  initialGroups,
  name,
  nameLabel,
  namePlaceholder,
  onNameChange,
  onClose,
  onSave,
}) => {
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  const sourceOptions = useMemo<Array<{ value: ProfitSource; label: string }>>(() => [
    { value: 'profitPercent', label: '盈亏情况' },
    ...fieldConfig.theoreticalDimensions.map(d => ({ value: `dim:${d.id}` as ProfitSource, label: d.name || '未命名维度' })),
  ], [fieldConfig.theoreticalDimensions]);

  const [groups, setGroups] = useState<GroupDraft[]>(() => {
    const fallback: AnalysisTabGroup[] = [{ mode: 'merge', source: 'profitPercent', filter: {} as AnalysisTabFilter }];
    const init = initialGroups && initialGroups.length > 0 ? initialGroups : fallback;
    return init.map(g => toDraft(g));
  });

  const updateGroup = (i: number, patch: Partial<GroupDraft>) => {
    setGroups(prev => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  };

  const addGroup = (mode: SeriesGroupMode) => setGroups(prev => [...prev, emptyGroup(mode)]);
  const removeGroup = (i: number) => setGroups(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const handleSave = () => {
    const result: AnalysisTabGroup[] = groups.map(g => ({
      mode: g.mode,
      source: g.source,
      filter: {
        startDate: fromMonthInput(g.startDate),
        endDate: fromMonthInput(g.endDate),
        tradingTypes: g.tradingTypes,
        trendFeatures: g.trendFeatures,
        patternFeatures: g.patternFeatures,
        hasMistake: g.hasMistake,
      },
    }));
    onSave(result);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* 名称 */}
          {nameLabel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{nameLabel}</label>
              <input
                type="text"
                value={name}
                onChange={e => onNameChange?.(e.target.value)}
                placeholder={namePlaceholder}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {groups.map((g, i) => (
            <GroupEditor
              key={i}
              draft={g}
              index={i}
              total={groups.length}
              sourceOptions={sourceOptions}
              fieldConfig={fieldConfig}
              onChange={patch => updateGroup(i, patch)}
              onRemove={() => removeGroup(i)}
            />
          ))}

          <div className="flex gap-3">
            <button
              onClick={() => addGroup('merge')}
              className="flex-1 py-2 text-sm text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50"
            >
              + 合并其他序列
            </button>
            <button
              onClick={() => addGroup('exclude')}
              className="flex-1 py-2 text-sm text-red-600 border border-dashed border-red-300 rounded hover:bg-red-50"
            >
              + 排除其他序列
            </button>
          </div>
          <p className="text-xs text-gray-400">
            合并 = 各序列筛选结果取并集；排除 = 从并集结果中剔除该序列命中的记录。点击序列旁的标签可随时切换。
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded">保存</button>
        </div>
      </div>
    </div>
  );
};

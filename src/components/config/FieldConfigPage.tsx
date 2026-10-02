import React, { useState, useCallback } from 'react';
import { Settings, Plus, Trash2, Save, X } from 'lucide-react';
import { useRecordsStore, useAnalysisTabStore } from '@/stores';
import { saveFieldConfigToR2, saveTabsToR2 } from '@/hooks/useStoreSync';
import { generateId } from '@/utils';
import type { FieldConfig, AggregateRule, TheoreticalDimension, JournalStageConfig, JournalStrategyGroup, MindsetRow, DecisionCheckItem } from '@/types';
import { DEFAULT_JOURNAL_STAGES, DEFAULT_SHARED_STRATEGY_GROUPS, DEFAULT_MINDSET_ROWS, DEFAULT_FIELD_CONFIG } from '@/types';

// 7 个价位的语义标签（用于字段配置中编辑代码）
const PRICE_LEVEL_LABELS = ['建仓价', '第一硬止损位', '目标位', '固定目标位', '压力1', '压力2', '趋势最低点'];

type PendingConfig = {
  tradingTypes: string[];
  trendFeatures: string[];
  patternFeatures: string[];
  aggregateRules: AggregateRule[];
  theoreticalDimensions: TheoreticalDimension[];
  journalStrategyConfig: JournalStageConfig[];
  sharedStrategyGroups: JournalStrategyGroup[];
  mindsetTable: MindsetRow[];
  decisionChecklist: DecisionCheckItem[];
  priceLevelCodes: Record<number, string>;
};

export const FieldConfigPage: React.FC = () => {
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const records = useRecordsStore(s => s.records);
  const setFieldConfig = useRecordsStore(s => s.setFieldConfig);

  const [pending, setPending] = useState<PendingConfig>({
    tradingTypes: [...fieldConfig.tradingTypes],
    trendFeatures: [...fieldConfig.trendFeatures],
    patternFeatures: [...fieldConfig.patternFeatures],
    aggregateRules: fieldConfig.aggregateRules.map(r => ({ ...r, includedTypes: [...r.includedTypes] })),
    theoreticalDimensions: fieldConfig.theoreticalDimensions.map(d => ({ ...d })),
    journalStrategyConfig: fieldConfig.journalStrategyConfig
      ? fieldConfig.journalStrategyConfig.map(s => ({ ...s, strategyGroups: [] }))
      : DEFAULT_JOURNAL_STAGES.map(s => ({ ...s, strategyGroups: [] })),
    sharedStrategyGroups: fieldConfig.sharedJournalStrategyGroups
      ? fieldConfig.sharedJournalStrategyGroups.map(g => ({ ...g, strategies: [...g.strategies] }))
      : DEFAULT_SHARED_STRATEGY_GROUPS.map(g => ({ ...g, strategies: [...g.strategies] })),
    mindsetTable: fieldConfig.mindsetTable
      ? fieldConfig.mindsetTable.map(r => ({ ...r }))
      : DEFAULT_MINDSET_ROWS.map(r => ({ ...r })),
    decisionChecklist: fieldConfig.decisionChecklist
      ? fieldConfig.decisionChecklist.map(i => ({ ...i }))
      : [],
    priceLevelCodes: { ...(fieldConfig.priceLevelCodes || DEFAULT_FIELD_CONFIG.priceLevelCodes || {}) },
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragType, setDragType] = useState<'trading' | 'trend' | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);

  // 重置为 store 中的当前值
  const resetFromStore = useCallback(() => {
    setPending({
      tradingTypes: [...fieldConfig.tradingTypes],
      trendFeatures: [...fieldConfig.trendFeatures],
      patternFeatures: [...fieldConfig.patternFeatures],
      aggregateRules: fieldConfig.aggregateRules.map(r => ({ ...r, includedTypes: [...r.includedTypes] })),
      theoreticalDimensions: fieldConfig.theoreticalDimensions.map(d => ({ ...d })),
      journalStrategyConfig: fieldConfig.journalStrategyConfig
        ? fieldConfig.journalStrategyConfig.map(s => ({ ...s, strategyGroups: [] }))
        : DEFAULT_JOURNAL_STAGES.map(s => ({ ...s, strategyGroups: [] })),
      sharedStrategyGroups: fieldConfig.sharedJournalStrategyGroups
        ? fieldConfig.sharedJournalStrategyGroups.map(g => ({ ...g, strategies: [...g.strategies] }))
        : DEFAULT_SHARED_STRATEGY_GROUPS.map(g => ({ ...g, strategies: [...g.strategies] })),
      mindsetTable: fieldConfig.mindsetTable
        ? fieldConfig.mindsetTable.map(r => ({ ...r }))
        : DEFAULT_MINDSET_ROWS.map(r => ({ ...r })),
      decisionChecklist: fieldConfig.decisionChecklist
        ? fieldConfig.decisionChecklist.map(i => ({ ...i }))
        : [],
      priceLevelCodes: { ...(fieldConfig.priceLevelCodes || DEFAULT_FIELD_CONFIG.priceLevelCodes || {}) },
    });
    setMessage(null);
  }, [fieldConfig]);

  const hasChanges = JSON.stringify(pending) !== JSON.stringify({
    tradingTypes: fieldConfig.tradingTypes,
    trendFeatures: fieldConfig.trendFeatures,
    patternFeatures: fieldConfig.patternFeatures,
    aggregateRules: fieldConfig.aggregateRules,
    theoreticalDimensions: fieldConfig.theoreticalDimensions,
    journalStrategyConfig: fieldConfig.journalStrategyConfig || DEFAULT_JOURNAL_STAGES,
    sharedStrategyGroups: fieldConfig.sharedJournalStrategyGroups || DEFAULT_SHARED_STRATEGY_GROUPS,
    mindsetTable: fieldConfig.mindsetTable || DEFAULT_MINDSET_ROWS,
    decisionChecklist: fieldConfig.decisionChecklist || [],
    priceLevelCodes: fieldConfig.priceLevelCodes || DEFAULT_FIELD_CONFIG.priceLevelCodes || {},
  });

  // ---------- tradingType ----------
  const addTradingType = () => {
    const name = prompt('请输入新的交易类型名称：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (pending.tradingTypes.includes(trimmed)) {
      setMessage({ type: 'error', text: `交易类型「${trimmed}」已存在` });
      return;
    }
    setPending(p => ({ ...p, tradingTypes: [...p.tradingTypes, trimmed] }));
    setMessage(null);
  };

  // ---------- 拖动排序 ----------
  const handleDragStart = (type: 'trading' | 'trend', index: number) => {
    setDragType(type);
    setDragFromIndex(index);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (type: 'trading' | 'trend', toIndex: number) => {
    if (dragType !== type || dragFromIndex === null || dragFromIndex === toIndex) {
      setDragType(null); setDragFromIndex(null); return;
    }
    setPending(p => {
      const list = type === 'trading' ? [...p.tradingTypes] : [...p.trendFeatures];
      const [moved] = list.splice(dragFromIndex, 1);
      list.splice(toIndex, 0, moved);
      return type === 'trading' ? { ...p, tradingTypes: list } : { ...p, trendFeatures: list };
    });
    setDragType(null); setDragFromIndex(null);
  };

  const deleteTradingType = (type: string) => {
    if (type === '未知') {
      setMessage({ type: 'error', text: '「未知」类型不可删除' });
      return;
    }
    const count = records.filter(r => r.tradingType === type).length;
    const usedInRules = pending.aggregateRules.filter(r => r.includedTypes.includes(type));
    const confirmMsg = [
      `确定删除交易类型「${type}」？`,
      count > 0 ? `\n${count} 条记录将被标记为「未知」` : '',
      usedInRules.length > 0 ? `\n将从聚合规则「${usedInRules.map(r => r.name).join('、')}」中移除` : '',
    ].filter(Boolean).join('');
    
    if (!confirm(confirmMsg)) return;
    
    setPending(p => ({
      ...p,
      tradingTypes: p.tradingTypes.filter(t => t !== type),
      aggregateRules: p.aggregateRules.map(r => ({
        ...r,
        includedTypes: r.includedTypes.filter(t => t !== type),
      })),
    }));
    setMessage(null);
  };

  // ---------- trendFeature ----------
  const addTrendFeature = () => {
    const name = prompt('请输入新的趋势特征名称：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (pending.trendFeatures.includes(trimmed)) {
      setMessage({ type: 'error', text: `趋势特征「${trimmed}」已存在` });
      return;
    }
    setPending(p => ({ ...p, trendFeatures: [...p.trendFeatures, trimmed] }));
    setMessage(null);
  };

  const deleteTrendFeature = (type: string) => {
    if (type === '未知') {
      setMessage({ type: 'error', text: '「未知」类型不可删除' });
      return;
    }
    const count = records.filter(r => r.trendFeatures.includes(type)).length;
    if (!confirm(`确定删除趋势特征「${type}」？\n${count} 条记录将被标记为「未知」`)) return;
    setPending(p => ({ ...p, trendFeatures: p.trendFeatures.filter(e => e !== type) }));
    setMessage(null);
  };

  // ---------- patternFeature ----------
  const addPatternFeature = () => {
    const name = prompt('请输入新的模式特征名称：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (pending.patternFeatures.includes(trimmed)) {
      setMessage({ type: 'error', text: `模式特征「${trimmed}」已存在` });
      return;
    }
    setPending(p => ({ ...p, patternFeatures: [...p.patternFeatures, trimmed] }));
    setMessage(null);
  };

  const deletePatternFeature = (type: string) => {
    if (type === '系统' || type === '非系统') {
      setMessage({ type: 'error', text: `「${type}」为固定标记，不可删除` });
      return;
    }
    const count = records.filter(r => r.patternFeatures.includes(type)).length;
    if (!confirm(`确定删除模式特征「${type}」？\n${count} 条记录将移除该标记`)) return;
    setPending(p => ({ ...p, patternFeatures: p.patternFeatures.filter(e => e !== type) }));
    setMessage(null);
  };

  // ---------- aggregateRule ----------
  const addAggregateRule = () => {
    const name = prompt('请输入聚合规则名称：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (pending.aggregateRules.some(r => r.name === trimmed)) {
      setMessage({ type: 'error', text: `聚合规则「${trimmed}」已存在` });
      return;
    }
    setPending(p => ({
      ...p,
      aggregateRules: [...p.aggregateRules, { name: trimmed, includedTypes: [] }],
    }));
    setMessage(null);
  };

  const deleteAggregateRule = (name: string) => {
    if (!confirm(`确定删除聚合规则「${name}」？`)) return;
    setPending(p => ({
      ...p,
      aggregateRules: p.aggregateRules.filter(r => r.name !== name),
    }));
    setMessage(null);
  };

  const toggleAggregateMember = (ruleName: string, type: string) => {
    setPending(p => ({
      ...p,
      aggregateRules: p.aggregateRules.map(r => {
        if (r.name !== ruleName) return r;
        return {
          ...r,
          includedTypes: r.includedTypes.includes(type)
            ? r.includedTypes.filter(t => t !== type)
            : [...r.includedTypes, type],
        };
      }),
    }));
    setMessage(null);
  };

  // ---------- 理论盈亏比维度 ----------
  const addTheoreticalDimension = () => {
    setPending(p => ({
      ...p,
      theoreticalDimensions: [...p.theoreticalDimensions, { id: generateId(), name: '', comment: '' }],
    }));
    setMessage(null);
  };

  const updateTheoreticalDimension = (id: string, patch: Partial<TheoreticalDimension>) => {
    setPending(p => ({
      ...p,
      theoreticalDimensions: p.theoreticalDimensions.map(d => d.id === id ? { ...d, ...patch } : d),
    }));
    setMessage(null);
  };

  const deleteTheoreticalDimension = (id: string) => {
    const dim = pending.theoreticalDimensions.find(d => d.id === id);
    if (!confirm(`确定删除理论盈亏比维度「${dim?.name || '未命名'}」？\n删除后将同时移除所有记录中该维度的数值，并影响相关的统计分析页面。`)) return;
    setPending(p => ({
      ...p,
      theoreticalDimensions: p.theoreticalDimensions.filter(d => d.id !== id),
    }));
    setMessage(null);
  };

  // ---------- Save ----------
  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. 删除枚举值/理论维度：同步处理受影响记录
      const deletedTradingTypes = fieldConfig.tradingTypes.filter(t => !pending.tradingTypes.includes(t));
      const deletedTrendFeatures = fieldConfig.trendFeatures.filter(t => !pending.trendFeatures.includes(t));
      const deletedPatternFeatures = fieldConfig.patternFeatures.filter(t => !pending.patternFeatures.includes(t));
      const deletedTheoreticalDimensions = fieldConfig.theoreticalDimensions
        .filter(d => !pending.theoreticalDimensions.some(pd => pd.id === d.id))
        .map(d => d.id);
      if (deletedTradingTypes.length > 0 || deletedTrendFeatures.length > 0 || deletedPatternFeatures.length > 0 || deletedTheoreticalDimensions.length > 0) {
        useRecordsStore.getState().setRecords(
          records.map(r => {
            let changed = false;
            let tradingType = r.tradingType;
            let trendFeatures = r.trendFeatures;
            let patternFeatures = r.patternFeatures;
            let theoreticalProfitRatios = r.theoreticalProfitRatios;
            if (deletedTradingTypes.includes(r.tradingType)) { tradingType = '未知'; changed = true; }
            if (deletedTrendFeatures.some(dt => r.trendFeatures.includes(dt))) {
              trendFeatures = r.trendFeatures.filter(et => !deletedTrendFeatures.includes(et));
              if (trendFeatures.length === 0) trendFeatures = ['未知'];
              changed = true;
            }
            if (deletedPatternFeatures.some(dt => r.patternFeatures.includes(dt))) {
              patternFeatures = r.patternFeatures.filter(pf => !deletedPatternFeatures.includes(pf));
              changed = true;
            }
            if (deletedTheoreticalDimensions.some(id => id in (r.theoreticalProfitRatios || {}))) {
              theoreticalProfitRatios = { ...(r.theoreticalProfitRatios || {}) };
              deletedTheoreticalDimensions.forEach(id => delete theoreticalProfitRatios[id]);
              changed = true;
            }
            return changed ? { ...r, tradingType, trendFeatures, patternFeatures, theoreticalProfitRatios, hasCycleStats: false, cycleId: undefined } : r;
          })
        );
      }

      // 1.5 删除理论维度：同步删除引用该维度的分析页签
      if (deletedTheoreticalDimensions.length > 0) {
        const tabState = useAnalysisTabStore.getState();
        const remainingTabs = tabState.tabs.filter(t => {
          const dimId = t.source.startsWith('dim:') ? t.source.slice(4) : null;
          return dimId === null || !deletedTheoreticalDimensions.includes(dimId);
        });
        if (remainingTabs.length !== tabState.tabs.length) {
          tabState.setTabs(remainingTabs);
          await saveTabsToR2(remainingTabs);
        }
      }

      // 2. 保存配置
      const newConfig: FieldConfig = {
        tradingTypes: pending.tradingTypes,
        trendFeatures: pending.trendFeatures,
        patternFeatures: pending.patternFeatures,
        aggregateRules: pending.aggregateRules.map(r => ({ name: r.name, includedTypes: [...r.includedTypes] })),
        theoreticalDimensions: pending.theoreticalDimensions.map(d => ({ ...d })),
        journalStrategyConfig: pending.journalStrategyConfig.map(s => ({ ...s, strategyGroups: [] })),
        sharedJournalStrategyGroups: pending.sharedStrategyGroups.map(g => ({ ...g, strategies: [...g.strategies] })),
        mindsetTable: pending.mindsetTable,
        decisionChecklist: pending.decisionChecklist,
        priceLevelCodes: { ...pending.priceLevelCodes },
      };
      setFieldConfig(newConfig);
      const saveResult = await saveFieldConfigToR2(newConfig);
      if (saveResult.success) {
        setMessage({ type: 'success', text: '配置已保存' });
      } else {
        setMessage({ type: 'error', text: saveResult.error || '保存失败，请重试' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-gray-700" />
          <h2 className="text-xl font-bold text-gray-900">字段配置</h2>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={resetFromStore} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border rounded">
              撤销
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <span className="text-sm">{message.text}</span>
          <button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Section 1: 交易类型 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">交易类型 (tradingType)</h3>
          <button onClick={addTradingType} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 mb-3">拖动标签可调整排序，下拉框按此顺序显示</p>
        <div className="flex flex-wrap gap-2">
          {pending.tradingTypes.map((t, idx) => (
            <span
              key={t}
              draggable
              onDragStart={() => handleDragStart('trading', idx)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop('trading', idx)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-800 rounded-full text-sm cursor-grab active:cursor-grabbing select-none ${
                dragType === 'trading' && dragFromIndex === idx ? 'opacity-40' : ''
              }`}
            >
              {t}
              {t !== '未知' && (
                <button onClick={() => deleteTradingType(t)} className="hover:text-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Section 2: 趋势特征 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">趋势特征 (trendFeatures)</h3>
          <button onClick={addTrendFeature} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 mb-3">拖动标签可调整排序，下拉框按此顺序显示</p>
        <div className="flex flex-wrap gap-2">
          {pending.trendFeatures.map((e, idx) => (
            <span
              key={e}
              draggable
              onDragStart={() => handleDragStart('trend', idx)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop('trend', idx)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-800 rounded-full text-sm cursor-grab active:cursor-grabbing select-none ${
                dragType === 'trend' && dragFromIndex === idx ? 'opacity-40' : ''
              }`}
            >
              {e}
              {e !== '未知' && (
                <button onClick={() => deleteTrendFeature(e)} className="hover:text-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Section 3: 模式特征 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">模式特征 (patternFeatures)</h3>
          <button onClick={addPatternFeature} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 mb-3">「系统」「非系统」为固定标记，不可删除</p>
        <div className="flex flex-wrap gap-2">
          {pending.patternFeatures.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-800 rounded-full text-sm select-none"
            >
              {e}
              {e !== '系统' && e !== '非系统' && (
                <button onClick={() => deletePatternFeature(e)} className="hover:text-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Section 3: 聚合规则 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">聚合规则</h3>
          <button onClick={addAggregateRule} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        </div>
        {pending.aggregateRules.length === 0 ? (
          <p className="text-sm text-gray-500">暂无聚合规则</p>
        ) : (
          <div className="space-y-4">
            {pending.aggregateRules.map(rule => (
              <div key={rule.name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-900">{rule.name}</span>
                  <button onClick={() => deleteAggregateRule(rule.name)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pending.tradingTypes.filter(t => t !== '未知').map(t => (
                    <label key={t} className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={rule.includedTypes.includes(t)}
                        onChange={() => toggleAggregateMember(rule.name, t)}
                        className="rounded"
                      />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4: 理论盈亏比维度 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">理论盈亏比维度</h3>
          <button onClick={addTheoreticalDimension} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增维度
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 mb-4">维度的名称与备注说明仅在字段编辑中维护；数据编辑中按维度录入数值（未填默认等于盈亏情况）。</p>

        {pending.theoreticalDimensions.length === 0 ? (
          <p className="text-sm text-gray-500">暂无理论盈亏比维度，点击「新增维度」添加。</p>
        ) : (
          <div className="space-y-3">
            {pending.theoreticalDimensions.map(dim => (
              <div key={dim.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={dim.name}
                    onChange={(e) => updateTheoreticalDimension(dim.id, { name: e.target.value })}
                    placeholder="维度名称（如：理论目标位）"
                    className="flex-1 text-sm border rounded px-2 py-1.5"
                  />
                  <button onClick={() => deleteTheoreticalDimension(dim.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={dim.comment}
                  onChange={(e) => updateTheoreticalDimension(dim.id, { comment: e.target.value })}
                  placeholder="备注说明（仅在字段编辑显示）"
                  className="w-full text-xs border rounded px-2 py-1.5"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───────── 交易日志策略配置 ───────── */}
      <div className="border rounded-lg p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">交易日志 - 策略配置</h3>
        <p className="text-xs text-gray-400">配置共享策略组和阶段名称。所有阶段共用同一套策略组。</p>

        {/* 价位代码 */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">价位代码</h4>
          <p className="text-xs text-gray-400 mb-3">为 7 个价位设定代码，在策略文本中用 <code className="text-blue-600">/代码</code> 引用，渲染时自动代入该日志对应的数值（未填写时保留代码原文）。</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PRICE_LEVEL_LABELS.map((label, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 truncate">{label}</span>
                <input
                  type="text"
                  value={pending.priceLevelCodes[idx] ?? ''}
                  onChange={(e) => setPending(p => ({
                    ...p,
                    priceLevelCodes: { ...p.priceLevelCodes, [idx]: e.target.value },
                  }))}
                  placeholder={`/${idx}`}
                  className="flex-1 text-xs border rounded px-2 py-1"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 策略组配置（共享） */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">策略组配置（所有阶段共用）</h4>
          {pending.sharedStrategyGroups.map((group, gi) => (
            <div key={group.groupId} className="ml-4 border-l-2 border-blue-200 pl-4 space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">组名:</span>
                <input
                  type="text"
                  value={group.groupName}
                  onChange={(e) => setPending(p => ({
                    ...p,
                    sharedStrategyGroups: p.sharedStrategyGroups.map((g, j) =>
                      j === gi ? { ...g, groupName: e.target.value } : g
                    ),
                  }))}
                  className="text-xs border rounded px-2 py-1 flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.strategies.map((strat, stri) => (
                  <span key={strat.strategyId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded text-xs">
                    <input
                      type="text"
                      value={strat.text}
                      onChange={(e) => setPending(p => ({
                        ...p,
                        sharedStrategyGroups: p.sharedStrategyGroups.map((g, j) => j === gi ? {
                          ...g, strategies: g.strategies.map((st, k) => k === stri ? { ...st, text: e.target.value } : st)
                        } : g),
                      }))}
                      className="w-32 bg-transparent border-0 p-0 text-xs focus:outline-none"
                    />
                    <button onClick={() => setPending(p => ({
                      ...p,
                      sharedStrategyGroups: p.sharedStrategyGroups.map((g, j) => j === gi ? {
                        ...g, strategies: g.strategies.filter((_, k) => k !== stri)
                      } : g),
                    }))}><X className="h-2.5 w-2.5 text-gray-400 hover:text-red-500" /></button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    const text = prompt('输入新策略内容：');
                    if (!text?.trim()) return;
                    setPending(p => ({
                      ...p,
                      sharedStrategyGroups: p.sharedStrategyGroups.map((g, j) => j === gi ? {
                        ...g, strategies: [...g.strategies, { strategyId: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), sortOrder: g.strategies.length }]
                      } : g),
                    }));
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5"
                >
                  <Plus className="h-3 w-3 inline mr-0.5" />添加策略
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 阶段名称配置 */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">阶段名称配置</h4>
          <div className="grid grid-cols-2 gap-2">
            {pending.journalStrategyConfig.map((stage, si) => (
              <div key={stage.stageId} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-24 truncate">{stage.stageId}</span>
                <input
                  type="text"
                  value={stage.stageName}
                  onChange={(e) => setPending(p => ({
                    ...p,
                    journalStrategyConfig: p.journalStrategyConfig.map((s, i) =>
                      i === si ? { ...s, stageName: e.target.value } : s
                    ),
                  }))}
                  className="text-xs border rounded px-2 py-1 flex-1"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── 心态管理表格配置 ───────── */}
      <div className="border rounded-lg p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">心态管理 - 表格配置</h3>
        <p className="text-xs text-gray-400">配置3行3列表格的内容（等级、现象、策略）</p>
        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border">等级</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border">现象</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border">策略</th>
            </tr>
          </thead>
          <tbody>
            {pending.mindsetTable.map((row, ri) => (
              <tr key={row.id}>
                <td className="border px-2 py-1">
                  <input type="text" value={row.level} onChange={(e) => setPending(p => ({ ...p, mindsetTable: p.mindsetTable.map((r, i) => i === ri ? { ...r, level: e.target.value } : r) }))} className="w-full border-0 p-1 text-xs" />
                </td>
                <td className="border px-2 py-1">
                  <input type="text" value={row.phenomenon} onChange={(e) => setPending(p => ({ ...p, mindsetTable: p.mindsetTable.map((r, i) => i === ri ? { ...r, phenomenon: e.target.value } : r) }))} className="w-full border-0 p-1 text-xs" />
                </td>
                <td className="border px-2 py-1">
                  <input type="text" value={row.strategy} onChange={(e) => setPending(p => ({ ...p, mindsetTable: p.mindsetTable.map((r, i) => i === ri ? { ...r, strategy: e.target.value } : r) }))} className="w-full border-0 p-1 text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ───────── 决策质量控制表配置 ───────── */}
      <div className="border rounded-lg p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">决策质量控制 - 检查清单配置</h3>
        <p className="text-xs text-gray-400">每行一个检查项，可添加/删除/编辑</p>
        {pending.decisionChecklist.map((item, di) => (
          <div key={item.id} className="flex items-center gap-2">
            <input
              type="text"
              value={item.label}
              onChange={(e) => setPending(p => ({ ...p, decisionChecklist: p.decisionChecklist.map((it, i) => i === di ? { ...it, label: e.target.value } : it) }))}
              placeholder="分类"
              className="w-24 text-xs border rounded px-2 py-1"
            />
            <input
              type="text"
              value={item.question}
              onChange={(e) => setPending(p => ({ ...p, decisionChecklist: p.decisionChecklist.map((it, i) => i === di ? { ...it, question: e.target.value } : it) }))}
              placeholder="判断项"
              className="flex-1 text-xs border rounded px-2 py-1"
            />
            <button onClick={() => setPending(p => ({ ...p, decisionChecklist: p.decisionChecklist.filter((_, i) => i !== di) }))}>
              <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setPending(p => ({
            ...p,
            decisionChecklist: [...p.decisionChecklist, { id: `dc_${Date.now()}`, label: '新分类', question: '新判断项', checked: false }],
          }))}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          <Plus className="h-3.5 w-3.5 inline mr-0.5" />添加检查项
        </button>
      </div>
    </div>
  );
};

import React, { useState, useCallback } from 'react';
import { Settings, Plus, Trash2, Save, X } from 'lucide-react';
import { useDataStore } from '@/stores';
import type { FieldConfig, AggregateRule, HistogramConfig } from '@/types';
import { DEFAULT_HISTOGRAM_CUTS } from '@/types';

type PendingConfig = {
  tradingTypes: string[];
  entryTypes: string[];
  aggregateRules: AggregateRule[];
  histogramConfigs: Record<string, HistogramConfig>;
};

export const FieldConfigPage: React.FC = () => {
  const fieldConfig = useDataStore(s => s.fieldConfig);
  const records = useDataStore(s => s.records);
  const saveFieldConfig = useDataStore(s => s.saveFieldConfig);

  const [pending, setPending] = useState<PendingConfig>({
    tradingTypes: [...fieldConfig.tradingTypes],
    entryTypes: [...fieldConfig.entryTypes],
    aggregateRules: fieldConfig.aggregateRules.map(r => ({ ...r, includedTypes: [...r.includedTypes] })),
    histogramConfigs: fieldConfig.histogramConfigs ? { ...fieldConfig.histogramConfigs } : {},
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 重置为 store 中的当前值
  const resetFromStore = useCallback(() => {
    setPending({
      tradingTypes: [...fieldConfig.tradingTypes],
      entryTypes: [...fieldConfig.entryTypes],
      aggregateRules: fieldConfig.aggregateRules.map(r => ({ ...r, includedTypes: [...r.includedTypes] })),
      histogramConfigs: fieldConfig.histogramConfigs ? { ...fieldConfig.histogramConfigs } : {},
    });
    setMessage(null);
  }, [fieldConfig]);

  const hasChanges = JSON.stringify(pending) !== JSON.stringify({
    tradingTypes: fieldConfig.tradingTypes,
    entryTypes: fieldConfig.entryTypes,
    aggregateRules: fieldConfig.aggregateRules,
    histogramConfigs: fieldConfig.histogramConfigs || {},
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
    
    setPending(p => {
      const { [type]: _, ...restHistogramConfigs } = p.histogramConfigs;
      return {
        tradingTypes: p.tradingTypes.filter(t => t !== type),
        entryTypes: p.entryTypes,
        aggregateRules: p.aggregateRules.map(r => ({
          ...r,
          includedTypes: r.includedTypes.filter(t => t !== type),
        })),
        histogramConfigs: restHistogramConfigs,
      };
    });
    setMessage(null);
  };

  // ---------- entryType ----------
  const addEntryType = () => {
    const name = prompt('请输入新的交易切入类型名称：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (pending.entryTypes.includes(trimmed)) {
      setMessage({ type: 'error', text: `交易切入类型「${trimmed}」已存在` });
      return;
    }
    setPending(p => ({ ...p, entryTypes: [...p.entryTypes, trimmed] }));
    setMessage(null);
  };

  const deleteEntryType = (type: string) => {
    if (type === '未知') {
      setMessage({ type: 'error', text: '「未知」类型不可删除' });
      return;
    }
    const count = records.filter(r => r.entryType === type).length;
    if (!confirm(`确定删除交易切入类型「${type}」？\n${count} 条记录将被标记为「未知」`)) return;
    setPending(p => ({ ...p, entryTypes: p.entryTypes.filter(e => e !== type) }));
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

  // ---------- Save ----------
  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. 删除枚举值：将受影响记录标记为「未知」
      const deletedTradingTypes = fieldConfig.tradingTypes.filter(t => !pending.tradingTypes.includes(t));
      const deletedEntryTypes = fieldConfig.entryTypes.filter(t => !pending.entryTypes.includes(t));
      if (deletedTradingTypes.length > 0 || deletedEntryTypes.length > 0) {
        useDataStore.getState().setRecords(
          records.map(r => {
            let changed = false;
            let tradingType = r.tradingType;
            let entryType = r.entryType;
            if (deletedTradingTypes.includes(r.tradingType)) { tradingType = '未知'; changed = true; }
            if (deletedEntryTypes.includes(r.entryType)) { entryType = '未知'; changed = true; }
            return changed ? { ...r, tradingType, entryType, hasCycleStats: false, cycleId: undefined } : r;
          })
        );
      }

      // 2. 保存配置
      const newConfig: FieldConfig = {
        tradingTypes: pending.tradingTypes,
        entryTypes: pending.entryTypes,
        aggregateRules: pending.aggregateRules.map(r => ({ name: r.name, includedTypes: [...r.includedTypes] })),
        histogramConfigs: { ...pending.histogramConfigs },
      };
      await saveFieldConfig(newConfig);
      setMessage({ type: 'success', text: '配置已保存' });
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
        <div className="flex flex-wrap gap-2">
          {pending.tradingTypes.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-800 rounded-full text-sm">
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

      {/* Section 2: 交易切入类型 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">交易切入类型 (entryType)</h3>
          <button onClick={addEntryType} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.entryTypes.map(e => (
            <span key={e} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-800 rounded-full text-sm">
              {e}
              {e !== '未知' && (
                <button onClick={() => deleteEntryType(e)} className="hover:text-red-600">
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

      {/* Section 4: 直方图档位配置 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">后续盈亏直方图档位</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">为各交易类型配置直方图档位切分点（9 个递增数值 → 10 个档位）。不配置的类型自动使用默认档位。</p>
        
        <div className="space-y-4">
          {pending.tradingTypes.filter(t => t !== '未知').map(type => {
            const config = pending.histogramConfigs[type];
            const cuts = config?.cuts ?? DEFAULT_HISTOGRAM_CUTS;
            const hasCustom = !!config;
            const labels = [
              `≤ ${cuts[0]}%`,
              ...cuts.slice(0, -1).map((c, i) => `${c}% ~ ${cuts[i + 1]}%`),
              `> ${cuts[cuts.length - 1]}%`,
            ];
            
            return (
              <div key={type} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-900">{type}</span>
                  <div className="flex items-center gap-2">
                    {hasCustom && (
                      <button
                        onClick={() => {
                          setPending(p => {
                            const { [type]: _, ...rest } = p.histogramConfigs;
                            return { ...p, histogramConfigs: rest };
                          });
                        }}
                        className="text-xs text-gray-500 hover:text-red-600"
                      >
                        使用默认
                      </button>
                    )}
                    {!hasCustom && (
                      <button
                        onClick={() => {
                          setPending(p => ({
                            ...p,
                            histogramConfigs: { ...p.histogramConfigs, [type]: { cuts: [...DEFAULT_HISTOGRAM_CUTS] } },
                          }));
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        自定义
                      </button>
                    )}
                  </div>
                </div>
                
                {hasCustom ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      {cuts.map((c, i) => (
                        <input
                          key={i}
                          type="number"
                          step="0.1"
                          value={c}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            if (isNaN(val)) return;
                            setPending(p => {
                              const newCuts = [...(p.histogramConfigs[type]?.cuts ?? cuts)];
                              newCuts[i] = val;
                              return {
                                ...p,
                                histogramConfigs: { ...p.histogramConfigs, [type]: { cuts: newCuts } },
                              };
                            });
                          }}
                          className="w-16 px-1.5 py-1 border rounded text-xs text-center"
                        />
                      ))}
                    </div>
                    {(() => {
                      const curCuts = pending.histogramConfigs[type]?.cuts ?? cuts;
                      const isSorted = curCuts.every((c, i) => i === 0 || c > curCuts[i - 1]);
                      return !isSorted && (
                        <p className="text-xs text-red-600">切分点必须严格递增</p>
                      );
                    })()}
                    <div className="text-xs text-gray-500 mt-2">
                      预览：{labels.join(' | ')}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    默认档位：{labels.join(' | ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

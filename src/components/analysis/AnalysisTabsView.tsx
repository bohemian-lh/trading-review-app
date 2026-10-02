import React, { useMemo, useState } from 'react';
import { useRecordsStore, useAnalysisResult, useAnalysisTabStore } from '@/stores';
import { saveTabsToR2 } from '@/hooks/useStoreSync';
import type { AnalysisTab, ProfitSource } from '@/types';
import { PROFIT_SOURCE_LABELS } from '@/types';
import {
  filterRecords, buildDimensions, getDimensionRecords,
  computeCumulativeProfit, computeCycleProfitRatios, computeGrowthProfitRatios,
} from '@/services/analysisTabService';
import { SeriesLineChart } from './SeriesLineChart';
import { CreateAnalysisTabModal } from './CreateAnalysisTabModal';

interface SeriesInput {
  key: string;
  label: string;
  color: string;
  records: ReturnType<typeof getDimensionRecords>;
}

export const AnalysisTabsView: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const analysis = useAnalysisResult();

  const tabs = useAnalysisTabStore(s => s.tabs);
  const activeTabId = useAnalysisTabStore(s => s.activeTabId);
  const setActiveTabId = useAnalysisTabStore(s => s.setActiveTabId);

  const [showCreate, setShowCreate] = useState(false);
  const [hiddenDims, setHiddenDims] = useState<string[]>([]);

  const dimensions = useMemo(() => buildDimensions(fieldConfig), [fieldConfig]);
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? null, [tabs, activeTabId]);
  const isDefault = !activeTab;

  const source: ProfitSource = activeTab?.source ?? 'profitPercent';
  const baseRecords = useMemo(
    () => (activeTab ? filterRecords(records, activeTab.filter) : records),
    [records, activeTab],
  );
  const tabSuffix = activeTab ? ` · ${activeTab.name}` : '';

  // 维度可见集合（默认全选，隐藏集合记录被取消勾选的维度）
  const visibleDims = useMemo(() => dimensions.filter(d => !hiddenDims.includes(d.key)), [dimensions, hiddenDims]);
  const toggleDim = (key: string) => {
    setHiddenDims(h => (h.includes(key) ? h.filter(k => k !== key) : [...h, key]));
  };

  // 图表数据源
  const seriesInputs: SeriesInput[] = useMemo(() => {
    if (activeTab) {
      return [{ key: 'main', label: activeTab.name, color: '#0ea5e9', records: baseRecords }];
    }
    return visibleDims.map(d => ({
      key: d.key,
      label: d.label,
      color: d.color,
      records: getDimensionRecords(records, d.key),
    }));
  }, [activeTab, visibleDims, records, baseRecords]);

  const cumulativeSeries = useMemo(() => seriesInputs.map(s => ({
    key: s.key, label: s.label, color: s.color,
    values: computeCumulativeProfit(s.records, source).map(p => p.value),
  })), [seriesInputs, source]);

  const cycleSeries = useMemo(() => seriesInputs.map(s => ({
    key: s.key, label: s.label, color: s.color,
    values: computeCycleProfitRatios(s.records, source).map(p => p.value),
  })), [seriesInputs, source]);

  const growthSeries = useMemo(() => seriesInputs.map(s => ({
    key: s.key, label: s.label, color: s.color,
    values: computeGrowthProfitRatios(s.records, source).map(p => p.value),
  })), [seriesInputs, source]);

  const cumulativeX = useMemo(() => Array.from({ length: Math.max(...cumulativeSeries.map(s => s.values.length), 0) }, (_, i) => String(i + 1)), [cumulativeSeries]);
  const cycleX = useMemo(() => Array.from({ length: Math.max(...cycleSeries.map(s => s.values.length), 0) }, (_, i) => `第${i + 1}周期`), [cycleSeries]);
  const growthX = useMemo(() => Array.from({ length: Math.max(...growthSeries.map(s => s.values.length), 0) }, (_, i) => String(i + 1)), [growthSeries]);

  const handleSaveTab = async (tab: AnalysisTab) => {
    useAnalysisTabStore.getState().addTab(tab);
    setShowCreate(false);
    await saveTabsToR2(useAnalysisTabStore.getState().tabs);
  };

  const handleDeleteTab = async (id: string) => {
    if (!window.confirm('确认删除该页签？')) return;
    useAnalysisTabStore.getState().deleteTab(id);
    await saveTabsToR2(useAnalysisTabStore.getState().tabs);
  };

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
      {/* 页签栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveTabId(null)}
          className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${isDefault ? 'border-blue-600 text-blue-600 font-medium bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          总览
        </button>
        {tabs.map(tab => (
          <div key={tab.id} className="flex items-center">
            <button
              onClick={() => setActiveTabId(tab.id)}
              className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${activeTabId === tab.id ? 'border-blue-600 text-blue-600 font-medium bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.name}
            </button>
            <button
              onClick={() => handleDeleteTab(tab.id)}
              className="ml-1 text-gray-300 hover:text-red-500 text-xs"
              title="删除页签"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
        >
          + 新增页签
        </button>
      </div>

      {/* 自定义页签信源提示 */}
      {activeTab && (
        <div className="text-xs text-gray-500">
          数据范围已固定 · 盈亏比信源：{PROFIT_SOURCE_LABELS[activeTab.source]} · 记录数：{baseRecords.length}
        </div>
      )}

      {/* 默认页签：统计卡 */}
      {isDefault && (
        <>
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">数据分析概览</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600 font-medium">总交易记录</p>
                <p className="text-2xl font-bold text-blue-900">{records.length}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium">盈利交易</p>
                <p className="text-2xl font-bold text-green-900">{records.filter(r => r.profitPercent > 0).length}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">亏损交易</p>
                <p className="text-2xl font-bold text-red-900">{records.filter(r => r.profitPercent < 0).length}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 font-medium">持平交易</p>
                <p className="text-2xl font-bold text-gray-900">{records.filter(r => r.profitPercent === 0).length}</p>
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
        </>
      )}

      {/* 维度选择（仅默认页签） */}
      {isDefault && (
        <div className="bg-white shadow rounded-lg p-4">
          <span className="text-xs font-medium text-gray-500">数据统计维度：</span>
          <div className="flex flex-wrap gap-3 mt-2">
            {dimensions.map(d => (
              <label key={d.key} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={!hiddenDims.includes(d.key)} onChange={() => toggleDim(d.key)} className="rounded" />
                <span style={{ color: d.color }}>{d.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 图1：盈亏曲线 */}
      <div className="bg-white shadow rounded-lg p-6">
        <SeriesLineChart
          title={`盈亏曲线${tabSuffix}`}
          series={cumulativeSeries}
          xLabels={cumulativeX}
          yLabel="盈亏"
          ruleText={<p className="text-sm text-blue-800">累计盈亏 = 按开单时间排序后逐笔累加所选信源字段的值（null 跳过，0 计入）</p>}
          noDataText="暂无数据"
        />
      </div>

      {/* 图2：盈亏比周期图 */}
      <div className="bg-white shadow rounded-lg p-6">
        <SeriesLineChart
          title={`盈亏比周期图${tabSuffix}`}
          series={cycleSeries}
          xLabels={cycleX}
          yLabel="盈亏比"
          ruleText={<p className="text-sm text-blue-800">盈亏比 = 每 30 笔交易为一周期，按现有盈亏比公式（盈利绝对值/亏损绝对值，带正负）计算</p>}
          noDataText="暂无数据"
        />
      </div>

      {/* 图3：盈亏比成长曲线 */}
      <div className="bg-white shadow rounded-lg p-6">
        <SeriesLineChart
          title={`盈亏比成长曲线${tabSuffix}`}
          series={growthSeries}
          xLabels={growthX}
          yLabel="盈亏比"
          ruleText={<p className="text-sm text-blue-800">第 N 笔的盈亏比 = 前 N 笔按现有盈亏比公式计算，随交易数量增长而变化</p>}
          noDataText="暂无数据"
        />
      </div>

      {showCreate && (
        <CreateAnalysisTabModal
          onClose={() => setShowCreate(false)}
          onSave={handleSaveTab}
        />
      )}
    </div>
  );
};

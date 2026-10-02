import React, { useMemo, useState } from 'react';
import { useRecordsStore, useAnalysisResult, useAnalysisTabStore, useDatasetStore } from '@/stores';
import { saveTabsToR2 } from '@/hooks/useStoreSync';
import { useChartConfig } from '@/hooks/useChartConfig';
import { useOnDemandCompute } from '@/hooks/useOnDemandCompute';
import type { AnalysisTab } from '@/types';
import {
  buildDimensions, getDimensionRecords, mergeGroupRecords,
  computeCumulativeProfit, computeCycleProfitRatios, computeGrowthProfitRatios,
  computeCumulativeProfitFromItems, computeCycleProfitRatiosFromItems, computeGrowthProfitRatiosFromItems,
  type DimensionDef,
} from '@/services/analysisTabService';
import { SeriesLineChart } from './SeriesLineChart';
import { CreateAnalysisTabModal } from './CreateAnalysisTabModal';

const DimensionSelector: React.FC<{
  dimensions: DimensionDef[];
  selected: string[];
  onChange: (keys: string[]) => void;
}> = ({ dimensions, selected, onChange }) => {
  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };
  return (
    <div className="flex flex-wrap gap-3 pb-3 mb-4 border-b border-gray-100">
      <span className="text-xs font-medium text-gray-500 leading-6">数据统计维度：</span>
      {dimensions.map(d => (
        <label key={d.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={selected.includes(d.key)} onChange={() => toggle(d.key)} className="rounded" />
          <span style={{ color: d.color }}>{d.label}</span>
        </label>
      ))}
    </div>
  );
};

export const AnalysisTabsView: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const analysis = useAnalysisResult();

  const tabs = useAnalysisTabStore(s => s.tabs);
  const activeTabId = useAnalysisTabStore(s => s.activeTabId);
  const setActiveTabId = useAnalysisTabStore(s => s.setActiveTabId);

  const [showCreate, setShowCreate] = useState(false);

  const dimensions = useMemo(() => buildDimensions(fieldConfig), [fieldConfig]);
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? null, [tabs, activeTabId]);
  const isDefault = !activeTab;
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
  const tabSuffix = activeTab ? ` · ${activeTab.name}` : '';

  // 自定义页签：结果快照 + 手动更新（不随 records 变化实时重算）
  const tabKey = activeTab ? `${currentDatasetId}:tab:${activeTab.id}` : null;
  const { result: tabResult, refresh: refreshTab, isStale: tabStale } = useOnDemandCompute(
    tabKey,
    [records],
    () => {
      const store = useAnalysisTabStore.getState();
      const tab = store.tabs.find(t => t.id === store.activeTabId);
      if (!tab) return null;
      const merged = mergeGroupRecords(useRecordsStore.getState().records, tab.groups);
      return {
        cumulative: computeCumulativeProfitFromItems(merged).map(p => p.value),
        cycle: computeCycleProfitRatiosFromItems(merged).map(p => p.value),
        growth: computeGrowthProfitRatiosFromItems(merged).map(p => p.value),
        count: merged.length,
      };
    },
  );

  // 每张图独立的维度选择（localStorage 持久化，默认全选）
  const dimensionKeys = useMemo(() => dimensions.map(d => d.key), [dimensions]);
  const [cumulativeDims, setCumulativeDims, cumulativeReady] = useChartConfig('analysis-cumulative-dims', dimensionKeys);
  const [cycleDims, setCycleDims, cycleReady] = useChartConfig('analysis-cycle-dims', dimensionKeys);
  const [growthDims, setGrowthDims, growthReady] = useChartConfig('analysis-growth-dims', dimensionKeys);

  // 未就绪前按全选渲染，避免初始空图闪烁
  const cumulativeSelected = cumulativeReady ? cumulativeDims : dimensionKeys;
  const cycleSelected = cycleReady ? cycleDims : dimensionKeys;
  const growthSelected = growthReady ? growthDims : dimensionKeys;

  const buildDefaultSeries = (selected: string[], kind: 'cumulative' | 'cycle' | 'growth') => dimensions
    .filter(d => selected.includes(d.key))
    .map(d => {
      const recs = getDimensionRecords(records, d.key);
      const points = kind === 'cumulative'
        ? computeCumulativeProfit(recs, 'profitPercent')
        : kind === 'cycle'
          ? computeCycleProfitRatios(recs, 'profitPercent')
          : computeGrowthProfitRatios(recs, 'profitPercent');
      return { key: d.key, label: d.label, color: d.color, values: points.map(p => p.value) };
    });

  const cumulativeSeries = useMemo(() => (
    activeTab
      ? [{ key: 'main', label: activeTab.name, color: '#0ea5e9', values: tabResult?.cumulative ?? [] }]
      : buildDefaultSeries(cumulativeSelected, 'cumulative')
  ), [activeTab, tabResult, cumulativeSelected, dimensions, records]);
  const cycleSeries = useMemo(() => (
    activeTab
      ? [{ key: 'main', label: activeTab.name, color: '#0ea5e9', values: tabResult?.cycle ?? [] }]
      : buildDefaultSeries(cycleSelected, 'cycle')
  ), [activeTab, tabResult, cycleSelected, dimensions, records]);
  const growthSeries = useMemo(() => (
    activeTab
      ? [{ key: 'main', label: activeTab.name, color: '#0ea5e9', values: tabResult?.growth ?? [] }]
      : buildDefaultSeries(growthSelected, 'growth')
  ), [activeTab, tabResult, growthSelected, dimensions, records]);

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
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            数据范围已固定 · 合并序列数：{activeTab.groups.length} · 记录数：{tabResult?.count ?? 0}（并集去重）
          </span>
          <span className="flex items-center gap-2">
            {tabStale && <span className="text-amber-600">数据已更新</span>}
            <button
              onClick={refreshTab}
              className="px-2 py-1 text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
            >
              更新
            </button>
          </span>
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

      {/* 图1：盈亏曲线 */}
      <div className="bg-white shadow rounded-lg p-6">
        {isDefault && (
          <DimensionSelector dimensions={dimensions} selected={cumulativeSelected} onChange={setCumulativeDims} />
        )}
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
        {isDefault && (
          <DimensionSelector dimensions={dimensions} selected={cycleSelected} onChange={setCycleDims} />
        )}
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
        {isDefault && (
          <DimensionSelector dimensions={dimensions} selected={growthSelected} onChange={setGrowthDims} />
        )}
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

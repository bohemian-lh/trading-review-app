import React, { useState, useMemo, useEffect } from 'react';
import { Table2, BarChart3, Calendar, TrendingUp, Calculator } from 'lucide-react';
import { ImagePreviewModal } from '@/components/editor/ImagePreviewModal';
import { TradeRecordTable } from '@/components/editor/TradeRecordTable';
import { AnalysisPanel } from '@/components/editor/AnalysisPanel';
import { MonthlyAnalysisPanel } from '@/components/editor/MonthlyAnalysisPanel';
import { CycleStatsPanel } from '@/components/editor/CycleStatsPanel';
import { RecordModal } from '@/components/editor/RecordModal';
import { MonthlyAnalysisModal } from '@/components/editor/MonthlyAnalysisModal';
import { useDataEditor } from '@/hooks/useDataEditor';
import { flushScheduledSave } from '@/hooks/useStoreSync';
import { ImportModal } from './ImportModal';
import { QuickProfitCalculator } from './QuickProfitCalculator';

interface Filters {
  month: string;
  tradingType: string;
  trendFeatures: string;
  patternFeatures: string;
}

interface SortConfig {
  key: 'openDate' | 'stockCode' | null;
  direction: 'asc' | 'desc';
}

export const DataEditor: React.FC = () => {
  const { records, cycleStats, fieldConfig, statsNeedUpdate, isSaving, imageDir, recordPaging, recordEditor, stats, analysis, monthly } = useDataEditor();

  // ---- 视图态 ----
  const [activeTab, setActiveTab] = useState<'table1' | 'table2' | 'table3' | 'table4'>('table1');
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);
  const [isQuickCalcOpen, setIsQuickCalcOpen] = useState(false);
  const [imagePreviewImages, setImagePreviewImages] = useState<string[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);

  // 页面隐藏/卸载前把待保存的记录落盘
  useEffect(() => {
    const flush = () => { void flushScheduledSave(true); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ---- 筛选 / 排序 / 翻页：全部下推服务端 ----
  // 查询条件只存在 store 里（recordQuery），组件不再各存一份，
  // 否则路由切走再回来会出现“筛选框是空的、表格却是筛选后的数据”。
  const filters: Filters = useMemo(() => ({
    month: recordPaging.query.fromDay ? recordPaging.query.fromDay.slice(0, 6) : '',
    tradingType: recordPaging.query.tradingType,
    trendFeatures: recordPaging.query.trendFeature,
    patternFeatures: recordPaging.query.patternFeature,
  }), [recordPaging.query]);

  const sortConfig: SortConfig = useMemo(() => ({
    key: recordPaging.query.sortKey,
    direction: recordPaging.query.sort,
  }), [recordPaging.query.sortKey, recordPaging.query.sort]);

  const buildQuery = (nextFilters: Filters, nextSort: SortConfig) => ({
    fromDay: nextFilters.month ? `${nextFilters.month}01` : '',
    toDay: nextFilters.month ? `${nextFilters.month}31` : '',
    tradingType: nextFilters.tradingType,
    trendFeature: nextFilters.trendFeatures,
    patternFeature: nextFilters.patternFeatures,
    sortKey: nextSort.key ?? 'openDate',
    sort: nextSort.direction,
  });

  const handleSort = (key: 'openDate' | 'stockCode') => {
    const next: SortConfig = sortConfig.key === key
      ? { key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'openDate' ? 'desc' : 'asc' };
    recordPaging.applyQuery(buildQuery(filters, next));
  };

  const handleFilterChange = (next: Filters) => {
    recordPaging.applyQuery(buildQuery(next, sortConfig));
  };

  const handleResetFilters = () => {
    recordPaging.applyQuery(buildQuery(
      { month: '', tradingType: '', trendFeatures: '', patternFeatures: '' },
      sortConfig,
    ));
  };

  const monthOptions = useMemo(
    () => recordPaging.months.map(m => ({ value: m, label: `${m.slice(0, 4)}-${m.slice(4, 6)}` })),
    [recordPaging.months],
  );

  // ---- render ----
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 flex items-center justify-between">
        <nav className="flex space-x-8">
          {([
            ['table1', Table2, '表1 - 交易记录'],
            ['table2', BarChart3, '总数据统计'],
            ['table3', Calendar, '月度盈亏比统计'],
            ['table4', TrendingUp, '周期盈亏比统计'],
          ] as const).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setIsQuickCalcOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"
        >
          <Calculator className="h-4 w-4" />
          快捷计算盈亏率
        </button>
      </div>

      {activeTab === 'table1' && (
        <>
          <TradeRecordTable
            records={records}
            filteredCount={recordPaging.total}
            totalRecords={recordPaging.datasetTotal}
            page={recordPaging.page}
            pageSize={recordPaging.pageSize}
            totalPages={recordPaging.totalPages}
            loading={recordPaging.loading}
            onPageChange={recordPaging.goToPage}
            onPageSizeChange={recordPaging.setPageSize}
            sortConfig={sortConfig}
            onSort={handleSort}
            filters={filters}
            monthOptions={monthOptions}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            imgHasHandle={!!imageDir.handle}
            imgPath={imageDir.path}
            onSelectImageDir={imageDir.selectDirectory}
            statsNeedUpdate={statsNeedUpdate}
            updateStatus={stats.updateStatus}
            updateMessage={stats.updateMessage}
            onUpdateStats={stats.refreshCycleStats}
            isSaving={isSaving}
            onAddRecord={() => recordEditor.openRecordModal()}
            onEditRecord={recordEditor.openRecordModal}
            onDeleteRecord={recordEditor.deleteRecord}
            onImageImport={() => setIsImageImportModalOpen(true)}
            onPreviewImages={(images) => { setImagePreviewImages(images); setIsImagePreviewOpen(true); }}
          />

          {recordPaging.error && (
            <div className="flex items-center gap-3 text-sm text-red-600">
              <span>{recordPaging.error}</span>
              <button
                type="button"
                onClick={recordPaging.reload}
                disabled={recordPaging.loading}
                className="px-2 py-1 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
              >
                重试
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'table2' && (
        <>
          {!stats.hasServerStats && <StatsMissingHint onUpdate={stats.refreshCycleStats} />}
          <AnalysisPanel
            useCustom={analysis.useCustom}
            customData={analysis.customData}
            computedData={analysis.computedData}
            theoreticalDimensions={fieldConfig.theoreticalDimensions}
            onToggleUseCustom={analysis.toggleUseCustom}
            onFieldChange={analysis.changeAnalysisField}
            onTheoreticalFieldChange={analysis.changeTheoreticalField}
            onSyncFromComputed={analysis.syncFromComputed}
          />
        </>
      )}

      {activeTab === 'table3' && (
        <>
          {!stats.hasServerStats && <StatsMissingHint onUpdate={stats.refreshCycleStats} />}
          <MonthlyAnalysisPanel
            useCustom={monthly.useCustom}
            customData={monthly.customData}
            computedData={monthly.computedData}
            onToggleUseCustom={monthly.toggleUseCustom}
            onSyncFromComputed={monthly.syncFromComputed}
            onAddMonthly={() => monthly.openMonthlyModal()}
            onEditMonthly={monthly.openMonthlyModal}
            onDeleteMonthly={monthly.deleteMonthly}
          />
        </>
      )}

      {activeTab === 'table4' && (
        <>
          {Object.keys(cycleStats).length === 0 && <StatsMissingHint onUpdate={stats.refreshCycleStats} />}
          <CycleStatsPanel cycleStats={cycleStats} />
        </>
      )}

      <RecordModal
        isOpen={recordEditor.isModalOpen}
        editingRecord={recordEditor.editingRecord}
        formData={recordEditor.formData}
        validationErrors={recordEditor.validationErrors}
        saveError={recordEditor.saveError}
        isSaving={isSaving}
        imgHasHandle={!!imageDir.handle}
        onFormChange={recordEditor.setFormData}
        onSave={recordEditor.saveRecord}
        onClose={recordEditor.closeRecordModal}
        onClipboardPaste={recordEditor.pasteImagesFromClipboard}
        onClearImages={recordEditor.clearImages}
        overlay={
          <QuickProfitCalculator isOpen={isQuickCalcOpen} onClose={() => setIsQuickCalcOpen(false)} />
        }
      />

      <MonthlyAnalysisModal
        isOpen={monthly.isModalOpen}
        editingMonthly={monthly.editingMonthly}
        monthlyFormData={monthly.formData}
        onFormChange={monthly.setFormData}
        onSave={monthly.saveMonthly}
        onClose={monthly.closeMonthlyModal}
      />

      <ImportModal
        isOpen={isImageImportModalOpen}
        onClose={() => setIsImageImportModalOpen(false)}
        onImport={recordEditor.importRecordFromParsed}
      />

      {/* 记录弹窗打开时，浮层由 RecordModal 的 overlay 承载（位于 Dialog 内，可注册为嵌套 Portal，
          逃逸 Dialog 对 #root 的 inert 与焦点锁）；此处仅在记录弹窗关闭时独立挂载 */}
      <QuickProfitCalculator
        isOpen={isQuickCalcOpen && !recordEditor.isModalOpen}
        onClose={() => setIsQuickCalcOpen(false)}
      />

      <ImagePreviewModal
        images={imagePreviewImages}
        isOpen={isImagePreviewOpen}
        onClose={() => { setIsImagePreviewOpen(false); setImagePreviewImages([]); }}
      />
    </div>
  );
};

/**
 * 统计结果尚未生成时的提示。
 * 记录改为分页加载后，前端不再具备“用全量明细现算”的能力，必须显式让服务端重算。
 */
const StatsMissingHint: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
    <span>统计数据尚未生成，当前展示为空。请按最新记录重算一次后再查看。</span>
    <button
      onClick={onUpdate}
      className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700"
    >
      立即更新统计
    </button>
  </div>
);

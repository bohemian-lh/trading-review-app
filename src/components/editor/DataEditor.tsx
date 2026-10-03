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
  const { records, cycleStats, fieldConfig, statsNeedUpdate, isSaving, imageDir, recordEditor, stats, analysis, monthly } = useDataEditor();

  // ---- 视图态 ----
  const [activeTab, setActiveTab] = useState<'table1' | 'table2' | 'table3' | 'table4'>('table1');
  const [filters, setFilters] = useState<Filters>({ month: '', tradingType: '', trendFeatures: '', patternFeatures: '' });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'openDate', direction: 'desc' });
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);
  const [isQuickCalcOpen, setIsQuickCalcOpen] = useState(false);
  const [imagePreviewImages, setImagePreviewImages] = useState<string[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // ---- sort ----
  const handleSort = (key: 'openDate' | 'stockCode') => {
    setSortConfig(prev => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } as SortConfig;
      return { key, direction: key === 'openDate' ? 'desc' : 'asc' } as SortConfig;
    });
  };

  // ---- filter + sort + pagination ----
  const filteredRecords = useMemo(() => {
    let result = records.filter(record => {
      if (filters.month && !record.openDate.startsWith(filters.month)) return false;
      if (filters.tradingType && record.tradingType !== filters.tradingType) return false;
      if (filters.trendFeatures && !record.trendFeatures.includes(filters.trendFeatures)) return false;
      if (filters.patternFeatures && !record.patternFeatures.includes(filters.patternFeatures)) return false;
      return true;
    });

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [records, filters, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const paginatedRecords = useMemo(
    () => filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRecords, page],
  );
  useEffect(() => { setPage(1); }, [filteredRecords.length]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    records.forEach(r => { if (r.openDate?.length >= 6) months.add(r.openDate.slice(0, 6)); });
    return Array.from(months).sort().map(m => ({ value: m, label: `${m.slice(0, 4)}-${m.slice(4, 6)}` }));
  }, [records]);

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
        <TradeRecordTable
          records={records}
          paginatedRecords={paginatedRecords}
          filteredCount={filteredRecords.length}
          totalRecords={records.length}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          sortConfig={sortConfig}
          onSort={handleSort}
          filters={filters}
          monthOptions={monthOptions}
          onFilterChange={setFilters}
          onResetFilters={() => setFilters({ month: '', tradingType: '', trendFeatures: '', patternFeatures: '' })}
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
      )}

      {activeTab === 'table2' && (
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
      )}

      {activeTab === 'table3' && (
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
      )}

      {activeTab === 'table4' && <CycleStatsPanel cycleStats={cycleStats} />}

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

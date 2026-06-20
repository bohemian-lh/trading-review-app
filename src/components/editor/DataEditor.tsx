import React, { useState, useMemo, useEffect } from 'react';
import { Table2, BarChart3, Calendar, TrendingUp } from 'lucide-react';
import { ImagePreviewModal } from '@/components/editor/ImagePreviewModal';
import { TradeRecordTable } from '@/components/editor/TradeRecordTable';
import { AnalysisPanel } from '@/components/editor/AnalysisPanel';
import { MonthlyAnalysisPanel } from '@/components/editor/MonthlyAnalysisPanel';
import { CycleStatsPanel } from '@/components/editor/CycleStatsPanel';
import { RecordModal } from '@/components/editor/RecordModal';
import { MonthlyAnalysisModal } from '@/components/editor/MonthlyAnalysisModal';
import { useRecordsStore, useUIStore, useAnalysisResult, useMonthlyAnalysis } from '@/stores';
import { useImageDirectory } from '@/hooks/useImageDirectory';
import { saveNow, updateCycleStats } from '@/hooks/useStoreSync';
import type { TradingRecord, TradingRecordInput, AnalysisResult, MonthlyAnalysis, ParsedTradeData, FieldConfig } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';
import { validateTradingRecord } from '@/utils/validationUtils';
import { ImportModal } from './ImportModal';

type ValidationError = { field: string; message: string };

const emptyRecord: TradingRecordInput = {
  openDate: getDefaultOpenDate(),
  stockName: '',
  stockCode: '',
  tradingType: '齐飞水底',
  entryType: '未知',
  isSystem: '是',
  hasMistake: '否',
  profitPercent: null,
  holdDays: null,
  images: [],
  imagePrefix: '',
  subsequentProfitSpace: null,
  preMarket: '否',
};

interface Filters {
  month: string;
  tradingType: string;
  entryType: string;
  isSystem: string;
}

interface SortConfig {
  key: 'openDate' | 'stockCode' | null;
  direction: 'asc' | 'desc';
}

function validateForm(data: TradingRecordInput, fieldConfig: FieldConfig): { field: string; message: string }[] {
  const result = validateTradingRecord(data as Partial<TradingRecord>, undefined, fieldConfig);
  return result.errors.map(err => ({ field: err.field, message: err.message }));
}

export const DataEditor: React.FC = () => {
  // ---- stores ----
  const records = useRecordsStore(s => s.records);
  const addRecord = useRecordsStore(s => s.addRecord);
  const updateRecord = useRecordsStore(s => s.updateRecord);
  const deleteRecord = useRecordsStore(s => s.deleteRecord);
  const customAnalysis = useRecordsStore(s => s.customAnalysis);
  const setCustomAnalysis = useRecordsStore(s => s.setCustomAnalysis);
  const updateCustomAnalysisField = useRecordsStore(s => s.updateCustomAnalysisField);
  const toggleUseCustomAnalysis = useRecordsStore(s => s.toggleUseCustomAnalysis);
  const customMonthly = useRecordsStore(s => s.customMonthly);
  const setCustomMonthly = useRecordsStore(s => s.setCustomMonthly);
  const addCustomMonthly = useRecordsStore(s => s.addCustomMonthly);
  const updateCustomMonthly = useRecordsStore(s => s.updateCustomMonthly);
  const deleteCustomMonthly = useRecordsStore(s => s.deleteCustomMonthly);
  const toggleUseCustomMonthly = useRecordsStore(s => s.toggleUseCustomMonthly);
  const cycleStats = useRecordsStore(s => s.cycleStats);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const statsNeedUpdate = useRecordsStore(s => s.statsNeedUpdate);
  const isSaving = useUIStore(s => s.isSaving);

  const computedAnalysis = useAnalysisResult();
  const computedMonthly = useMonthlyAnalysis();

  // ---- local state ----
  const [activeTab, setActiveTab] = useState<'table1' | 'table2' | 'table3' | 'table4'>('table1');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [filters, setFilters] = useState<Filters>({ month: '', tradingType: '', entryType: '', isSystem: '' });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'openDate', direction: 'desc' });
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingMonthly, setEditingMonthly] = useState<MonthlyAnalysis | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [monthlyFormData, setMonthlyFormData] = useState<Partial<MonthlyAnalysis>>({});
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);
  const [imagePreviewImages, setImagePreviewImages] = useState<string[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const imgDir = useImageDirectory();

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
      if (filters.entryType && record.entryType !== filters.entryType) return false;
      if (filters.isSystem && record.isSystem !== filters.isSystem) return false;
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

  // ---- record modal ----
  const handleOpenModal = (record?: TradingRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        openDate: record.openDate, stockName: record.stockName, stockCode: record.stockCode,
        tradingType: record.tradingType, entryType: record.entryType, isSystem: record.isSystem,
        hasMistake: record.hasMistake, profitPercent: record.profitPercent, holdDays: record.holdDays,
        images: record.images || [], imagePrefix: record.imagePrefix || '',
        subsequentProfitSpace: record.subsequentProfitSpace, preMarket: record.preMarket,
      });
    } else {
      setEditingRecord(null);
      setFormData({ ...emptyRecord, openDate: getDefaultOpenDate() });
    }
    setValidationErrors([]);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData(emptyRecord);
    setValidationErrors([]);
  };

  const handleClipboardPaste = async () => {
    if (!imgDir.handle) { alert('请先在页面顶部选择图片存储目录'); return; }
    if (!formData.openDate) { alert('请先填写开单时间'); return; }
    try {
      let prefix = formData.imagePrefix || '';
      if (!editingRecord || !prefix) {
        const state = useRecordsStore.getState();
        const sameDateRecords = state.records
          .filter(r => r.openDate === formData.openDate && r.imagePrefix)
          .sort((a, b) => (a.imagePrefix || '').localeCompare(b.imagePrefix || ''));
        prefix = imgDir.generatePrefix(formData.openDate, sameDateRecords.length);
      }
      const filenames = await imgDir.saveImagesFromClipboard(prefix, (formData.images || []).length, formData.openDate);
      setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...filenames], imagePrefix: prefix }));
    } catch (e: any) { alert('粘贴失败: ' + e.message); }
  };

  const handleClearImages = () => setFormData(prev => ({ ...prev, images: [], imagePrefix: '' }));

  const handleSave = async () => {
    const errors = validateForm(formData, fieldConfig);
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setSaveError(null);
    if (formData.profitPercent === null || formData.holdDays === null) {
      setValidationErrors([{ field: 'profitPercent', message: '盈亏和持仓天数不能为空' }]);
      return;
    }
    const saveData = {
      ...formData, profitPercent: formData.profitPercent, holdDays: formData.holdDays,
      images: formData.images || [], imagePrefix: formData.imagePrefix || '',
      subsequentProfitSpace: formData.subsequentProfitSpace ?? null,
    };
    if (editingRecord) updateRecord(editingRecord.id, saveData);
    else addRecord(saveData);
    try { await saveNow(); handleCloseModal(); } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    }
  };

  // ---- delete ----
  const handleDelete = (id: string) => {
    const record = records.find(r => r.id === id);
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(id);
      if (record?.imagePrefix) imgDir.deleteImages(record.imagePrefix).catch(() => {});
    }
  };

  // ---- stats ----
  const handleUpdateStats = async () => {
    if (records.length === 0) { setUpdateStatus('error'); setUpdateMessage('没有数据需要处理'); return; }
    setUpdateStatus('loading'); setUpdateMessage('正在更新统计数据...');
    try { updateCycleStats(); await saveNow(); setUpdateStatus('success'); setUpdateMessage('统计数据已更新'); }
    catch (error) { setUpdateStatus('error'); setUpdateMessage(error instanceof Error ? error.message : '更新失败'); }
    setTimeout(() => { setUpdateStatus('idle'); setUpdateMessage(''); }, 5000);
  };

  // ---- analysis ----
  const handleAnalysisFieldChange = (field: keyof AnalysisResult, value: string) => {
    updateCustomAnalysisField(field, value === 'N/A' ? 'N/A' : Number(value));
  };

  const syncFromComputed = () => {
    if (confirm('确定要把当前计算的数据同步到自定义数据吗？')) {
      setCustomAnalysis({ useCustom: true, data: computedAnalysis });
      setCustomMonthly({ useCustom: true, data: computedMonthly });
    }
  };

  // ---- monthly modal ----
  const handleOpenMonthlyModal = (item?: MonthlyAnalysis) => {
    if (item) {
      setEditingMonthly(item);
      setMonthlyFormData({ ...item });
    } else {
      setEditingMonthly(null);
      setMonthlyFormData({ month: '', systemProfitRatio: 'N/A', systemNoMistakeProfitRatio: 'N/A',
        systemWithMistakeProfitRatio: 'N/A', nonSystemProfitRatio: 'N/A', avgProfitRatio: 'N/A', totalProfit: 'N/A' });
    }
    setIsMonthlyModalOpen(true);
  };

  const handleCloseMonthlyModal = () => { setIsMonthlyModalOpen(false); setEditingMonthly(null); setMonthlyFormData({}); };

  const handleSaveMonthly = () => {
    if (!monthlyFormData.month) { alert('请输入月份'); return; }
    if (editingMonthly) updateCustomMonthly(editingMonthly.month, monthlyFormData as MonthlyAnalysis);
    else addCustomMonthly(monthlyFormData as MonthlyAnalysis);
    handleCloseMonthlyModal();
  };

  const handleDeleteMonthly = (month: string) => {
    if (confirm('确定要删除这个月份的数据吗？')) deleteCustomMonthly(month);
  };

  // ---- image import ----
  const handleImageImport = (data: ParsedTradeData) => {
    setFormData({ ...emptyRecord, openDate: data.openDate, stockName: data.stockName,
      stockCode: data.stockCode, profitPercent: data.profitPercent, holdDays: data.holdDays });
    setIsModalOpen(true);
  };

  // ---- render ----
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
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
          onResetFilters={() => setFilters({ month: '', tradingType: '', entryType: '', isSystem: '' })}
          imgHasHandle={!!imgDir.handle}
          imgPath={imgDir.path}
          onSelectImageDir={imgDir.selectDirectory}
          statsNeedUpdate={statsNeedUpdate}
          updateStatus={updateStatus}
          updateMessage={updateMessage}
          onUpdateStats={handleUpdateStats}
          isSaving={isSaving}
          onAddRecord={() => handleOpenModal()}
          onEditRecord={handleOpenModal}
          onDeleteRecord={handleDelete}
          onImageImport={() => setIsImageImportModalOpen(true)}
          onPreviewImages={(images) => { setImagePreviewImages(images); setIsImagePreviewOpen(true); }}
        />
      )}

      {activeTab === 'table2' && (
        <AnalysisPanel
          useCustom={customAnalysis.useCustom}
          customData={customAnalysis.data}
          computedData={computedAnalysis}
          onToggleUseCustom={toggleUseCustomAnalysis}
          onFieldChange={handleAnalysisFieldChange}
          onSyncFromComputed={syncFromComputed}
        />
      )}

      {activeTab === 'table3' && (
        <MonthlyAnalysisPanel
          useCustom={customMonthly.useCustom}
          customData={customMonthly.data}
          computedData={computedMonthly}
          onToggleUseCustom={toggleUseCustomMonthly}
          onSyncFromComputed={syncFromComputed}
          onAddMonthly={() => handleOpenMonthlyModal()}
          onEditMonthly={handleOpenMonthlyModal}
          onDeleteMonthly={handleDeleteMonthly}
        />
      )}

      {activeTab === 'table4' && <CycleStatsPanel cycleStats={cycleStats} />}

      <RecordModal
        isOpen={isModalOpen}
        editingRecord={editingRecord}
        formData={formData}
        validationErrors={validationErrors}
        saveError={saveError}
        isSaving={isSaving}
        imgHasHandle={!!imgDir.handle}
        onFormChange={setFormData}
        onSave={handleSave}
        onClose={handleCloseModal}
        onClipboardPaste={handleClipboardPaste}
        onClearImages={handleClearImages}
      />

      <MonthlyAnalysisModal
        isOpen={isMonthlyModalOpen}
        editingMonthly={editingMonthly}
        monthlyFormData={monthlyFormData}
        onFormChange={setMonthlyFormData}
        onSave={handleSaveMonthly}
        onClose={handleCloseMonthlyModal}
      />

      <ImportModal
        isOpen={isImageImportModalOpen}
        onClose={() => setIsImageImportModalOpen(false)}
        onImport={handleImageImport}
      />

      <ImagePreviewModal
        images={imagePreviewImages}
        isOpen={isImagePreviewOpen}
        onClose={() => { setIsImagePreviewOpen(false); setImagePreviewImages([]); }}
      />
    </div>
  );
};

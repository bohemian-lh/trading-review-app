import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, Filter, RefreshCw, CheckCircle, AlertCircle, Loader2, Table2, BarChart3, Calendar, ChevronUp, ChevronDown, Image, TrendingUp, Clipboard, Eye, FolderOpen } from 'lucide-react';
import { Button, Input, Select, Modal, Toggle, ZoomControls } from '@/components/common';
import { Pagination } from '@/components/common/Pagination';
import { ImagePreviewModal } from '@/components/editor/ImagePreviewModal';
import { useRecordsStore, useUIStore, useAnalysisResult, useMonthlyAnalysis } from '@/stores';
import { useTableZoom } from '@/hooks/useTableZoom';
import { useImageDirectory } from '@/hooks/useImageDirectory';
import { saveNow, updateCycleStats } from '@/hooks/useStoreSync';
import type { TradingRecord, TradingRecordInput, TradingType, MistakeStatus, MonthlyAnalysis, AnalysisResult, ParsedTradeData, EntryType, FieldConfig } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';
import { validateTradingRecord } from '@/utils/validationUtils';
import { ImportModal } from './ImportModal';

type ValidationError = { field: string; message: string };

const TRADING_TYPE_OPTIONS = [
  { value: '齐飞水底', label: '齐飞水底' },
  { value: '齐飞前多踩MA', label: '齐飞前多踩MA' },
  { value: '风险释放平台转一致', label: '风险释放平台转一致' },
  { value: '双阳平台转一致', label: '双阳平台转一致' },
  { value: '非系统', label: '非系统' },
  { value: '齐飞水底三等量', label: '齐飞水底三等量' },
  { value: '未知', label: '未知' },
];

const ENTRY_TYPE_OPTIONS = [
  { value: 'p2前', label: 'p2前' },
  { value: 'p34', label: 'p34' },
  { value: 'p4后', label: 'p4后' },
  { value: '未知', label: '未知' },
];

const YES_NO_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
];

const HAS_MISTAKE_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
  { value: '其他', label: '其他' },
];

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

const ANALYSIS_FIELDS: Array<{ key: keyof AnalysisResult; label: string }> = [
  { key: 'systemProfitRatio', label: '符合系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '符合系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '符合系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '不符合系统盈亏比' },
  { key: 'systemProfitAvgHoldDays', label: '符合系统盈利平均持仓' },
  { key: 'systemLossAvgHoldDays', label: '符合系统亏损平均持仓' },
  { key: 'nonSystemProfitAvgHoldDays', label: '不符合系统盈利平均持仓' },
  { key: 'nonSystemLossAvgHoldDays', label: '不符合系统亏损平均持仓' },
];

const MONTHLY_FIELDS: Array<{ key: keyof Omit<MonthlyAnalysis, 'month'>; label: string }> = [
  { key: 'systemProfitRatio', label: '系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '非系统盈亏比' },
  { key: 'avgProfitRatio', label: '平均盈亏比' },
  { key: 'totalProfit', label: '总盈亏' },
];

export const DataEditor: React.FC = () => {
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
  
  const [activeTab, setActiveTab] = useState<'table1' | 'table2' | 'table3' | 'table4'>('table1');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [filters, setFilters] = useState<Filters>({
    month: '',
    tradingType: '',
    entryType: '',
    isSystem: '',
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'openDate',
    direction: 'desc',
  });
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingMonthly, setEditingMonthly] = useState<MonthlyAnalysis | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [monthlyFormData, setMonthlyFormData] = useState<Partial<MonthlyAnalysis>>({});
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);

  // 分页
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // 图片预览
  const [imagePreviewImages, setImagePreviewImages] = useState<string[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);

  // 图片目录 Hook
  const imgDir = useImageDirectory();

  // 处理排序点击
  const handleSort = (key: 'openDate' | 'stockCode') => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: key === 'openDate' ? 'desc' : 'asc',
      };
    });
  };

  // 计算筛选和排序后的数据
  const filteredRecords = useMemo(() => {
    // 先筛选
    let result = records.filter((record) => {
      if (filters.month && !record.openDate.startsWith(filters.month)) {
        return false;
      }
      if (filters.tradingType && record.tradingType !== filters.tradingType) {
        return false;
      }
      if (filters.entryType && record.entryType !== filters.entryType) {
        return false;
      }
      if (filters.isSystem && record.isSystem !== filters.isSystem) {
        return false;
      }
      return true;
    });

    // 再排序
    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [records, filters, sortConfig]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const paginatedRecords = useMemo(
    () => filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRecords, page]
  );
  // filter 变化时重置到第一页
  useEffect(() => { setPage(1); }, [filteredRecords.length]);

  // 获取所有可用的月份选项
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    records.forEach((record) => {
      if (record.openDate && record.openDate.length >= 6) {
        months.add(record.openDate.slice(0, 6));
      }
    });
    return Array.from(months).sort().map((month) => ({
      value: month,
      label: `${month.slice(0, 4)}-${month.slice(4, 6)}`,
    }));
  }, [records]);

  const handleOpenModal = (record?: TradingRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        openDate: record.openDate,
        stockName: record.stockName,
        stockCode: record.stockCode,
        tradingType: record.tradingType,
        entryType: record.entryType,
        isSystem: record.isSystem,
        hasMistake: record.hasMistake,
        profitPercent: record.profitPercent,
        holdDays: record.holdDays,
        images: record.images || [],
        imagePrefix: record.imagePrefix || '',
        subsequentProfitSpace: record.subsequentProfitSpace,
        preMarket: record.preMarket,
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

  // 剪切板粘贴图片
  const handleClipboardPaste = async () => {
    if (!imgDir.handle) {
      alert('请先在页面顶部选择图片存储目录');
      return;
    }
    if (!formData.openDate) {
      alert('请先填写开单时间');
      return;
    }
    try {
      let prefix = formData.imagePrefix || '';
      if (!editingRecord || !prefix) {
        const state = useRecordsStore.getState();
        const sameDateRecords = state.records
          .filter(r => r.openDate === formData.openDate && r.imagePrefix)
          .sort((a, b) => (a.imagePrefix || '').localeCompare(b.imagePrefix || ''));
        const seq = sameDateRecords.length;
        prefix = imgDir.generatePrefix(formData.openDate, seq);
      }
      const filenames = await imgDir.saveImagesFromClipboard(prefix);
      setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...filenames], imagePrefix: prefix }));
    } catch (e: any) {
      alert('粘贴失败: ' + e.message);
    }
  };

  // 清除已粘贴的图片
  const handleClearImages = () => {
    setFormData(prev => ({ ...prev, images: [], imagePrefix: '' }));
  };

  const handleSave = async () => {
    const errors = validateForm(formData, fieldConfig);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaveError(null);

    // 运行时确保 profitPercent 和 holdDays 不为 null
    if (formData.profitPercent === null || formData.holdDays === null) {
      setValidationErrors([{ field: 'profitPercent', message: '盈亏和持仓天数不能为空' }]);
      return;
    }

    const saveData = {
      ...formData,
      profitPercent: formData.profitPercent,
      holdDays: formData.holdDays,
      images: formData.images || [],
      imagePrefix: formData.imagePrefix || '',
      subsequentProfitSpace: formData.subsequentProfitSpace ?? null,
    };

    if (editingRecord) {
      updateRecord(editingRecord.id, saveData);
    } else {
      addRecord(saveData);
    }

    try {
      await saveNow();
      handleCloseModal();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
      // 保持弹窗打开，让用户看到错误后重试
    }
  };

  const handleDelete = (id: string) => {
    const record = records.find(r => r.id === id);
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(id);
      // 异步删除本地图片（不阻塞UI）
      if (record?.imagePrefix) {
        imgDir.deleteImages(record.imagePrefix).catch(() => {});
      }
    }
  };

  const resetFilters = () => {
    setFilters({
      month: '',
      tradingType: '',
      entryType: '',
      isSystem: '',
    });
  };

  const getFieldError = (field: string): string | undefined => {
    return validationErrors.find((e) => e.field === field)?.message;
  };

  const handleUpdateStats = async () => {
    if (records.length === 0) {
      setUpdateStatus('error');
      setUpdateMessage('没有数据需要处理');
      return;
    }

    setUpdateStatus('loading');
    setUpdateMessage('正在更新统计数据...');

    try {
      // 更新周期统计
      updateCycleStats();
      await saveNow();
      setUpdateStatus('success');
      setUpdateMessage('统计数据已更新');
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : '更新失败');
    }

    setTimeout(() => {
      setUpdateStatus('idle');
      setUpdateMessage('');
    }, 5000);
  };

  const handleAnalysisFieldChange = (field: keyof AnalysisResult, value: string) => {
    const parsedValue = value === 'N/A' ? 'N/A' : Number(value);
    updateCustomAnalysisField(field, parsedValue);
  };

  const handleOpenMonthlyModal = (item?: MonthlyAnalysis) => {
    if (item) {
      setEditingMonthly(item);
      setMonthlyFormData({ ...item });
    } else {
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '',
        systemProfitRatio: 'N/A',
        systemNoMistakeProfitRatio: 'N/A',
        systemWithMistakeProfitRatio: 'N/A',
        nonSystemProfitRatio: 'N/A',
        avgProfitRatio: 'N/A',
        totalProfit: 'N/A',
      });
    }
    setIsMonthlyModalOpen(true);
  };

  const handleCloseMonthlyModal = () => {
    setIsMonthlyModalOpen(false);
    setEditingMonthly(null);
    setMonthlyFormData({});
  };

  const handleSaveMonthly = () => {
    if (!monthlyFormData.month) {
      alert('请输入月份');
      return;
    }
    
    if (editingMonthly) {
      updateCustomMonthly(editingMonthly.month, monthlyFormData as MonthlyAnalysis);
    } else {
      addCustomMonthly(monthlyFormData as MonthlyAnalysis);
    }
    handleCloseMonthlyModal();
  };

  // 图片导入处理
  const handleImageImport = (data: ParsedTradeData) => {
    // 填充表单数据
    setFormData({
      ...emptyRecord,
      openDate: data.openDate,
      stockName: data.stockName,
      stockCode: data.stockCode,
      profitPercent: data.profitPercent,
      holdDays: data.holdDays,
    });
    setIsModalOpen(true); // 打开编辑表单
  };

  const handleDeleteMonthly = (month: string) => {
    if (confirm('确定要删除这个月份的数据吗？')) {
      deleteCustomMonthly(month);
    }
  };

  const syncFromComputed = () => {
    if (confirm('确定要把当前计算的数据同步到自定义数据吗？')) {
      setCustomAnalysis({ useCustom: true, data: computedAnalysis });
      setCustomMonthly({ useCustom: true, data: computedMonthly });
    }
  };

  const allMonthOptions = [
    { value: '', label: '全部月份' },
    ...monthOptions,
  ];

  const allTradingTypeOptions = [
    { value: '', label: '全部类型' },
    ...TRADING_TYPE_OPTIONS,
  ];

  const allYesNoOptions = [
    { value: '', label: '全部' },
    ...YES_NO_OPTIONS,
  ];

  const renderTable1 = () => {
    const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">表1 - 交易记录</h2>
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
            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </div>
            )}
            {/* 图片存储目录 */}
            <button
              onClick={() => imgDir.selectDirectory()}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${
                imgDir.handle ? 'border-green-300 text-green-700 bg-green-50' : 'border-orange-300 text-orange-700 bg-orange-50'
              }`}
              title={imgDir.handle ? `图片目录: ${imgDir.path}` : '选择图片存储目录'}
            >
              <FolderOpen className="h-4 w-4" />
              {imgDir.handle ? imgDir.path : '选择图片目录'}
            </button>
            <div className="flex items-center gap-2">
              {statsNeedUpdate && (
                <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  有数据需要更新
                </div>
              )}
              <Button 
                variant={statsNeedUpdate ? "primary" : "secondary"} 
                onClick={handleUpdateStats}
                disabled={updateStatus === 'loading' || records.length === 0}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${updateStatus === 'loading' ? 'animate-spin' : ''}`} />
                {statsNeedUpdate ? "更新统计数据" : "手动更新统计数据"}
              </Button>
            </div>
            <Button variant="secondary" onClick={() => setIsImageImportModalOpen(true)}>
              <Image className="mr-2 h-4 w-4" />
              从图片导入
            </Button>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="mr-2 h-4 w-4" />
              添加记录
            </Button>
          </div>
        </div>

        {updateStatus !== 'idle' && (
          <div className={`p-4 rounded-lg flex items-center gap-2 ${
            updateStatus === 'success' ? 'bg-green-50 text-green-800' : 
            updateStatus === 'error' ? 'bg-red-50 text-red-800' : 
            'bg-blue-50 text-blue-800'
          }`}>
            {updateStatus === 'success' && <CheckCircle className="h-5 w-5" />}
            {updateStatus === 'error' && <AlertCircle className="h-5 w-5" />}
            {updateStatus === 'loading' && <RefreshCw className="h-5 w-5 animate-spin" />}
            <span>{updateMessage}</span>
          </div>
        )}

        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-4 mb-4">
            <Filter className="h-5 w-5 text-gray-600" />
            <h3 className="font-medium text-gray-800">数据筛选</h3>
            {(filters.month || filters.tradingType || filters.entryType || filters.isSystem) && (
              <button
                onClick={resetFilters}
                className="ml-auto text-sm text-gray-600 hover:text-gray-800"
              >
                重置筛选
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                月份筛选
              </label>
              <Select
                value={filters.month}
                onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                options={allMonthOptions}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                交易类型
              </label>
              <Select
                value={filters.tradingType}
                onChange={(e) => setFilters({ ...filters, tradingType: e.target.value })}
                options={allTradingTypeOptions}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                交易切入类型
              </label>
              <Select
                value={filters.entryType || ''}
                onChange={(e) => setFilters({ ...filters, entryType: e.target.value })}
                options={[
                  { value: '', label: '全部' },
                  ...ENTRY_TYPE_OPTIONS,
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                系统符合
              </label>
              <Select
                value={filters.isSystem}
                onChange={(e) => setFilters({ ...filters, isSystem: e.target.value })}
                options={allYesNoOptions}
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            共 {filteredRecords.length} 条记录 (总计 {records.length} 条) · 第 {page}/{totalPages} 页
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div ref={containerRef} className="overflow-auto">
            <div style={zoomStyle}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('openDate')}
                    >
                      <div className="flex items-center gap-1">
                        开单时间
                        {sortConfig.key === 'openDate' && (
                          sortConfig.direction === 'asc' 
                            ? <ChevronUp className="h-4 w-4" /> 
                            : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票名称</th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('stockCode')}
                    >
                      <div className="flex items-center gap-1">
                        股票代码
                        {sortConfig.key === 'stockCode' && (
                          sortConfig.direction === 'asc' 
                            ? <ChevronUp className="h-4 w-4" /> 
                            : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易类型</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易切入类型</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">是否符合系统</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">有无大的失误</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏情况</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">持仓时间（天）</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">后续盈亏空间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">图片</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                        {records.length === 0 ? '暂无数据，请导入Excel或添加记录' : '无符合筛选条件的记录'}
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{record.openDate}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.stockName}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.stockCode}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.tradingType}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.entryType}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            record.isSystem === '是' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {record.isSystem}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            record.hasMistake === '是' ? 'bg-red-100 text-red-800' 
                            : record.hasMistake === '其他' ? 'bg-gray-100 text-gray-600'
                            : 'bg-green-100 text-green-800'
                          }`}>
                            {record.hasMistake}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm font-medium ${
                          record.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {record.profitPercent}%
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.holdDays}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {record.subsequentProfitSpace === null ? 'N/A' : `${record.subsequentProfitSpace}%`}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {record.images && record.images.length > 0
                            ? `${record.images.length} 张`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm space-x-2">
                          {record.images && record.images.length > 0 && (
                            <button
                              onClick={() => { setImagePreviewImages(record.images); setIsImagePreviewOpen(true); }}
                              className="text-blue-600 hover:text-blue-900"
                              title="查看图片"
                            >
                              <Eye className="h-4 w-4 inline" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenModal(record)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} pageSize={PAGE_SIZE} total={filteredRecords.length} />
        </div>
      </div>
    );
  };

  const renderTable2 = () => {
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
              <Toggle
                checked={customAnalysis.useCustom}
                onChange={toggleUseCustomAnalysis}
              />
            </div>
            <Button variant="secondary" onClick={syncFromComputed}>
              从计算同步
            </Button>
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                {customAnalysis.useCustom ? '当前使用自定义数据' : '当前使用自动计算数据'}
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                {customAnalysis.useCustom 
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
                  {customAnalysis.useCustom ? (
                    <Input
                      type="text"
                      value={customAnalysis.data[key] === 'N/A' ? 'N/A' : String(customAnalysis.data[key])}
                      onChange={(e) => handleAnalysisFieldChange(key, e.target.value)}
                      placeholder="输入数值或 N/A"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                      {computedAnalysis[key] === 'N/A' ? 'N/A' : String(computedAnalysis[key])}
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

  const renderTable3 = () => {
    const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">月度盈亏比统计</h2>
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
              <Toggle
                checked={customMonthly.useCustom}
                onChange={toggleUseCustomMonthly}
              />
            </div>
            <Button variant="secondary" onClick={syncFromComputed}>
              从计算同步
            </Button>
            {customMonthly.useCustom && (
              <Button onClick={() => handleOpenMonthlyModal()}>
                <Plus className="mr-2 h-4 w-4" />
                添加月份
              </Button>
            )}
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                {customMonthly.useCustom ? '当前使用自定义数据' : '当前使用自动计算数据'}
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                {customMonthly.useCustom 
                  ? '你可以在下方添加、编辑月份数据，这些数据会被保存和导出' 
                  : '数据会根据表1自动计算，切换到自定义模式后可以编辑'}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div ref={containerRef} className="overflow-auto">
            <div style={zoomStyle}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">月份</th>
                    {MONTHLY_FIELDS.map(({ label }) => (
                      <th key={label} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {label}
                      </th>
                    ))}
                    {customMonthly.useCustom && (
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(customMonthly.useCustom ? customMonthly.data : computedMonthly).length === 0 ? (
                    <tr>
                      <td colSpan={MONTHLY_FIELDS.length + 2} className="px-4 py-8 text-center text-gray-500">
                        暂无月度数据
                      </td>
                    </tr>
                  ) : (
                    (customMonthly.useCustom ? customMonthly.data : computedMonthly).map((item) => (
                      <tr key={item.month} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.month}</td>
                        {MONTHLY_FIELDS.map(({ key }) => (
                          <td key={key} className="px-3 py-3 text-sm text-gray-700">
                            {item[key] === 'N/A' ? 'N/A' : String(item[key])}
                          </td>
                        ))}
                        {customMonthly.useCustom && (
                          <td className="px-3 py-3 text-sm space-x-2">
                            <button
                              onClick={() => handleOpenMonthlyModal(item)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteMonthly(item.month)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTable4 = () => {
    const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();
    
    // 将所有统计类型的周期数据展平
    const allStats: any[] = [];
    for (const [statType, cycles] of Object.entries(cycleStats)) {
      for (const cycle of cycles || []) {
        allStats.push({ ...cycle, statType });
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">周期盈亏比统计</h2>
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
            <div className="text-sm text-gray-600">
              共 {allStats.length} 个周期
            </div>
          </div>
        </div>

        {allStats.length === 0 ? (
          <div className="bg-gray-50 p-8 text-center rounded-lg border border-gray-200">
            <p className="text-gray-500">暂无周期统计数据</p>
            <p className="text-sm text-gray-400 mt-2">点击「手动更新统计数据」按钮生成周期盈亏比统计</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div ref={containerRef} className="overflow-auto">
              <div style={zoomStyle}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">统计类型</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">开始日期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">结束日期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">记录数</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">完整周期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈利总和</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">亏损绝对值总和</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏比</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allStats.map((stat, index) => (
                      <tr key={`${stat.statType}-${index}`} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-medium text-gray-900">{stat.statType}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.startDate}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.endDate}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.recordCount}</td>
                        <td className="px-3 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            stat.isComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {stat.isComplete ? '是' : '否'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.profitSum}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.lossSum}</td>
                        <td className={`px-3 py-3 text-sm font-medium ${
                          (stat.profitRatio ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stat.profitRatio ?? 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('table1')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table1'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Table2 className="h-4 w-4" />
            表1 - 交易记录
          </button>
          <button
            onClick={() => setActiveTab('table2')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table2'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            总数据统计
          </button>
          <button
            onClick={() => setActiveTab('table3')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table3'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar className="h-4 w-4" />
            月度盈亏比统计
          </button>
          <button
            onClick={() => setActiveTab('table4')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table4'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            周期盈亏比统计
          </button>
        </nav>
      </div>

      {activeTab === 'table1' && renderTable1()}
      {activeTab === 'table2' && renderTable2()}
      {activeTab === 'table3' && renderTable3()}
      {activeTab === 'table4' && renderTable4()}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingRecord ? '编辑记录' : '添加记录'} size="2xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                开单时间 (yyyymmdd) <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.openDate}
                onChange={(e) => setFormData({ ...formData, openDate: e.target.value })}
                placeholder="例如: 20250101"
                error={getFieldError('openDate')}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                股票名称 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockName}
                onChange={(e) => setFormData({ ...formData, stockName: e.target.value })}
                placeholder="例如: 贵州茅台"
                error={getFieldError('stockName')}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                股票代码 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockCode}
                onChange={(e) => setFormData({ ...formData, stockCode: e.target.value })}
                placeholder="例如: 600519"
                error={getFieldError('stockCode')}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                交易类型
              </label>
              <Select
                value={formData.tradingType}
                onChange={(e) => setFormData({ ...formData, tradingType: e.target.value as TradingType })}
                options={TRADING_TYPE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                交易切入类型
              </label>
              <Select
                value={formData.entryType}
                onChange={(e) => setFormData({ ...formData, entryType: e.target.value as EntryType })}
                options={ENTRY_TYPE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                符合系统
              </label>
              <Select
                value={formData.isSystem}
                onChange={(e) => {
                  const newIsSystem = e.target.value as '是' | '否';
                  setFormData({
                    ...formData,
                    isSystem: newIsSystem,
                    tradingType: newIsSystem === '否' ? '非系统' : formData.tradingType,
                    hasMistake: newIsSystem === '否' ? '其他' : formData.hasMistake,
                  });
                }}
                options={YES_NO_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                有失误
              </label>
              <Select
                value={formData.hasMistake}
                onChange={(e) => setFormData({ ...formData, hasMistake: e.target.value as MistakeStatus })}
                options={HAS_MISTAKE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                盈亏% <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.1"
                value={formData.profitPercent !== null ? formData.profitPercent : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') {
                    setFormData({ ...formData, profitPercent: null });
                    return;
                  }
                  const num = parseFloat(raw);
                  if (isNaN(num)) return; // 忽略非数中间态
                  setFormData({ ...formData, profitPercent: num });
                }}
                placeholder="例如: 16.1 或 -15.3"
                error={getFieldError('profitPercent')}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                持仓天数 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={formData.holdDays !== null ? formData.holdDays : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') {
                    setFormData({ ...formData, holdDays: null });
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (isNaN(num)) return;
                  setFormData({ ...formData, holdDays: num });
                }}
                placeholder="例如: 3"
                error={getFieldError('holdDays')}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                后续盈亏空间
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.subsequentProfitSpace === null ? 'N/A' : 'number'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, subsequentProfitSpace: val === 'N/A' ? null : 0 });
                  }}
                  className="w-24 rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm"
                >
                  <option value="N/A">N/A</option>
                  <option value="number">数值</option>
                </select>
                {formData.subsequentProfitSpace !== null && formData.subsequentProfitSpace !== undefined && (
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.subsequentProfitSpace}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        setFormData({ ...formData, subsequentProfitSpace: null });
                        return;
                      }
                      const num = parseFloat(raw);
                      if (isNaN(num)) return;
                      setFormData({ ...formData, subsequentProfitSpace: parseFloat(num.toFixed(2)) });
                    }}
                    placeholder="例如: 5.2"
                    error={getFieldError('subsequentProfitSpace')}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                盘前是否
              </label>
              <Select
                value={formData.preMarket}
                onChange={(e) => setFormData({ ...formData, preMarket: e.target.value as '是' | '否' })}
                options={YES_NO_OPTIONS}
              />
            </div>
          </div>

          {/* 图片粘贴区域 */}
          <div className="border-t pt-4">
            <label className="block text-base font-medium text-gray-700 mb-2">
              交易截图 <span className="text-xs text-gray-400">(从剪切板粘贴)</span>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleClipboardPaste} disabled={!imgDir.handle}>
                <Clipboard className="mr-1.5 h-4 w-4" />
                从剪切板粘贴
              </Button>
              {formData.images && formData.images.length > 0 && (
                <>
                  <span className="text-sm text-gray-500">
                    已粘贴 {formData.images.length} 张
                    {formData.imagePrefix && <> · 前缀: {formData.imagePrefix}</>}
                  </span>
                  <button onClick={handleClearImages} className="text-xs text-red-500 hover:text-red-700">
                    清除
                  </button>
                </>
              )}
              {formData.images && formData.images.length > 0 && (
                <button
                  onClick={() => { setImagePreviewImages(formData.images!); setIsImagePreviewOpen(true); }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  预览
                </button>
              )}
            </div>
            {!imgDir.handle && (
              <p className="text-xs text-orange-600 mt-1">请先在页面顶部选择图片存储目录</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-5 border-t">
          {saveError && (
            <div className="flex-1 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{saveError}</span>
            </div>
          )}
          <Button variant="secondary" onClick={handleCloseModal} disabled={isSaving} size="lg">
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size="lg">
            {isSaving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isMonthlyModalOpen} onClose={handleCloseMonthlyModal} title={editingMonthly ? '编辑月份数据' : '添加月份数据'} size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-base font-medium text-gray-700 mb-2">
              月份 (yyyymm) <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={monthlyFormData.month || ''}
              onChange={(e) => setMonthlyFormData({ ...monthlyFormData, month: e.target.value })}
              placeholder="例如: 202501"
              disabled={!!editingMonthly}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MONTHLY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-base font-medium text-gray-700 mb-2">{label}</label>
                <Input
                  type="text"
                  value={(monthlyFormData[key] as string | number) === 'N/A' ? 'N/A' : String(monthlyFormData[key] || '')}
                  onChange={(e) => setMonthlyFormData({ 
                    ...monthlyFormData, 
                    [key]: e.target.value === 'N/A' ? 'N/A' : Number(e.target.value) 
                  })}
                  placeholder="输入数值或 N/A"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="secondary" onClick={handleCloseMonthlyModal}>
            取消
          </Button>
          <Button onClick={handleSaveMonthly}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </Modal>

      {/* 导入模态框 */}
      <ImportModal
        isOpen={isImageImportModalOpen}
        onClose={() => setIsImageImportModalOpen(false)}
        onImport={handleImageImport}
      />

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        images={imagePreviewImages}
        isOpen={isImagePreviewOpen}
        onClose={() => { setIsImagePreviewOpen(false); setImagePreviewImages([]); }}
      />
    </div>
  );
};

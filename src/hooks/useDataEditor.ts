import { useMemo, useState } from 'react';
import { useRecordsStore, type RecordQuery } from '@/stores/recordsStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { useUIStore } from '@/stores/uiStore';
import { useImageDirectory } from '@/hooks/useImageDirectory';
import { refreshStats, scheduleSaveNow } from '@/hooks/useStoreSync';
import { useAnalysisResult, useMonthlyAnalysis, useHasServerStats } from '@/hooks/useAnalysis';
import { r2StorageService } from '@/services/r2Service';
import type { TradingRecord, TradingRecordInput, AnalysisResult, MonthlyAnalysis, ParsedTradeData, FieldConfig } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';
import { validateTradingRecord } from '@/utils/validationUtils';
import { materializeTheoreticalRatios, prepareTheoreticalForm } from '@/utils/theoreticalRatio';

export type ValidationError = { field: string; message: string };

const emptyRecord: TradingRecordInput = {
  openDate: getDefaultOpenDate(),
  stockName: '',
  stockCode: '',
  tradingType: '齐飞水底',
  trendFeatures: ['未知'],
  patternFeatures: ['系统'],
  hasMistake: '否',
  profitPercent: null,
  holdDays: null,
  positionSize: 33,
  images: [],
  imagePrefix: '',
  preMarket: '否',
  remark: '',
  theoreticalProfitRatios: {},
  theoreticalProfitDeltas: {},
};

function validateForm(data: TradingRecordInput, fieldConfig: FieldConfig): ValidationError[] {
  const result = validateTradingRecord(data as Partial<TradingRecord>, undefined, fieldConfig);
  return result.errors.map(err => ({ field: err.field, message: err.message }));
}

/**
 * 数据编辑页的数据与编辑逻辑聚合 Hook。
 * 组件只负责渲染与视图态（页签/筛选/分页），编辑与同步逻辑集中在此。
 */
export function useDataEditor() {
  // ---- stores ----
  const recordCache = useRecordsStore(s => s.records);
  const recordPage = useRecordsStore(s => s.recordPage);
  const recordQuery = useRecordsStore(s => s.recordQuery);
  const loadRecordPage = useRecordsStore(s => s.loadRecordPage);
  const setRecordPageSize = useRecordsStore(s => s.setRecordPageSize);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
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
  const hasServerStats = useHasServerStats();

  const imageDir = useImageDirectory();

  // 表格只渲染当前页（按服务端返回的 id 顺序从缓存取行）
  const records = useMemo(() => {
    const map = new Map(recordCache.map(r => [r.id, r]));
    return recordPage.ids
      .map(id => map.get(id))
      .filter((r): r is TradingRecord => !!r);
  }, [recordCache, recordPage.ids]);

  // ---- 记录编辑 ----
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openRecordModal = (record?: TradingRecord) => {
    if (record) {
      setEditingRecord(record);
      const theoretical = prepareTheoreticalForm(record, fieldConfig.theoreticalDimensions);
      setFormData({
        openDate: record.openDate, stockName: record.stockName, stockCode: record.stockCode,
        tradingType: record.tradingType, trendFeatures: record.trendFeatures, patternFeatures: record.patternFeatures,
        hasMistake: record.hasMistake, profitPercent: record.profitPercent, holdDays: record.holdDays,
        positionSize: record.positionSize ?? 33,
        images: record.images || [], imagePrefix: record.imagePrefix || '',
        preMarket: record.preMarket,
        remark: record.remark,
        theoreticalProfitRatios: theoretical.theoreticalProfitRatios,
        theoreticalProfitDeltas: theoretical.theoreticalProfitDeltas,
      });
    } else {
      setEditingRecord(null);
      setFormData({ ...emptyRecord, openDate: getDefaultOpenDate() });
    }
    setValidationErrors([]);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const closeRecordModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData(emptyRecord);
    setValidationErrors([]);
  };

  const pasteImagesFromClipboard = async () => {
    if (!imageDir.handle) { alert('请先在页面顶部选择图片存储目录'); return; }
    if (!formData.openDate) { alert('请先填写开单时间'); return; }
    try {
      let prefix = formData.imagePrefix || '';
      if (!editingRecord || !prefix) {
        // 分页后本地只持有已加载的行，序号改用「该开单日服务端记录数」推算，避免图片前缀撞车
        const day = formData.openDate;
        const page = currentDatasetId
          ? await r2StorageService.getRecords(currentDatasetId, { fromDay: day, toDay: day, limit: 1 })
          : null;
        const used = typeof page?.total === 'number'
          ? page.total
          : records.filter(r => r.openDate === day).length;
        prefix = imageDir.generatePrefix(day, used);
      }
      const filenames = await imageDir.saveImagesFromClipboard(prefix, (formData.images || []).length, formData.openDate);
      setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...filenames], imagePrefix: prefix }));
    } catch (e) { alert('粘贴失败: ' + (e instanceof Error ? e.message : String(e))); }
  };

  const clearImages = () => setFormData(prev => ({ ...prev, images: [], imagePrefix: '' }));

  const saveRecord = async () => {
    const errors = validateForm(formData, fieldConfig);
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setSaveError(null);
    if (formData.profitPercent === null || formData.holdDays === null) {
      setValidationErrors([{ field: 'profitPercent', message: '盈亏和持仓天数不能为空' }]);
      return;
    }
    const baseData = {
      ...formData, profitPercent: formData.profitPercent, holdDays: formData.holdDays,
      positionSize: formData.positionSize ?? 33,
      images: formData.images || [], imagePrefix: formData.imagePrefix || '',
      remark: formData.remark ?? '',
      theoreticalProfitRatios: formData.theoreticalProfitRatios ?? {},
      theoreticalProfitDeltas: formData.theoreticalProfitDeltas ?? {},
    };
    // 材料化：关联维度最终值 = 基准实际值 + 变化率（同时保留变化率）
    const { theoreticalProfitRatios, theoreticalProfitDeltas } = materializeTheoreticalRatios(
      baseData,
      fieldConfig.theoreticalDimensions,
    );
    const saveData = { ...baseData, theoreticalProfitRatios, theoreticalProfitDeltas };
    if (editingRecord) updateRecord(editingRecord.id, saveData);
    else addRecord(saveData);
    // 乐观关闭弹窗，后台合并落盘；失败由全局错误提示暴露
    closeRecordModal();
    scheduleSaveNow();
  };

  const deleteRecordWithImages = (id: string) => {
    const record = recordCache.find(r => r.id === id);
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(id);
      if (record?.imagePrefix) imageDir.deleteImages(record.imagePrefix).catch(() => {});
      scheduleSaveNow();
    }
  };

  const importRecordFromParsed = (data: ParsedTradeData) => {
    setFormData({ ...emptyRecord, openDate: data.openDate, stockName: data.stockName,
      stockCode: data.stockCode, profitPercent: data.profitPercent, holdDays: data.holdDays });
    setIsModalOpen(true);
  };

  // ---- 统计更新 ----
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');

  const refreshCycleStats = async () => {
    // 用数据集全量判断，避免“筛选后当前页为空”被误判成没有数据
    if (recordPage.datasetTotal === 0 && !recordPage.loading) {
      setUpdateStatus('error'); setUpdateMessage('没有数据需要处理'); return;
    }
    setUpdateStatus('loading'); setUpdateMessage('正在更新统计数据...');
    try {
      // 总览 / 月度 / 维度 / 页签 / 压测 / 周期统计全部由服务端 SQL 重算
      const result = await refreshStats();
      if (!result.ok) throw new Error(result.error || '统计数据更新失败');
      setUpdateStatus('success'); setUpdateMessage('统计数据已更新');
    }
    catch (error) { setUpdateStatus('error'); setUpdateMessage(error instanceof Error ? error.message : '更新失败'); }
    setTimeout(() => { setUpdateStatus('idle'); setUpdateMessage(''); }, 5000);
  };

  // ---- 分析数据编辑 ----
  const changeAnalysisField = (field: keyof AnalysisResult, value: string) => {
    updateCustomAnalysisField(field, value === 'N/A' ? 'N/A' : Number(value));
  };

  const changeTheoreticalField = (dimensionId: string, value: string) => {
    setCustomAnalysis({
      ...customAnalysis,
      data: {
        ...customAnalysis.data,
        theoreticalProfitRatios: {
          ...(customAnalysis.data.theoreticalProfitRatios || {}),
          [dimensionId]: value === 'N/A' ? 'N/A' : Number(value),
        },
      },
    });
  };

  const syncFromComputed = () => {
    if (confirm('确定要把当前计算的数据同步到自定义数据吗？')) {
      setCustomAnalysis({ useCustom: true, data: computedAnalysis });
      setCustomMonthly({ useCustom: true, data: computedMonthly });
    }
  };

  // ---- 月度数据编辑 ----
  const [editingMonthly, setEditingMonthly] = useState<MonthlyAnalysis | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [monthlyFormData, setMonthlyFormData] = useState<Partial<MonthlyAnalysis>>({});

  const openMonthlyModal = (item?: MonthlyAnalysis) => {
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

  const closeMonthlyModal = () => { setIsMonthlyModalOpen(false); setEditingMonthly(null); setMonthlyFormData({}); };

  const saveMonthly = () => {
    if (!monthlyFormData.month) { alert('请输入月份'); return; }
    if (editingMonthly) updateCustomMonthly(editingMonthly.month, monthlyFormData as MonthlyAnalysis);
    else addCustomMonthly(monthlyFormData as MonthlyAnalysis);
    closeMonthlyModal();
  };

  const deleteMonthly = (month: string) => {
    if (confirm('确定要删除这个月份的数据吗？')) deleteCustomMonthly(month);
  };

  // ---- 服务端分页：筛选/排序/页码全部下推，前端只持有当前页 ----
  const pageSize = recordPage.pageSize || 50;
  const totalPages = Math.max(1, Math.ceil(recordPage.total / pageSize));
  const page = Math.floor(recordPage.offset / pageSize) + 1;

  const applyRecordQuery = (query: Partial<RecordQuery>) => {
    if (!currentDatasetId) return;
    void loadRecordPage(currentDatasetId, query);
  };

  const goToRecordPage = (target: number) => {
    if (!currentDatasetId) return;
    const next = Math.min(Math.max(1, Math.trunc(target)), totalPages);
    if (next === page) return;
    void loadRecordPage(currentDatasetId, { offset: (next - 1) * pageSize });
  };

  const reloadCurrentPage = () => {
    if (!currentDatasetId) return;
    void loadRecordPage(currentDatasetId, { offset: recordPage.offset });
  };

  return {
    // 共享数据
    records, cycleStats, fieldConfig, statsNeedUpdate, isSaving, imageDir,
    // 分页：当前页行 + 服务端总数/页码；查询条件以 store 为唯一真相源
    recordPaging: {
      total: recordPage.total,
      datasetTotal: recordPage.datasetTotal,
      months: recordPage.months,
      query: recordQuery,
      page,
      pageSize,
      totalPages,
      loading: recordPage.loading,
      error: recordPage.error,
      applyQuery: applyRecordQuery,
      goToPage: goToRecordPage,
      setPageSize: setRecordPageSize,
      reload: reloadCurrentPage,
    },
    // 记录编辑
    recordEditor: {
      isModalOpen, editingRecord, formData, validationErrors, saveError,
      setFormData, openRecordModal, closeRecordModal, saveRecord, deleteRecord: deleteRecordWithImages,
      pasteImagesFromClipboard, clearImages, importRecordFromParsed,
    },
    // 统计更新
    stats: { updateStatus, updateMessage, refreshCycleStats, hasServerStats },
    // 分析数据编辑
    analysis: {
      useCustom: customAnalysis.useCustom, customData: customAnalysis.data, computedData: computedAnalysis,
      toggleUseCustom: toggleUseCustomAnalysis, changeAnalysisField, changeTheoreticalField, syncFromComputed,
    },
    // 月度数据编辑
    monthly: {
      useCustom: customMonthly.useCustom, customData: customMonthly.data, computedData: computedMonthly,
      toggleUseCustom: toggleUseCustomMonthly, syncFromComputed,
      isModalOpen: isMonthlyModalOpen, editingMonthly, formData: monthlyFormData, setFormData: setMonthlyFormData,
      openMonthlyModal, closeMonthlyModal, saveMonthly, deleteMonthly,
    },
  };
}

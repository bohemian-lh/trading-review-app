import { useState } from 'react';
import { useRecordsStore } from '@/stores/recordsStore';
import { useUIStore } from '@/stores/uiStore';
import { useImageDirectory } from '@/hooks/useImageDirectory';
import { saveNow, updateCycleStats } from '@/hooks/useStoreSync';
import { useAnalysisResult, useMonthlyAnalysis } from '@/hooks/useAnalysis';
import type { TradingRecord, TradingRecordInput, AnalysisResult, MonthlyAnalysis, ParsedTradeData, FieldConfig } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';
import { validateTradingRecord } from '@/utils/validationUtils';

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

  const imageDir = useImageDirectory();

  // ---- 记录编辑 ----
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openRecordModal = (record?: TradingRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        openDate: record.openDate, stockName: record.stockName, stockCode: record.stockCode,
        tradingType: record.tradingType, trendFeatures: record.trendFeatures, patternFeatures: record.patternFeatures,
        hasMistake: record.hasMistake, profitPercent: record.profitPercent, holdDays: record.holdDays,
        positionSize: record.positionSize ?? 33,
        images: record.images || [], imagePrefix: record.imagePrefix || '',
        preMarket: record.preMarket,
        remark: record.remark, theoreticalProfitRatios: record.theoreticalProfitRatios ?? {},
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
        const state = useRecordsStore.getState();
        const sameDateRecords = state.records
          .filter(r => r.openDate === formData.openDate && r.imagePrefix)
          .sort((a, b) => (a.imagePrefix || '').localeCompare(b.imagePrefix || ''));
        prefix = imageDir.generatePrefix(formData.openDate, sameDateRecords.length);
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
    const saveData = {
      ...formData, profitPercent: formData.profitPercent, holdDays: formData.holdDays,
      positionSize: formData.positionSize ?? 33,
      images: formData.images || [], imagePrefix: formData.imagePrefix || '',
      remark: formData.remark ?? '',
      theoreticalProfitRatios: formData.theoreticalProfitRatios ?? {},
    };
    if (editingRecord) updateRecord(editingRecord.id, saveData);
    else addRecord(saveData);
    try { await saveNow(); closeRecordModal(); } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    }
  };

  const deleteRecordWithImages = (id: string) => {
    const record = records.find(r => r.id === id);
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(id);
      if (record?.imagePrefix) imageDir.deleteImages(record.imagePrefix).catch(() => {});
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
    if (records.length === 0) { setUpdateStatus('error'); setUpdateMessage('没有数据需要处理'); return; }
    setUpdateStatus('loading'); setUpdateMessage('正在更新统计数据...');
    try { updateCycleStats(); await saveNow(); setUpdateStatus('success'); setUpdateMessage('统计数据已更新'); }
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

  return {
    // 共享数据
    records, cycleStats, fieldConfig, statsNeedUpdate, isSaving, imageDir,
    // 记录编辑
    recordEditor: {
      isModalOpen, editingRecord, formData, validationErrors, saveError,
      setFormData, openRecordModal, closeRecordModal, saveRecord, deleteRecord: deleteRecordWithImages,
      pasteImagesFromClipboard, clearImages, importRecordFromParsed,
    },
    // 统计更新
    stats: { updateStatus, updateMessage, refreshCycleStats },
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

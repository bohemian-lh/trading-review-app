import { create } from 'zustand';
import { useMemo } from 'react';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, CustomAnalysisData, CustomMonthlyData, CycleStats, FieldConfig } from '@/types';
import { DEFAULT_FIELD_CONFIG } from '@/types';
import { calculateProfitRatio, calculateAvgProfitRatio, calculateTotalProfit, calculateAverageHoldDays, calculateTradingTypeRatios, calculateEntryTypeRatios, calculateAggregateRatios } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';
import { generateId } from '@/utils';
import { r2StorageService } from '@/services/r2Service';
import { generateCycleStats, buildStatTypes, recalculateSingleCycle, removeRecordFromCycle } from '@/services/cycleStatsService';

interface DataState {
  records: TradingRecord[];
  isLoading: boolean;
  isSaving: boolean;
  isInitialized: boolean;
  error: string | null;
  currentFileName: string | null;
  version: number | null;
  fieldConfig: FieldConfig;
  customAnalysis: CustomAnalysisData;
  customMonthly: CustomMonthlyData;
  cycleStats: Record<string, CycleStats[]>;
  cycleStatsGeneratedAt: number | null;
  statsNeedUpdate: boolean;

  setRecords: (records: TradingRecord[]) => void;
  addRecord: (record: Omit<TradingRecord, 'id' | 'hasCycleStats' | 'hasMonthlyStats'>) => void;
  addRecords: (records: TradingRecord[]) => void;
  updateRecord: (id: string, updates: Partial<TradingRecord>) => void;
  deleteRecord: (id: string) => void;
  clearRecords: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentFileName: (filename: string | null) => void;
  setCustomAnalysis: (data: CustomAnalysisData) => void;
  updateCustomAnalysisField: (field: keyof AnalysisResult, value: number | 'N/A') => void;
  toggleUseCustomAnalysis: () => void;
  setCustomMonthly: (data: CustomMonthlyData) => void;
  addCustomMonthly: (item: MonthlyAnalysis) => void;
  updateCustomMonthly: (month: string, updates: Partial<MonthlyAnalysis>) => void;
  deleteCustomMonthly: (month: string) => void;
  toggleUseCustomMonthly: () => void;
  updateCycleStats: () => void;
  saveFieldConfig: (config: FieldConfig) => Promise<void>;
  loadFromR2: () => Promise<void>;
  saveToR2: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => {
  let debouncedSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingSave = () => {
    if (debouncedSaveTimer) { clearTimeout(debouncedSaveTimer); debouncedSaveTimer = null; }
  };

  const scheduleDebouncedSave = () => {
    cancelPendingSave();
    debouncedSaveTimer = setTimeout(() => { debouncedSaveTimer = null; get().saveToR2(); }, 1000);
  };

  const emptyAnalysis: AnalysisResult = {
    systemProfitRatio: 'N/A', systemNoMistakeProfitRatio: 'N/A', systemWithMistakeProfitRatio: 'N/A',
    nonSystemProfitRatio: 'N/A', systemProfitAvgHoldDays: 'N/A', systemLossAvgHoldDays: 'N/A',
    nonSystemProfitAvgHoldDays: 'N/A', nonSystemLossAvgHoldDays: 'N/A',
    tradingTypeRatios: {}, entryTypeRatios: {}, aggregateRatios: {},
  };

  const emptyCycleStats: Record<string, CycleStats[]> = {};
  const defaultConfig: FieldConfig = { ...DEFAULT_FIELD_CONFIG };

  return {
    records: [], isLoading: false, isSaving: false, isInitialized: false,
    error: null, currentFileName: null, version: null,
    fieldConfig: defaultConfig,
    customAnalysis: { useCustom: false, data: { ...emptyAnalysis } },
    customMonthly: { useCustom: false, data: [] },
    cycleStats: emptyCycleStats, cycleStatsGeneratedAt: null, statsNeedUpdate: false,

    setRecords: (records) => {
      const normalized = records.map(r => ({ ...r, hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
      set({ records: normalized, error: null });
      scheduleDebouncedSave();
    },

    addRecord: (recordData) => {
      const newRecord: TradingRecord = { ...recordData, id: generateId(), hasCycleStats: false, hasMonthlyStats: false };
      set((s) => ({ records: [...s.records, newRecord] }));
      scheduleDebouncedSave();
    },

    addRecords: (recordsData) => {
      const newRecords: TradingRecord[] = recordsData.map(r => ({ ...r, id: r.id || generateId(), hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
      set((s) => ({ records: [...s.records, ...newRecords], statsNeedUpdate: true }));
      scheduleDebouncedSave();
    },

    updateRecord: (id, updates) => {
      const state = get();
      const oldRecord = state.records.find(r => r.id === id);
      if (!oldRecord) return;

      const valueFields = ['profitPercent', 'holdDays'];
      const typeFields = ['tradingType', 'isSystem', 'hasMistake', 'openDate', 'entryType'];
      const hasValueChange = valueFields.some(k => (updates as any)[k] !== undefined);
      const hasTypeChange = typeFields.some(k => (updates as any)[k] !== undefined);

      let newRecord: TradingRecord = { ...oldRecord, ...updates };
      let newCycleStats = { ...state.cycleStats };
      let needsUpdateFlag = false;
      const statTypes = buildStatTypes(state.fieldConfig);

      if (hasValueChange && !hasTypeChange && oldRecord.hasCycleStats) {
        for (const statType of statTypes) {
          const cycles = newCycleStats[statType] || [];
          for (let i = 0; i < cycles.length; i++) {
            if (cycles[i].recordIds.includes(id)) {
              newCycleStats[statType][i] = recalculateSingleCycle(cycles[i], [newRecord, ...state.records.filter(r => r.id !== id)]);
            }
          }
        }
      } else if (hasTypeChange && oldRecord.hasCycleStats) {
        for (const statType of statTypes) {
          const cycles = newCycleStats[statType] || [];
          newCycleStats[statType] = [];
          for (const cycle of cycles) {
            if (cycle.recordIds.includes(id)) {
              const updated = removeRecordFromCycle(cycle, id);
              if (updated) newCycleStats[statType].push(updated);
            } else {
              newCycleStats[statType].push(cycle);
            }
          }
        }
        newRecord = { ...newRecord, hasCycleStats: false, cycleId: undefined };
        needsUpdateFlag = true;
      } else if (hasTypeChange) {
        needsUpdateFlag = true;
      }

      set({
        records: state.records.map(r => r.id === id ? newRecord : r),
        cycleStats: newCycleStats,
        statsNeedUpdate: needsUpdateFlag,
      });
      scheduleDebouncedSave();
    },

    deleteRecord: (id) => {
      const state = get();
      let newCycleStats = { ...state.cycleStats };
      let needsUpdateFlag = false;
      const statTypes = buildStatTypes(state.fieldConfig);

      for (const statType of statTypes) {
        const cycles = newCycleStats[statType] || [];
        newCycleStats[statType] = [];
        for (const cycle of cycles) {
          if (cycle.recordIds.includes(id)) {
            const updated = removeRecordFromCycle(cycle, id);
            if (updated) newCycleStats[statType].push(updated);
            needsUpdateFlag = true;
          } else {
            newCycleStats[statType].push(cycle);
          }
        }
      }

      set((s) => ({ records: s.records.filter(r => r.id !== id), cycleStats: newCycleStats, statsNeedUpdate: needsUpdateFlag }));
      scheduleDebouncedSave();
    },

    clearRecords: () => { set({ records: [], currentFileName: null, error: null }); scheduleDebouncedSave(); },
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    setCurrentFileName: (filename) => set({ currentFileName: filename }),

    setCustomAnalysis: (data) => { set({ customAnalysis: data }); scheduleDebouncedSave(); },
    updateCustomAnalysisField: (field, value) => {
      set((s) => ({ customAnalysis: { ...s.customAnalysis, data: { ...s.customAnalysis.data, [field]: value } } }));
      scheduleDebouncedSave();
    },
    toggleUseCustomAnalysis: () => {
      set((s) => ({ customAnalysis: { ...s.customAnalysis, useCustom: !s.customAnalysis.useCustom } }));
      scheduleDebouncedSave();
    },

    setCustomMonthly: (data) => { set({ customMonthly: data }); scheduleDebouncedSave(); },
    addCustomMonthly: (item) => {
      set((s) => ({ customMonthly: { ...s.customMonthly, data: [...s.customMonthly.data, item] } }));
      scheduleDebouncedSave();
    },
    updateCustomMonthly: (month, updates) => {
      set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.map(i => i.month === month ? { ...i, ...updates } : i) } }));
      scheduleDebouncedSave();
    },
    deleteCustomMonthly: (month) => {
      set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.filter(i => i.month !== month) } }));
      scheduleDebouncedSave();
    },
    toggleUseCustomMonthly: () => {
      set((s) => ({ customMonthly: { ...s.customMonthly, useCustom: !s.customMonthly.useCustom } }));
      scheduleDebouncedSave();
    },

    updateCycleStats: () => {
      const state = get();
      const cleanRecords = state.records.map(r => ({ ...r, hasCycleStats: false, cycleId: undefined }));
      const { result, updatedRecords } = generateCycleStats(cleanRecords, state.fieldConfig, state.cycleStats);
      set({ records: updatedRecords, cycleStats: result.stats, cycleStatsGeneratedAt: result.generatedAt, statsNeedUpdate: false });
    },

    saveFieldConfig: async (config) => {
      set({ fieldConfig: config, statsNeedUpdate: true });
      await r2StorageService.saveConfig(config);
    },

    loadFromR2: async () => {
      set({ isLoading: true, error: null });
      try {
        const result = await r2StorageService.getRecords() as any;
        // 并行加载配置
        const configResult = await r2StorageService.getConfig();
        const fieldConfig = (configResult.success && configResult.config?.tradingTypes) 
          ? configResult.config 
          : defaultConfig;
        if (result.success) {
          const normalizedRecords = (result.records || []).map((r: any) => ({ ...r, hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
          set({
            records: normalizedRecords,
            fieldConfig,
            customAnalysis: result.customAnalysis || { useCustom: false, data: { ...emptyAnalysis } },
            customMonthly: result.customMonthly || { useCustom: false, data: [] },
            cycleStats: result.cycleStats || emptyCycleStats,
            cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
            version: result.version || null,
            isInitialized: true,
          });
        } else { set({ isInitialized: true, fieldConfig }); }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Load failed', isInitialized: true });
      } finally { set({ isLoading: false }); }
    },

    saveToR2: async () => {
      const state = get();
      cancelPendingSave();
      if (state.records.length === 0 && !state.customAnalysis.useCustom) return;
      set({ isSaving: true });
      try {
        const result = await r2StorageService.saveRecords(
          state.records, state.version ?? undefined,
          state.customAnalysis, state.customMonthly,
          state.cycleStats, state.cycleStatsGeneratedAt
        ) as any;
        if (result.success) {
          set({ version: result.version || null, error: null });
        } else if (result.conflict) {
          const normalizedRecords = (result.records || []).map((r: any) => ({ ...r, hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
          set({
            error: '数据冲突，已加载最新数据，请重试操作',
            records: normalizedRecords,
            customAnalysis: result.customAnalysis || { useCustom: false, data: { ...emptyAnalysis } },
            customMonthly: result.customMonthly || { useCustom: false, data: [] },
            cycleStats: result.cycleStats || emptyCycleStats,
            cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
            version: result.version || null,
          });
        } else {
          const msg = result.error || result.message || '保存失败';
          set({ error: msg });
          throw new Error(msg);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : '保存失败，请检查网络连接';
        set({ error: msg });
        throw error;
      } finally { set({ isSaving: false }); }
    },
  };
});

export function useAnalysisResult(): AnalysisResult {
  const records = useDataStore((s) => s.records);
  const customAnalysis = useDataStore((s) => s.customAnalysis);
  const fieldConfig = useDataStore((s) => s.fieldConfig);

  return useMemo(() => {
    if (customAnalysis.useCustom) return customAnalysis.data;
    return {
      systemProfitRatio: calculateProfitRatio(records, '是'),
      systemNoMistakeProfitRatio: calculateProfitRatio(records, '是', '否'),
      systemWithMistakeProfitRatio: calculateProfitRatio(records, '是', '是'),
      nonSystemProfitRatio: calculateProfitRatio(records, '否'),
      systemProfitAvgHoldDays: calculateAverageHoldDays(records, '是', 'positive'),
      systemLossAvgHoldDays: calculateAverageHoldDays(records, '是', 'negative'),
      nonSystemProfitAvgHoldDays: calculateAverageHoldDays(records, '否', 'positive'),
      nonSystemLossAvgHoldDays: calculateAverageHoldDays(records, '否', 'negative'),
      tradingTypeRatios: calculateTradingTypeRatios(records, fieldConfig.tradingTypes),
      entryTypeRatios: calculateEntryTypeRatios(records, fieldConfig.entryTypes),
      aggregateRatios: calculateAggregateRatios(records, fieldConfig.aggregateRules),
    };
  }, [records, customAnalysis, fieldConfig]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const records = useDataStore((s) => s.records);
  const customMonthly = useDataStore((s) => s.customMonthly);

  return useMemo(() => {
    if (customMonthly.useCustom) return customMonthly.data;
    const monthMap = new Map<string, TradingRecord[]>();
    for (const r of records) {
      const month = extractMonth(r.openDate);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month)!.push(r);
    }
    const months = Array.from(monthMap.keys()).sort();
    return months.map(month => {
      const monthRecords = monthMap.get(month)!;
      return {
        month,
        systemProfitRatio: calculateProfitRatio(monthRecords, '是'),
        systemNoMistakeProfitRatio: calculateProfitRatio(monthRecords, '是', '否'),
        systemWithMistakeProfitRatio: calculateProfitRatio(monthRecords, '是', '是'),
        nonSystemProfitRatio: calculateProfitRatio(monthRecords, '否'),
        avgProfitRatio: calculateAvgProfitRatio(monthRecords),
        totalProfit: calculateTotalProfit(monthRecords),
      };
    });
  }, [records, customMonthly]);
}

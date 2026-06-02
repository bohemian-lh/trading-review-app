import { create } from 'zustand';
import { useMemo } from 'react';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, CustomAnalysisData, CustomMonthlyData, CycleStats, CycleStatType } from '@/types';
import { calculateProfitRatio, calculateAvgProfitRatio, calculateTotalProfit, calculateAverageHoldDays, calculateProfitRatioByType } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';
import { generateId } from '@/utils';
import { r2StorageService } from '@/services/r2Service';
import { generateCycleStats, STAT_TYPES, recalculateSingleCycle, removeRecordFromCycle } from '@/services/cycleStatsService';

interface DataState {
  records: TradingRecord[];
  isLoading: boolean;
  isSaving: boolean;
  isInitialized: boolean;
  error: string | null;
  currentFileName: string | null;
  version: number | null;
  // 自定义分析数据（表2）
  customAnalysis: CustomAnalysisData;
  // 自定义月度数据（表3）
  customMonthly: CustomMonthlyData;
  // 周期统计数据（表4）
  cycleStats: Record<CycleStatType, CycleStats[]>;
  cycleStatsGeneratedAt: number | null;
  // 标记是否有需要更新的统计
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
  // 自定义分析数据操作
  setCustomAnalysis: (data: CustomAnalysisData) => void;
  updateCustomAnalysisField: (field: keyof AnalysisResult, value: number | 'N/A') => void;
  toggleUseCustomAnalysis: () => void;
  // 自定义月度数据操作
  setCustomMonthly: (data: CustomMonthlyData) => void;
  addCustomMonthly: (item: MonthlyAnalysis) => void;
  updateCustomMonthly: (month: string, updates: Partial<MonthlyAnalysis>) => void;
  deleteCustomMonthly: (month: string) => void;
  toggleUseCustomMonthly: () => void;
  // 周期统计操作
  updateCycleStats: () => void;
  loadFromR2: () => Promise<void>;
  saveToR2: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => {
  let debouncedSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingSave = () => {
    if (debouncedSaveTimer) {
      clearTimeout(debouncedSaveTimer);
      debouncedSaveTimer = null;
    }
  };

  const scheduleDebouncedSave = () => {
    cancelPendingSave();
    debouncedSaveTimer = setTimeout(() => {
      debouncedSaveTimer = null;
      get().saveToR2();
    }, 1000);
  };

  // 空的分析数据模板
  const emptyAnalysis: AnalysisResult = {
    systemProfitRatio: 'N/A',
    systemNoMistakeProfitRatio: 'N/A',
    systemWithMistakeProfitRatio: 'N/A',
    nonSystemProfitRatio: 'N/A',
    systemProfitAvgHoldDays: 'N/A',
    systemLossAvgHoldDays: 'N/A',
    nonSystemProfitAvgHoldDays: 'N/A',
    nonSystemLossAvgHoldDays: 'N/A',
    typeQifeiShuidi: 0,
    typeQifeiQianDuoCaiMA: 0,
    typeFengxianShifang: 0,
    typeShuangyang: 0,
    typeFeiXitong: 0,
  };

  // 初始化空的周期统计
  const emptyCycleStats: Record<CycleStatType, CycleStats[]> = Object.fromEntries(
    STAT_TYPES.map(type => [type, []])
  ) as unknown as Record<CycleStatType, CycleStats[]>;

  return {
    records: [],
    isLoading: false,
    isSaving: false,
    isInitialized: false,
    error: null,
    currentFileName: null,
    version: null,
    customAnalysis: { useCustom: false, data: { ...emptyAnalysis } },
    customMonthly: { useCustom: false, data: [] },
    cycleStats: emptyCycleStats,
    cycleStatsGeneratedAt: null,
    statsNeedUpdate: false,

    setRecords: (records) => {
      // 确保新记录都有默认值
      const normalizedRecords = records.map(r => ({
        ...r,
        hasCycleStats: r.hasCycleStats ?? false,
        hasMonthlyStats: r.hasMonthlyStats ?? false
      }));
      set({ records: normalizedRecords, error: null });
      scheduleDebouncedSave();
    },

    addRecord: (recordData) => {
      const newRecord: TradingRecord = {
        ...recordData,
        id: generateId(),
        hasCycleStats: false,
        hasMonthlyStats: false,
      };
      set((state) => ({
        records: [...state.records, newRecord],
      }));
      scheduleDebouncedSave();
    },

    addRecords: (recordsData) => {
      const newRecords: TradingRecord[] = recordsData.map((record) => ({
        ...record,
        id: record.id || generateId(),
        hasCycleStats: record.hasCycleStats ?? false,
        hasMonthlyStats: record.hasMonthlyStats ?? false,
      }));
      set((state) => ({
        records: [...state.records, ...newRecords],
        statsNeedUpdate: true,
      }));
      scheduleDebouncedSave();
    },

    updateRecord: (id, updates) => {
      const state = get();
      const oldRecord = state.records.find(r => r.id === id);
      
      if (!oldRecord) return;
      
      // 定义字段类型
      const valueFields = ['profitPercent', 'holdDays']; // 只影响计算的字段
      const typeFields = ['tradingType', 'isSystem', 'hasMistake', 'openDate']; // 影响归类的字段
      
      const hasValueChange = valueFields.some(key => (updates as any)[key] !== undefined);
      const hasTypeChange = typeFields.some(key => (updates as any)[key] !== undefined);
      
      // 准备新记录
      let newRecord: TradingRecord = { ...oldRecord, ...updates };
      let newCycleStats = { ...state.cycleStats };
      let needsUpdateFlag = false;
      
      if (hasValueChange && !hasTypeChange && oldRecord.hasCycleStats) {
        // 场景 1：只修改了数值字段，并且记录在周期中
        // 找到该记录所在的所有周期
        for (const statType of STAT_TYPES) {
          const cycles = newCycleStats[statType];
          for (let i = 0; i < cycles.length; i++) {
            const cycle = cycles[i];
            if (cycle.recordIds.includes(id)) {
              // 重新计算这个周期
              const updatedCycle = recalculateSingleCycle(
                cycle,
                [newRecord, ...state.records.filter(r => r.id !== id)]
              );
              newCycleStats[statType][i] = updatedCycle;
            }
          }
        }
      } else if (hasTypeChange && oldRecord.hasCycleStats) {
        // 场景 2：修改了类型字段，并且记录在周期中
        // 从原周期中移除记录
        for (const statType of STAT_TYPES) {
          const cycles = newCycleStats[statType];
          newCycleStats[statType] = [];
          
          for (const cycle of cycles) {
            if (cycle.recordIds.includes(id)) {
              // 从这个周期中移除记录
              const updatedCycle = removeRecordFromCycle(cycle, id);
              if (updatedCycle) {
                newCycleStats[statType].push(updatedCycle);
              }
            } else {
              newCycleStats[statType].push(cycle);
            }
          }
        }
        
        // 清除该记录的统计标记
        newRecord = { 
          ...newRecord, 
          hasCycleStats: false,
          cycleId: undefined
        };
        needsUpdateFlag = true;
      } else if (hasTypeChange) {
        // 场景 3：修改了类型字段，但记录没有在周期中
        // 只需要标记需要更新
        needsUpdateFlag = true;
      }
      
      // 更新记录
      const updatedRecords = state.records.map(record =>
        record.id === id ? newRecord : record
      );
      
      set({
        records: updatedRecords,
        cycleStats: newCycleStats,
        statsNeedUpdate: needsUpdateFlag,
      });
      
      scheduleDebouncedSave();
    },

    deleteRecord: (id) => {
      const state = get();
      
      // 从所有周期中移除该记录
      let newCycleStats = { ...state.cycleStats };
      let needsUpdateFlag = false;
      
      for (const statType of STAT_TYPES) {
        const cycles = newCycleStats[statType];
        newCycleStats[statType] = [];
        
        for (const cycle of cycles) {
          if (cycle.recordIds.includes(id)) {
            const updatedCycle = removeRecordFromCycle(cycle, id);
            if (updatedCycle) {
              newCycleStats[statType].push(updatedCycle);
            }
            needsUpdateFlag = true;
          } else {
            newCycleStats[statType].push(cycle);
          }
        }
      }
      
      set((state) => ({
        records: state.records.filter((record) => record.id !== id),
        cycleStats: newCycleStats,
        statsNeedUpdate: needsUpdateFlag,
      }));
      
      scheduleDebouncedSave();
    },

    clearRecords: () => {
      set({ records: [], currentFileName: null, error: null });
      scheduleDebouncedSave();
    },

    setLoading: (loading) => {
      set({ isLoading: loading });
    },

    setError: (error) => {
      set({ error });
    },

    setCurrentFileName: (filename) => {
      set({ currentFileName: filename });
    },

    // 自定义分析数据操作
    setCustomAnalysis: (data) => {
      set({ customAnalysis: data });
      scheduleDebouncedSave();
    },

    updateCustomAnalysisField: (field, value) => {
      set((state) => ({
        customAnalysis: {
          ...state.customAnalysis,
          data: { ...state.customAnalysis.data, [field]: value },
        },
      }));
      scheduleDebouncedSave();
    },

    toggleUseCustomAnalysis: () => {
      set((state) => ({
        customAnalysis: {
          ...state.customAnalysis,
          useCustom: !state.customAnalysis.useCustom,
        },
      }));
      scheduleDebouncedSave();
    },

    // 自定义月度数据操作
    setCustomMonthly: (data) => {
      set({ customMonthly: data });
      scheduleDebouncedSave();
    },

    addCustomMonthly: (item) => {
      set((state) => ({
        customMonthly: {
          ...state.customMonthly,
          data: [...state.customMonthly.data, item],
        },
      }));
      scheduleDebouncedSave();
    },

    updateCustomMonthly: (month, updates) => {
      set((state) => ({
        customMonthly: {
          ...state.customMonthly,
          data: state.customMonthly.data.map((item) =>
            item.month === month ? { ...item, ...updates } : item
          ),
        },
      }));
      scheduleDebouncedSave();
    },

    deleteCustomMonthly: (month) => {
      set((state) => ({
        customMonthly: {
          ...state.customMonthly,
          data: state.customMonthly.data.filter((item) => item.month !== month),
        },
      }));
      scheduleDebouncedSave();
    },

    toggleUseCustomMonthly: () => {
      set((state) => ({
        customMonthly: {
          ...state.customMonthly,
          useCustom: !state.customMonthly.useCustom,
        },
      }));
      scheduleDebouncedSave();
    },

    // 更新周期统计
    updateCycleStats: () => {
      const state = get();
      
      // 清除所有记录的 cycle 标记，强制全量重新生成
      const cleanRecords = state.records.map(r => ({
        ...r,
        hasCycleStats: false,
        cycleId: undefined,
      }));
      
      const { result, updatedRecords } = generateCycleStats(
        cleanRecords,
        Object.fromEntries(STAT_TYPES.map(type => [type, []])) as unknown as Record<CycleStatType, CycleStats[]>
      );
      
      set({
        records: updatedRecords,
        cycleStats: result.stats,
        cycleStatsGeneratedAt: result.generatedAt,
        statsNeedUpdate: false,
      });
      // 不在此处自动保存，由调用方（handleUpdateStats）统一调用 saveToR2
    },

    loadFromR2: async () => {
      set({ isLoading: true, error: null });
      try {
        const result = await r2StorageService.getRecords() as any;
        if (result.success) {
          // 确保记录都有新字段的默认值
          const normalizedRecords = (result.records || []).map((r: any) => ({
            ...r,
            hasCycleStats: r.hasCycleStats ?? false,
            hasMonthlyStats: r.hasMonthlyStats ?? false
          }));
          
          set({
            records: normalizedRecords,
            customAnalysis: result.customAnalysis || { useCustom: false, data: { ...emptyAnalysis } },
            customMonthly: result.customMonthly || { useCustom: false, data: [] },
            cycleStats: result.cycleStats || emptyCycleStats,
            cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
            version: result.version || null,
            isInitialized: true,
          });
        } else {
          set({ isInitialized: true });
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Load failed',
          isInitialized: true,
        });
      } finally {
        set({ isLoading: false });
      }
    },

    saveToR2: async () => {
      const state = get();
      cancelPendingSave();
      if (state.records.length === 0 && !state.customAnalysis.useCustom) return;
      
      set({ isSaving: true });
      try {
        const result = await r2StorageService.saveRecords(
          state.records, 
          state.version ?? undefined,
          state.customAnalysis,
          state.customMonthly,
          state.cycleStats,
          state.cycleStatsGeneratedAt
        ) as any;
        if (result.success) {
          set({ version: result.version || null, error: null });
        } else if (result.conflict) {
          // 确保冲突时加载的数据也有默认值
          const normalizedRecords = (result.records || []).map((r: any) => ({
            ...r,
            hasCycleStats: r.hasCycleStats ?? false,
            hasMonthlyStats: r.hasMonthlyStats ?? false
          }));
          
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
      } finally {
        set({ isSaving: false });
      }
    },
  };
});

export function useAnalysisResult(): AnalysisResult {
  const records = useDataStore((state) => state.records);
  const customAnalysis = useDataStore((state) => state.customAnalysis);

  return useMemo(() => {
    if (customAnalysis.useCustom) {
      return customAnalysis.data;
    }
    return {
      systemProfitRatio: calculateProfitRatio(records, '是'),
      systemNoMistakeProfitRatio: calculateProfitRatio(records, '是', '否'),
      systemWithMistakeProfitRatio: calculateProfitRatio(records, '是', '是'),
      nonSystemProfitRatio: calculateProfitRatio(records, '否'),
      systemProfitAvgHoldDays: calculateAverageHoldDays(records, '是', 'positive'),
      systemLossAvgHoldDays: calculateAverageHoldDays(records, '是', 'negative'),
      nonSystemProfitAvgHoldDays: calculateAverageHoldDays(records, '否', 'positive'),
      nonSystemLossAvgHoldDays: calculateAverageHoldDays(records, '否', 'negative'),
      typeQifeiShuidi: calculateProfitRatioByType(records, '齐飞水底'),
      typeQifeiQianDuoCaiMA: calculateProfitRatioByType(records, '齐飞前多踩MA'),
      typeFengxianShifang: calculateProfitRatioByType(records, '风险释放平台转一致'),
      typeShuangyang: calculateProfitRatioByType(records, '双阳平台转一致'),
      typeFeiXitong: calculateProfitRatioByType(records, '非系统'),
    };
  }, [records, customAnalysis]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const records = useDataStore((state) => state.records);
  const customMonthly = useDataStore((state) => state.customMonthly);

  return useMemo(() => {
    if (customMonthly.useCustom) {
      return customMonthly.data;
    }
    
    const monthlyMap = new Map<string, TradingRecord[]>();

    for (const record of records) {
      const month = extractMonth(record.openDate);
      if (!month) continue;

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, []);
      }
      monthlyMap.get(month)!.push(record);
    }

    const sortedMonths = Array.from(monthlyMap.keys()).sort();

    return sortedMonths.map((month) => {
      const monthRecords = monthlyMap.get(month) || [];
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

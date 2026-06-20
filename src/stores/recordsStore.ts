import { create } from 'zustand';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, CustomAnalysisData, CustomMonthlyData, CycleStats, FieldConfig } from '@/types';
import { DEFAULT_FIELD_CONFIG } from '@/types';
import { generateId } from '@/utils';
import { buildStatTypes, recalculateSingleCycle, removeRecordFromCycle } from '@/services/cycleStatsService';

interface RecordsState {
  records: TradingRecord[];
  fieldConfig: FieldConfig;
  customAnalysis: CustomAnalysisData;
  customMonthly: CustomMonthlyData;
  cycleStats: Record<string, CycleStats[]>;
  cycleStatsGeneratedAt: number | null;
  statsNeedUpdate: boolean;
  version: number | null;

  setRecords: (records: TradingRecord[]) => void;
  addRecord: (record: Omit<TradingRecord, 'id' | 'hasCycleStats' | 'hasMonthlyStats'>) => void;
  addRecords: (records: TradingRecord[]) => void;
  updateRecord: (id: string, updates: Partial<TradingRecord>) => void;
  deleteRecord: (id: string) => void;
  clearRecords: () => void;

  setCustomAnalysis: (data: CustomAnalysisData) => void;
  updateCustomAnalysisField: (field: keyof AnalysisResult, value: number | 'N/A') => void;
  toggleUseCustomAnalysis: () => void;

  setCustomMonthly: (data: CustomMonthlyData) => void;
  addCustomMonthly: (item: MonthlyAnalysis) => void;
  updateCustomMonthly: (month: string, updates: Partial<MonthlyAnalysis>) => void;
  deleteCustomMonthly: (month: string) => void;
  toggleUseCustomMonthly: () => void;

  setFieldConfig: (config: FieldConfig) => void;

  setVersion: (version: number | null) => void;
  setCycleStats: (stats: Record<string, CycleStats[]>, generatedAt: number | null) => void;
}

const emptyAnalysis: AnalysisResult = {
  systemProfitRatio: 'N/A', systemNoMistakeProfitRatio: 'N/A', systemWithMistakeProfitRatio: 'N/A',
  nonSystemProfitRatio: 'N/A', systemProfitAvgHoldDays: 'N/A', systemLossAvgHoldDays: 'N/A',
  nonSystemProfitAvgHoldDays: 'N/A', nonSystemLossAvgHoldDays: 'N/A',
  tradingTypeRatios: {}, entryTypeRatios: {}, aggregateRatios: {},
};

export const emptyCycleStats: Record<string, CycleStats[]> = {};

export const useRecordsStore = create<RecordsState>((set, get) => ({
  records: [],
  fieldConfig: { ...DEFAULT_FIELD_CONFIG },
  customAnalysis: { useCustom: false, data: { ...emptyAnalysis } },
  customMonthly: { useCustom: false, data: [] },
  cycleStats: emptyCycleStats,
  cycleStatsGeneratedAt: null,
  statsNeedUpdate: false,
  version: null,

  setRecords: (records) => {
    const normalized = records.map(r => ({ ...r, hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
    set({ records: normalized });
  },

  addRecord: (recordData) => {
    const newRecord: TradingRecord = { ...recordData, id: generateId(), hasCycleStats: false, hasMonthlyStats: false };
    set((s) => ({ records: [...s.records, newRecord] }));
  },

  addRecords: (recordsData) => {
    const newRecords: TradingRecord[] = recordsData.map(r => ({ ...r, id: r.id || generateId(), hasCycleStats: r.hasCycleStats ?? false, hasMonthlyStats: r.hasMonthlyStats ?? false }));
    set((s) => ({ records: [...s.records, ...newRecords], statsNeedUpdate: true }));
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
  },

  clearRecords: () => set({ records: [] }),

  setCustomAnalysis: (data) => set({ customAnalysis: data }),
  updateCustomAnalysisField: (field, value) => {
    set((s) => ({ customAnalysis: { ...s.customAnalysis, data: { ...s.customAnalysis.data, [field]: value } } }));
  },
  toggleUseCustomAnalysis: () => {
    set((s) => ({ customAnalysis: { ...s.customAnalysis, useCustom: !s.customAnalysis.useCustom } }));
  },

  setCustomMonthly: (data) => set({ customMonthly: data }),
  addCustomMonthly: (item) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: [...s.customMonthly.data, item] } }));
  },
  updateCustomMonthly: (month, updates) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.map(i => i.month === month ? { ...i, ...updates } : i) } }));
  },
  deleteCustomMonthly: (month) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.filter(i => i.month !== month) } }));
  },
  toggleUseCustomMonthly: () => {
    set((s) => ({ customMonthly: { ...s.customMonthly, useCustom: !s.customMonthly.useCustom } }));
  },

  setFieldConfig: (config) => set({ fieldConfig: config, statsNeedUpdate: true }),

  setVersion: (version) => set({ version }),
  setCycleStats: (stats, generatedAt) => set({ cycleStats: stats, cycleStatsGeneratedAt: generatedAt, statsNeedUpdate: false }),
}));

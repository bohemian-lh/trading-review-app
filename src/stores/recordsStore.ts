import { create } from 'zustand';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, CustomAnalysisData, CustomMonthlyData, CycleStats, FieldConfig, StatOverview, AnalysisSeriesResult } from '@/types';
import { DEFAULT_FIELD_CONFIG } from '@/types';
import { generateId } from '@/utils';
import { normalizeTheoreticalValue } from '@/utils/theoreticalRatio';
import { buildStatTypes, recalculateSingleCycle, removeRecordFromCycle } from '@/services/cycleStatsService';

/** 归一化理论盈亏字段：±999 / 'NULL' / 'N/A' → null；未填保持缺失 */
function normalizeTheoreticalMap(map: any): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const normalized = normalizeTheoreticalValue(value);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

/** 迁移旧数据：entryType → trendFeatures；isSystem → patternFeatures；丢弃已删除的旧字段 */
export function migrateRecord(r: any): TradingRecord {
  const { entryType, isSystem, ...rest } = r;
  delete rest.subsequentProfitSpace;
  delete rest.theoreticalProfitPercent;
  const trendFeatures = r.trendFeatures ?? entryType;
  const patternFeatures = r.patternFeatures ?? (isSystem === '是' ? ['系统'] : isSystem === '否' ? ['非系统'] : []);
  return {
    ...rest,
    trendFeatures: typeof trendFeatures === 'string'
      ? [trendFeatures]
      : (Array.isArray(trendFeatures) && trendFeatures.length > 0 ? trendFeatures : ['未知']),
    patternFeatures: Array.isArray(patternFeatures) ? patternFeatures : [],
    hasCycleStats: r.hasCycleStats ?? false,
    hasMonthlyStats: r.hasMonthlyStats ?? false,
    positionSize: typeof r.positionSize === 'number' ? Math.min(100, Math.max(0, r.positionSize)) : 33,
    theoreticalProfitRatios: normalizeTheoreticalMap(r.theoreticalProfitRatios),
    theoreticalProfitDeltas: normalizeTheoreticalMap(r.theoreticalProfitDeltas),
  };
}

interface RecordsState {
  records: TradingRecord[];
  fieldConfig: FieldConfig;
  customAnalysis: CustomAnalysisData;
  customMonthly: CustomMonthlyData;
  cycleStats: Record<string, CycleStats[]>;
  cycleStatsGeneratedAt: number | null;
  statsNeedUpdate: boolean;
  version: number | null;
  /** 预计算统计结果：总览宽表 */
  statOverview: StatOverview | null;
  /** 预计算统计结果：月度宽表 */
  statMonthly: MonthlyAnalysis[];
  /** 预计算统计结果：`${configKind}:${configId}` → 序列结果 */
  analysisResults: Record<string, AnalysisSeriesResult>;

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
  setStats: (snapshot: {
    overview: StatOverview | null;
    monthly: MonthlyAnalysis[];
    results: AnalysisSeriesResult[];
  }) => void;
}

const emptyAnalysis: AnalysisResult = {
  systemProfitRatio: 'N/A', systemNoMistakeProfitRatio: 'N/A', systemWithMistakeProfitRatio: 'N/A',
  nonSystemProfitRatio: 'N/A', systemProfitAvgHoldDays: 'N/A', systemLossAvgHoldDays: 'N/A',
  nonSystemProfitAvgHoldDays: 'N/A', nonSystemLossAvgHoldDays: 'N/A',
  tradingTypeRatios: {}, trendFeatureRatios: {}, aggregateRatios: {},
  theoreticalProfitRatios: {},
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
  statOverview: null,
  statMonthly: [],
  analysisResults: {},

  setRecords: (records) => {
    const normalized = records.map(r => migrateRecord(r));
    set({ records: normalized, statsNeedUpdate: true });
  },

  addRecord: (recordData) => {
    const newRecord: TradingRecord = { ...recordData, id: generateId(), hasCycleStats: false, hasMonthlyStats: false };
    set((s) => ({ records: [...s.records, newRecord], statsNeedUpdate: true }));
  },

  addRecords: (recordsData) => {
    const newRecords: TradingRecord[] = recordsData.map(r => ({
      ...migrateRecord(r),
      id: r.id || generateId(),
    }));
    set((s) => ({ records: [...s.records, ...newRecords], statsNeedUpdate: true }));
  },

  updateRecord: (id, updates) => {
    const state = get();
    const oldRecord = state.records.find(r => r.id === id);
    if (!oldRecord) return;

    const valueFields = ['profitPercent', 'holdDays'];
    const typeFields = ['tradingType', 'patternFeatures', 'hasMistake', 'openDate', 'trendFeatures'];
    const hasValueChange = valueFields.some(k => (updates as any)[k] !== undefined);
    const hasTypeChange = typeFields.some(k => (updates as any)[k] !== undefined);

    let newRecord: TradingRecord = { ...oldRecord, ...updates };
    let newCycleStats = { ...state.cycleStats };
    const statTypes = buildStatTypes(state.fieldConfig);

    if (hasValueChange && !hasTypeChange && oldRecord.hasCycleStats) {
      // 预构建 id→record 映射并替换为更新后的记录，避免每个命中周期都全表重建
      const idToRecord = new Map<string, TradingRecord>(state.records.map(r => [r.id, r]));
      idToRecord.set(id, newRecord);
      for (const statType of statTypes) {
        const cycles = newCycleStats[statType] || [];
        for (let i = 0; i < cycles.length; i++) {
          if (cycles[i].recordIds.includes(id)) {
            const cycleRecords = cycles[i].recordIds
              .map(rid => idToRecord.get(rid))
              .filter((r): r is TradingRecord => r !== undefined);
            newCycleStats[statType][i] = recalculateSingleCycle(cycles[i], cycleRecords);
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
    }

    set({
      records: state.records.map(r => r.id === id ? newRecord : r),
      cycleStats: newCycleStats,
      statsNeedUpdate: true,
    });
  },

  deleteRecord: (id) => {
    const state = get();
    let newCycleStats = { ...state.cycleStats };
    const statTypes = buildStatTypes(state.fieldConfig);

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

    set((s) => ({ records: s.records.filter(r => r.id !== id), cycleStats: newCycleStats, statsNeedUpdate: true }));
  },

  clearRecords: () => set({ records: [], statsNeedUpdate: true }),

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
  setStats: ({ overview, monthly, results }) => {
    const analysisResults: Record<string, AnalysisSeriesResult> = {};
    for (const item of results) analysisResults[`${item.configKind}:${item.configId}`] = item;
    set({ statOverview: overview, statMonthly: monthly, analysisResults, statsNeedUpdate: false });
  },
}));

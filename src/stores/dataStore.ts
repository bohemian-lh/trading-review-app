import { create } from 'zustand';
import { useMemo } from 'react';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';
import { calculateProfitRatio, calculateAverageHoldDays } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';
import { generateId } from '@/utils';
import { r2StorageService } from '@/services/r2Service';

const isDev = import.meta.env.DEV;
const STORAGE_KEY = 'trading-review-storage';

function loadFromLocalStorage(): TradingRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('从 localStorage 加载失败:', error);
  }
  return [];
}

function saveToLocalStorage(records: TradingRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('保存到 localStorage 失败:', error);
  }
}

interface DataState {
  records: TradingRecord[];
  isLoading: boolean;
  isSaving: boolean;
  isInitialized: boolean;
  error: string | null;
  currentFileName: string | null;

  setRecords: (records: TradingRecord[]) => void;
  addRecord: (record: Omit<TradingRecord, 'id'>) => void;
  updateRecord: (id: string, updates: Partial<TradingRecord>) => void;
  deleteRecord: (id: string) => void;
  clearRecords: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentFileName: (filename: string | null) => void;
  loadFromR2: () => Promise<void>;
  saveToR2: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  records: [],
  isLoading: false,
  isSaving: false,
  isInitialized: false,
  error: null,
  currentFileName: null,

  setRecords: async (records) => {
    set({ records, error: null });
    await get().saveToR2();
  },

  addRecord: async (recordData) => {
    const newRecord: TradingRecord = {
      ...recordData,
      id: generateId(),
    };
    set((state) => ({
      records: [...state.records, newRecord],
    }));
    await get().saveToR2();
  },

  updateRecord: async (id, updates) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === id ? { ...record, ...updates } : record
      ),
    }));
    await get().saveToR2();
  },

  deleteRecord: async (id) => {
    set((state) => ({
      records: state.records.filter((record) => record.id !== id),
    }));
    await get().saveToR2();
  },

  clearRecords: async () => {
    set({ records: [], currentFileName: null, error: null });
    await get().saveToR2();
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

  loadFromR2: async () => {
    set({ isLoading: true, error: null });
    try {
      if (isDev) {
        const records = loadFromLocalStorage();
        set({ records, isInitialized: true });
      } else {
        const result = await r2StorageService.getRecords();
        if (result.success && result.records) {
          set({ records: result.records, isInitialized: true });
        } else {
          set({ isInitialized: true });
        }
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载失败',
        isInitialized: true,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  saveToR2: async () => {
    const state = get();
    if (!state.isInitialized) return;
    
    set({ isSaving: true });
    try {
      if (isDev) {
        saveToLocalStorage(state.records);
      } else {
        await r2StorageService.saveRecords(state.records);
      }
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      set({ isSaving: false });
    }
  },
}));

export function useAnalysisResult(): AnalysisResult {
  const records = useDataStore((state) => state.records);

  return useMemo(() => {
    return {
      systemProfitRatio: calculateProfitRatio(records, '是'),
      systemNoMistakeProfitRatio: calculateProfitRatio(records, '是', '否'),
      systemWithMistakeProfitRatio: calculateProfitRatio(records, '是', '是'),
      nonSystemProfitRatio: calculateProfitRatio(records, '否'),
      systemProfitAvgHoldDays: calculateAverageHoldDays(records, '是', 'positive'),
      systemLossAvgHoldDays: calculateAverageHoldDays(records, '是', 'negative'),
      nonSystemProfitAvgHoldDays: calculateAverageHoldDays(records, '否', 'positive'),
      nonSystemLossAvgHoldDays: calculateAverageHoldDays(records, '否', 'negative'),
    };
  }, [records]);
}

export function useMonthlyAnalysis(): MonthlyAnalysis[] {
  const records = useDataStore((state) => state.records);

  return useMemo(() => {
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
        systemProfitAvgHoldDays: calculateAverageHoldDays(monthRecords, '是', 'positive'),
        systemLossAvgHoldDays: calculateAverageHoldDays(monthRecords, '是', 'negative'),
        nonSystemProfitAvgHoldDays: calculateAverageHoldDays(monthRecords, '否', 'positive'),
        nonSystemLossAvgHoldDays: calculateAverageHoldDays(monthRecords, '否', 'negative'),
      };
    });
  }, [records]);
}

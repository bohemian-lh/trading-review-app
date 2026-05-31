import { create } from 'zustand';
import { useMemo } from 'react';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';
import { calculateProfitRatio, calculateAverageHoldDays } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';
import { generateId } from '@/utils';
import { r2StorageService } from '@/services/r2Service';

function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface DataState {
  records: TradingRecord[];
  isLoading: boolean;
  isSaving: boolean;
  isInitialized: boolean;
  error: string | null;
  currentFileName: string | null;
  version: number | null;

  setRecords: (records: TradingRecord[]) => void;
  addRecord: (record: Omit<TradingRecord, 'id'>) => void;
  addRecords: (records: TradingRecord[]) => void;
  updateRecord: (id: string, updates: Partial<TradingRecord>) => void;
  deleteRecord: (id: string) => void;
  clearRecords: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentFileName: (filename: string | null) => void;
  loadFromR2: () => Promise<void>;
  saveToR2: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => {
  let debouncedSave: (() => void) | null = null;

  const getDebouncedSave = () => {
    if (!debouncedSave) {
      debouncedSave = debounce(() => {
        get().saveToR2();
      }, 1000);
    }
    return debouncedSave;
  };

  return {
    records: [],
    isLoading: false,
    isSaving: false,
    isInitialized: false,
    error: null,
    currentFileName: null,
    version: null,

    setRecords: (records) => {
      set({ records, error: null });
      getDebouncedSave()();
    },

    addRecord: (recordData) => {
      const newRecord: TradingRecord = {
        ...recordData,
        id: generateId(),
      };
      set((state) => ({
        records: [...state.records, newRecord],
      }));
      getDebouncedSave()();
    },

    addRecords: (recordsData) => {
      const newRecords: TradingRecord[] = recordsData.map((record) => ({
        ...record,
        id: record.id || generateId(),
      }));
      set((state) => ({
        records: [...state.records, ...newRecords],
      }));
      getDebouncedSave()();
    },

    updateRecord: (id, updates) => {
      set((state) => ({
        records: state.records.map((record) =>
          record.id === id ? { ...record, ...updates } : record
        ),
      }));
      getDebouncedSave()();
    },

    deleteRecord: (id) => {
      set((state) => ({
        records: state.records.filter((record) => record.id !== id),
      }));
      getDebouncedSave()();
    },

    clearRecords: () => {
      set({ records: [], currentFileName: null, error: null });
      getDebouncedSave()();
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
        const result = await r2StorageService.getRecords();
        if (result.success && result.records) {
          set({
            records: result.records,
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
      set({ isSaving: true });
      try {
        const result = await r2StorageService.saveRecords(state.records, state.version ?? undefined);
        if (result.success) {
          set({ version: result.version || null, error: null });
        } else if (result.conflict) {
          set({
            error: 'Conflict detected, please refresh',
            records: result.records || [],
            version: result.version || null,
          });
        } else {
          console.error('Save failed:', result.message);
          set({ error: result.message });
        }
      } catch (error) {
        console.error('Save failed:', error);
      } finally {
        set({ isSaving: false });
      }
    },
  };
});

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

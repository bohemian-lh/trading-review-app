import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';
import { calculateProfitRatio, calculateAverageHoldDays } from '@/utils/calculations';
import { extractMonth } from '@/utils/dateUtils';
import { generateId } from '@/utils';

interface DataState {
  records: TradingRecord[];
  isLoading: boolean;
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
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      records: [],
      isLoading: false,
      error: null,
      currentFileName: null,

      setRecords: (records) => {
        set({ records, error: null });
      },

      addRecord: (recordData) => {
        const newRecord: TradingRecord = {
          ...recordData,
          id: generateId(),
        };
        set((state) => ({
          records: [...state.records, newRecord],
        }));
      },

      updateRecord: (id, updates) => {
        set((state) => ({
          records: state.records.map((record) =>
            record.id === id ? { ...record, ...updates } : record
          ),
        }));
      },

      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((record) => record.id !== id),
        }));
      },

      clearRecords: () => {
        set({ records: [], currentFileName: null, error: null });
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
    }),
    {
      name: 'trading-review-storage',
      partialize: (state) => ({
        records: state.records,
        currentFileName: state.currentFileName,
      }),
    }
  )
);

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

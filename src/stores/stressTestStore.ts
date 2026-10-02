import { create } from 'zustand';
import type { StressSeries } from '@/types';

interface StressTestState {
  series: StressSeries[];
  setSeries: (series: StressSeries[]) => void;
  addSeries: (s: StressSeries) => void;
  updateSeries: (s: StressSeries) => void;
  deleteSeries: (id: string) => void;
}

export const useStressTestStore = create<StressTestState>((set) => ({
  series: [],
  setSeries: (series) => set({ series }),
  addSeries: (s) => set((state) => ({ series: [...state.series, s] })),
  updateSeries: (s) => set((state) => ({
    series: state.series.map((x) => (x.id === s.id ? s : x)),
  })),
  deleteSeries: (id) => set((state) => ({
    series: state.series.filter((x) => x.id !== id),
  })),
}));

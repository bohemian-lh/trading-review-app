import { create } from 'zustand';
import type { Dataset } from '@/types';
import { r2StorageService } from '@/services/r2Service';

interface DatasetState {
  datasets: Dataset[];
  currentDatasetId: string | null;

  setCurrentDatasetId: (id: string | null) => void;
  setDatasets: (datasets: Dataset[]) => void;
  createDataset: (name: string) => Promise<Dataset | null>;
  deleteDataset: (id: string) => Promise<void>;
}

export const useDatasetStore = create<DatasetState>((set) => ({
  datasets: [],
  currentDatasetId: null,

  setCurrentDatasetId: (id) => set({ currentDatasetId: id }),
  setDatasets: (datasets) => set({ datasets }),

  createDataset: async (name) => {
    const result = await r2StorageService.createDataset(name);
    if (result.success && result.dataset) {
      set((s) => ({ datasets: [...s.datasets, result.dataset!] }));
      return result.dataset;
    }
    return null;
  },

  deleteDataset: async (id) => {
    await r2StorageService.deleteDataset(id);
    set((s) => ({ datasets: s.datasets.filter(d => d.id !== id) }));
  },
}));

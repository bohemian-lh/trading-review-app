import { create } from 'zustand';

interface UIState {
  isLoading: boolean;
  isSaving: boolean;
  isInitialized: boolean;
  error: string | null;
  currentFileName: string | null;

  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentFileName: (filename: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  isSaving: false,
  isInitialized: false,
  error: null,
  currentFileName: null,

  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
  setInitialized: (initialized) => set({ isInitialized: initialized }),
  setError: (error) => set({ error }),
  setCurrentFileName: (filename) => set({ currentFileName: filename }),
}));

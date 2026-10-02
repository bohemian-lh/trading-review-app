import { create } from 'zustand';
import type { AnalysisTab } from '@/types';

interface AnalysisTabState {
  tabs: AnalysisTab[];
  activeTabId: string | null; // null = 默认「总览」页签
  setTabs: (tabs: AnalysisTab[]) => void;
  setActiveTabId: (id: string | null) => void;
  addTab: (tab: AnalysisTab) => void;
  deleteTab: (id: string) => void;
}

export const useAnalysisTabStore = create<AnalysisTabState>((set) => ({
  tabs: [],
  activeTabId: null,
  setTabs: (tabs) => set({ tabs }),
  setActiveTabId: (id) => set({ activeTabId: id }),
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  deleteTab: (id) => set((s) => ({
    tabs: s.tabs.filter(t => t.id !== id),
    activeTabId: s.activeTabId === id ? null : s.activeTabId,
  })),
}));

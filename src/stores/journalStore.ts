// 交易日志 + 快照 Zustand store
import { create } from 'zustand';
import type { TradingJournal, JournalConfigSnapshot, JournalStageConfig, JournalDraft } from '@/types';
import { DEFAULT_JOURNAL_STAGES } from '@/types';
import { loadJournals, saveJournals, loadSnapshots, saveSnapshots } from '@/services/journalService';
import { generateId } from '@/utils';
import { useRecordsStore } from '@/stores';

interface JournalState {
  journals: TradingJournal[];
  snapshots: JournalConfigSnapshot[];
  activeStages: JournalStageConfig[];
  loading: boolean;
  error: string | null;

  init: (datasetId: string) => Promise<void>;
  createSnapshot: (stages: JournalStageConfig[], datasetId: string) => Promise<JournalConfigSnapshot | null>;
  createJournal: (draft: JournalDraft, snapshotId: string, datasetId: string) => Promise<void>;
  finalizeJournal: (journalId: string, datasetId: string) => Promise<void>;
  revertJournal: (journalId: string, datasetId: string) => Promise<void>;
  updateDraftJournal: (journalId: string, partial: Partial<TradingJournal>, datasetId: string) => Promise<void>;
  updateJournalRecordId: (journalId: string, recordId: string | undefined, datasetId: string) => Promise<void>;
  deleteJournal: (journalId: string, datasetId: string) => Promise<void>;
  saveDraft: (entryId: string, draft: JournalDraft) => void;
  getDraft: (entryId: string) => JournalDraft | null;
  getAllDraftEntries: () => JournalDraft[];
  clearDraft: (entryId: string) => void;
}

const DRAFT_PREFIX = 'journal_draft_';

function loadDraft(entryId: string): JournalDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${entryId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function getAllDrafts(): JournalDraft[] {
  const drafts: JournalDraft[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) drafts.push(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }
  return drafts;
}

function migrateJournal(j: any): TradingJournal {
  return {
    ...j,
    openDate: j.openDate || '',
    stockCode: j.stockCode || '',
    stockName: j.stockName || '',
    status: j.status || 'submitted', // 旧数据默认为 submitted
    strategyBold: j.strategyBold || [],
    strategyRed: j.strategyRed || [],
    strategyYellow: j.strategyYellow || [],
  };
}

export const useJournalStore = create<JournalState>((set, get) => ({
  journals: [],
  snapshots: [],
  activeStages: DEFAULT_JOURNAL_STAGES,
  loading: false,
  error: null,

  init: async (datasetId: string) => {
    set({ loading: true, error: null });
    try {
      const [journals, snapshots] = await Promise.all([
        loadJournals(datasetId),
        loadSnapshots(datasetId),
      ]);
      let activeStages = snapshots.length > 0
        ? snapshots[snapshots.length - 1].stages
        : undefined;
      if (!activeStages) {
        const fc = useRecordsStore.getState().fieldConfig;
        activeStages = fc.journalStrategyConfig?.length ? fc.journalStrategyConfig : DEFAULT_JOURNAL_STAGES;
      }
      const fixedJournals = journals.map(migrateJournal);
      set({ journals: fixedJournals, snapshots, activeStages, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createSnapshot: async (stages: JournalStageConfig[], datasetId: string) => {
    const { snapshots } = get();
    const snapshot: JournalConfigSnapshot = {
      snapshotId: `snap_${generateId()}`,
      version: snapshots.length + 1,
      stages: JSON.parse(JSON.stringify(stages)),
      createdAt: new Date().toISOString(),
    };
    const newSnapshots = [...snapshots, snapshot];
    try {
      await saveSnapshots(datasetId, newSnapshots);
      set({ snapshots: newSnapshots, activeStages: stages });
      return snapshot;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  // 提交创建 → status: 'draft'（中间态）
  createJournal: async (draft: JournalDraft, snapshotId: string, datasetId: string) => {
    const { journals } = get();
    const newJournal: TradingJournal = {
      id: `jrnl_${generateId()}`,
      openDate: draft.openDate,
      stockCode: draft.stockCode,
      stockName: draft.stockName,
      stage: draft.stage,
      strategies: [...draft.strategies],
      strategyBold: [],
      strategyRed: [],
      strategyYellow: [],
      snapshotId,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    const newJournals = [...journals, newJournal];
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
      localStorage.removeItem(`${DRAFT_PREFIX}${draft.entryId}`);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // 提交日志 → status: 'submitted'（最终态）
  finalizeJournal: async (journalId: string, datasetId: string) => {
    const { journals } = get();
    const newJournals = journals.map(j =>
      j.id === journalId ? { ...j, status: 'submitted' as const } : j
    );
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // 撤回提交 → status: 'draft'（回退到中间态）
  revertJournal: async (journalId: string, datasetId: string) => {
    const { journals } = get();
    const newJournals = journals.map(j =>
      j.id === journalId ? { ...j, status: 'draft' as const } : j
    );
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // 编辑 draft 日志
  updateDraftJournal: async (journalId: string, partial: Partial<TradingJournal>, datasetId: string) => {
    const { journals } = get();
    const newJournals = journals.map(j =>
      j.id === journalId ? { ...j, ...partial } : j
    );
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateJournalRecordId: async (journalId: string, recordId: string | undefined, datasetId: string) => {
    const { journals } = get();
    const newJournals = journals.map(j =>
      j.id === journalId ? { ...j, recordId } : j
    );
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteJournal: async (journalId: string, datasetId: string) => {
    const { journals } = get();
    const newJournals = journals.filter(j => j.id !== journalId);
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  saveDraft: (entryId: string, draft: JournalDraft) => {
    localStorage.setItem(`${DRAFT_PREFIX}${entryId}`, JSON.stringify(draft));
  },

  getDraft: (entryId: string) => {
    return loadDraft(entryId);
  },

  getAllDraftEntries: () => {
    return getAllDrafts();
  },

  clearDraft: (entryId: string) => {
    localStorage.removeItem(`${DRAFT_PREFIX}${entryId}`);
  },
}));

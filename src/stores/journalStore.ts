// 交易日志 + 快照 Zustand store
import { create } from 'zustand';
import type { TradingJournal, JournalConfigSnapshot, JournalStageConfig, JournalDraft } from '@/types';
import { DEFAULT_JOURNAL_STAGES } from '@/types';
import { loadJournals, saveJournals, loadSnapshots, saveSnapshots } from '@/services/journalService';
import { generateId } from '@/utils';

interface JournalState {
  journals: TradingJournal[];
  snapshots: JournalConfigSnapshot[];
  activeStages: JournalStageConfig[];
  loading: boolean;
  error: string | null;

  init: (datasetId: string) => Promise<void>;
  createSnapshot: (stages: JournalStageConfig[], datasetId: string) => Promise<JournalConfigSnapshot | null>;
  submitJournal: (draft: JournalDraft, snapshotId: string, datasetId: string) => Promise<void>;
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
      // 取最新快照的 stages，兼容旧数据（无 openDate 的记录）
      const activeStages = snapshots.length > 0
        ? snapshots[snapshots.length - 1].stages
        : DEFAULT_JOURNAL_STAGES;
      // 兼容旧数据：若无 openDate 则给默认值
      const fixedJournals = journals.map(j => ({
        ...j,
        openDate: j.openDate || '',
        stockCode: j.stockCode || '',
        stockName: j.stockName || '',
      }));
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

  submitJournal: async (draft: JournalDraft, snapshotId: string, datasetId: string) => {
    const { journals } = get();
    const newJournal: TradingJournal = {
      id: `jrnl_${generateId()}`,
      openDate: draft.openDate,
      stockCode: draft.stockCode,
      stockName: draft.stockName,
      stage: draft.stage,
      strategies: [...draft.strategies],
      snapshotId,
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

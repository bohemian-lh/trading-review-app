// 交易日志 + 快照 Zustand store
import { create } from 'zustand';
import type { TradingJournal, JournalConfigSnapshot, JournalStageConfig, JournalDraft } from '@/types';
import { DEFAULT_JOURNAL_STAGES } from '@/types';
import { loadJournals, saveJournals, loadSnapshots, saveSnapshots } from '@/services/journalService';
import { generateId } from '@/utils';

interface JournalState {
  // 已提交日志
  journals: TradingJournal[];
  // 配置快照
  snapshots: JournalConfigSnapshot[];
  // 当前活跃的策略配置（最新快照或默认值）
  activeStages: JournalStageConfig[];
  // 草稿（localStorage 缓存）
  drafts: Record<string, JournalDraft>;
  // 加载状态
  loading: boolean;
  error: string | null;

  // 初始化
  init: (datasetId: string) => Promise<void>;
  // 配置快照管理
  createSnapshot: (stages: JournalStageConfig[], datasetId: string) => Promise<JournalConfigSnapshot | null>;
  // 日志管理
  submitJournal: (draft: JournalDraft, snapshotId: string, datasetId: string) => Promise<void>;
  deleteJournal: (journalId: string, datasetId: string) => Promise<void>;
  // 草稿管理
  getDraft: (recordId: string) => JournalDraft;
  saveDraft: (recordId: string, draft: Partial<JournalDraft>) => void;
  clearDraft: (recordId: string) => void;
}

const DRAFT_PREFIX = 'journal_draft_';

function loadDraft(recordId: string): JournalDraft {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${recordId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { recordId, stage: 'stage1_left', strategies: [], isBold: false, isRed: false };
}

function saveDraftToStorage(recordId: string, draft: JournalDraft) {
  localStorage.setItem(`${DRAFT_PREFIX}${recordId}`, JSON.stringify(draft));
}

export const useJournalStore = create<JournalState>((set, get) => ({
  journals: [],
  snapshots: [],
  activeStages: DEFAULT_JOURNAL_STAGES,
  drafts: {},
  loading: false,
  error: null,

  init: async (datasetId: string) => {
    set({ loading: true, error: null });
    try {
      const [journals, snapshots] = await Promise.all([
        loadJournals(datasetId),
        loadSnapshots(datasetId),
      ]);
      // 取最新快照的 stages
      const activeStages = snapshots.length > 0
        ? snapshots[snapshots.length - 1].stages
        : DEFAULT_JOURNAL_STAGES;
      set({ journals, snapshots, activeStages, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createSnapshot: async (stages: JournalStageConfig[], datasetId: string) => {
    const { snapshots } = get();
    const snapshot: JournalConfigSnapshot = {
      snapshotId: `snap_${generateId()}`,
      version: snapshots.length + 1,
      stages: JSON.parse(JSON.stringify(stages)), // deep copy
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
    // 检查是否已有同 recordId+stage 的日志，如有则覆盖
    const existingIdx = journals.findIndex(
      j => j.recordId === draft.recordId && j.stage === draft.stage
    );
    const newJournal: TradingJournal = {
      id: `jrnl_${generateId()}`,
      recordId: draft.recordId,
      stage: draft.stage,
      strategies: [...draft.strategies],
      snapshotId,
      createdAt: new Date().toISOString(),
    };
    let newJournals: TradingJournal[];
    if (existingIdx >= 0) {
      newJournals = [...journals];
      newJournals[existingIdx] = newJournal;
    } else {
      newJournals = [...journals, newJournal];
    }
    try {
      await saveJournals(datasetId, newJournals);
      set({ journals: newJournals });
      // 清除草稿
      localStorage.removeItem(`${DRAFT_PREFIX}${draft.recordId}`);
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

  getDraft: (recordId: string) => {
    return loadDraft(recordId);
  },

  saveDraft: (recordId: string, partial: Partial<JournalDraft>) => {
    const current = loadDraft(recordId);
    const updated = { ...current, ...partial, recordId };
    saveDraftToStorage(recordId, updated);
    set(s => ({ drafts: { ...s.drafts, [recordId]: updated } }));
  },

  clearDraft: (recordId: string) => {
    localStorage.removeItem(`${DRAFT_PREFIX}${recordId}`);
    set(s => {
      const drafts = { ...s.drafts };
      delete drafts[recordId];
      return { drafts };
    });
  },
}));

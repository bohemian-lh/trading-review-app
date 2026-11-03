// 交易日志 + 快照 Zustand store
// 写入策略：乐观更新 + 合并提交（同一批操作只发一次增量请求）
import { create } from 'zustand';
import type { TradingJournal, CustomStrategy, JournalConfigSnapshot, JournalStageConfig, JournalStrategyGroup, JournalDraft } from '@/types';
import { DEFAULT_JOURNAL_STAGES, DEFAULT_SHARED_STRATEGY_GROUPS } from '@/types';
import {
  loadJournals,
  loadSnapshots,
  saveSnapshots,
  saveJournalOps,
  loadWatchlist,
  saveWatchlist,
  JournalConflictError,
} from '@/services/journalService';
import type { JournalOp } from '@/services/journalService';
import { generateId } from '@/utils';
import { useRecordsStore } from '@/stores/recordsStore';

interface JournalState {
  journals: TradingJournal[];
  snapshots: JournalConfigSnapshot[];
  activeStages: JournalStageConfig[];
  watchlist: string[];
  version: number;
  loading: boolean;
  error: string | null;
  syncState: 'idle' | 'saving' | 'error';
  syncError: string | null;
  lastSyncedAt: number | null;

  init: (datasetId: string) => Promise<void>;
  createSnapshot: (stages: JournalStageConfig[], datasetId: string) => Promise<JournalConfigSnapshot | null>;
  createJournal: (draft: JournalDraft, snapshotId: string, datasetId: string) => Promise<void>;
  finalizeJournal: (journalId: string, datasetId: string) => Promise<void>;
  revertJournal: (journalId: string, datasetId: string) => Promise<void>;
  updateDraftJournal: (journalId: string, partial: Partial<TradingJournal>, datasetId: string) => Promise<void>;
  updateJournalRecordId: (journalId: string, recordId: string | undefined, datasetId: string) => Promise<void>;
  deleteJournal: (journalId: string, datasetId: string) => Promise<void>;
  updateWatchlist: (watchlist: string[], datasetId: string) => Promise<void>;
  retrySync: () => void;
  saveDraft: (entryId: string, draft: JournalDraft) => void;
  getDraft: (entryId: string) => JournalDraft | null;
  getAllDraftEntries: () => JournalDraft[];
  clearDraft: (entryId: string) => void;
}

const DRAFT_PREFIX = 'journal_draft_';

// ─── 草稿（localStorage）───────────────────────────────────────────
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
  // 迁移旧格式 customStrategies: string → CustomStrategy[]
  let customStrategies: Record<string, CustomStrategy[]> = {};
  if (j.customStrategies) {
    for (const [groupId, val] of Object.entries(j.customStrategies)) {
      if (Array.isArray(val)) {
        customStrategies[groupId] = val as CustomStrategy[];
      } else if (typeof val === 'string' && val.trim()) {
        customStrategies[groupId] = [{ id: `custom_${groupId}_0`, text: val.trim() }];
      }
    }
  }
  // 迁移旧数据：无 stageStrategies 时从 strategies + stage 构建
  let stageStrategies: Record<string, string[]> = j.stageStrategies || {};
  let stageCustomStrategies: Record<string, Record<string, CustomStrategy[]>> = j.stageCustomStrategies || {};
  if (!j.stageStrategies && j.stage && Array.isArray(j.strategies)) {
    stageStrategies = { [j.stage]: [...j.strategies] };
    if (Object.keys(customStrategies).length > 0) {
      stageCustomStrategies = { [j.stage]: { ...customStrategies } };
    }
  }
  return {
    ...j,
    openDate: j.openDate || '',
    stockCode: j.stockCode || '',
    stockName: j.stockName || '',
    status: j.status || 'submitted',
    strategyBold: j.strategyBold || [],
    strategyRed: j.strategyRed || [],
    strategyYellow: j.strategyYellow || [],
    strategyRedText: j.strategyRedText || [],
    strategyHidden: j.strategyHidden || [],
    priceLevels: Array.isArray(j.priceLevels)
      ? j.priceLevels.length >= 7
        ? j.priceLevels
        : j.priceLevels.length === 5
          ? [...j.priceLevels.slice(0, 3), '', ...j.priceLevels.slice(3), '']
          : [...j.priceLevels, ...Array(7 - j.priceLevels.length).fill('')]
      : ['', '', '', '', '', '', ''],
    strategies: Array.isArray(j.strategies) ? j.strategies : [],
    customStrategies,
    stageStrategies,
    stageCustomStrategies,
    strategyOrder: j.strategyOrder || {},
  };
}

function buildActiveStages(
  stages: JournalStageConfig[],
  sharedGroups?: JournalStrategyGroup[]
): JournalStageConfig[] {
  if (sharedGroups && sharedGroups.length > 0) {
    return stages.map(s => ({ ...s, strategyGroups: sharedGroups }));
  }
  return stages;
}

// ─── 快照内容哈希（配置不变时复用同一快照）─────────────────────────
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

async function hashStages(stages: JournalStageConfig[]): Promise<string> {
  const text = stableStringify(stages);
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
  } catch { /* 回退到同步哈希 */ }
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16)}`;
}

// ─── 写入队列（模块级，避免参与 React 渲染）─────────────────────────
const FLUSH_DEBOUNCE = 600;
const FLUSH_MAX_WAIT = 2000;
const MAX_RETRY = 3;

type TouchedOp = { op: 'upsert' | 'delete'; seq: number };

let currentDatasetId: string | null = null;

let touched = new Map<string, TouchedOp>();
let opSeq = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let firstTouchAt = 0;
let flushing = false;
let flushAgain = false;
let retryCount = 0;
let conflictRetried = false;

let snapshotsDirty = false;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotFlushing = false;
let snapshotAgain = false;

let watchlistDirty = false;
let watchlistTimer: ReturnType<typeof setTimeout> | null = null;
let watchlistFlushing = false;
let watchlistAgain = false;

function getState() {
  return useJournalStore.getState();
}

function hasPendingWrites(): boolean {
  return touched.size > 0 || snapshotsDirty || watchlistDirty;
}

/** 所有待写数据都完成后，把「保存中」状态收敛为 idle */
function settleSyncState(): void {
  if (flushing || snapshotFlushing || watchlistFlushing) return;
  if (hasPendingWrites()) return;
  if (getState().syncState === 'saving') {
    useJournalStore.setState({ syncState: 'idle', syncError: null });
  }
}

function resetQueues(): void {
  if (flushTimer) clearTimeout(flushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  if (snapshotTimer) clearTimeout(snapshotTimer);
  if (watchlistTimer) clearTimeout(watchlistTimer);
  flushTimer = retryTimer = snapshotTimer = watchlistTimer = null;
  touched = new Map();
  firstTouchAt = 0;
  retryCount = 0;
  conflictRetried = false;
  snapshotsDirty = false;
  watchlistDirty = false;
}

function markTouched(id: string, op: 'upsert' | 'delete'): void {
  opSeq += 1;
  touched.set(id, { op, seq: opSeq });
  if (!firstTouchAt) firstTouchAt = Date.now();
  const state = getState();
  if (state.syncState !== 'saving' || state.syncError) {
    useJournalStore.setState({ syncState: 'saving', syncError: null });
  }
  scheduleFlush();
}

function clearSent(sent: Map<string, TouchedOp>): void {
  for (const [id, entry] of sent) {
    if (touched.get(id)?.seq === entry.seq) touched.delete(id);
  }
}

function scheduleFlush(): void {
  if (!currentDatasetId || touched.size === 0) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  const now = Date.now();
  if (!firstTouchAt) firstTouchAt = now;
  if (flushTimer) clearTimeout(flushTimer);
  const elapsed = now - firstTouchAt;
  const wait = elapsed >= FLUSH_MAX_WAIT ? 0 : Math.min(FLUSH_DEBOUNCE, FLUSH_MAX_WAIT - elapsed);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushJournals();
  }, wait);
}

function mergeServerState(version: number, serverJournals: TradingJournal[]): void {
  const merged = new Map<string, TradingJournal>();
  for (const journal of serverJournals) merged.set(journal.id, migrateJournal(journal));
  for (const [id, entry] of touched) {
    if (entry.op === 'delete') {
      merged.delete(id);
    } else {
      const local = getState().journals.find(j => j.id === id);
      if (local) merged.set(id, local);
    }
  }
  useJournalStore.setState({ journals: [...merged.values()], version });
}

async function flushJournals(keepalive = false): Promise<void> {
  if (!currentDatasetId || touched.size === 0) return;
  if (flushing) {
    flushAgain = true;
    return;
  }

  flushing = true;
  const datasetId = currentDatasetId;
  const sent = new Map(touched);
  const ops: JournalOp[] = [];
  for (const [id, entry] of sent) {
    if (entry.op === 'delete') {
      ops.push({ op: 'delete', id });
      continue;
    }
    const journal = getState().journals.find(j => j.id === id);
    if (journal) ops.push({ op: 'upsert', journal });
  }

  if (ops.length === 0) {
    clearSent(sent);
    flushing = false;
    return;
  }

  useJournalStore.setState({ syncState: 'saving', syncError: null });
  try {
    const { version } = await saveJournalOps(datasetId, getState().version, ops, keepalive);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    clearSent(sent);
    retryCount = 0;
    conflictRetried = false;
    firstTouchAt = 0;
    const remaining = touched.size > 0;
    useJournalStore.setState({
      version,
      syncState: remaining ? 'saving' : 'idle',
      syncError: null,
      lastSyncedAt: Date.now(),
    });
    collectOrphanSnapshots();
    if (remaining) scheduleFlush();
  } catch (e) {
    if (e instanceof JournalConflictError) {
      if (!conflictRetried) {
        conflictRetried = true;
        mergeServerState(e.version, e.journals);
        flushAgain = true;
      } else {
        useJournalStore.setState({ syncState: 'error', syncError: '数据已在其他页面更新，请刷新后重试' });
      }
    } else {
      retryCount += 1;
      if (retryCount <= MAX_RETRY) {
        useJournalStore.setState({ syncState: 'saving', syncError: null });
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void flushJournals();
        }, 1000 * 2 ** (retryCount - 1));
      } else {
        useJournalStore.setState({
          syncState: 'error',
          syncError: e instanceof Error ? e.message : '同步失败',
        });
      }
    }
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      scheduleFlush();
    }
  }
}

function markSnapshotsDirty(): void {
  snapshotsDirty = true;
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    void flushSnapshots();
  }, FLUSH_DEBOUNCE);
}

async function flushSnapshots(): Promise<void> {
  if (!snapshotsDirty || !currentDatasetId) return;
  if (snapshotFlushing) {
    snapshotAgain = true;
    return;
  }
  snapshotFlushing = true;
  snapshotsDirty = false;
  const datasetId = currentDatasetId;
  try {
    await saveSnapshots(datasetId, getState().snapshots);
  } catch (e) {
    snapshotsDirty = true;
    useJournalStore.setState({
      syncState: 'error',
      syncError: e instanceof Error ? e.message : '快照同步失败',
    });
  } finally {
    snapshotFlushing = false;
    if (snapshotAgain) {
      snapshotAgain = false;
      markSnapshotsDirty();
    }
    settleSyncState();
  }
}

function markWatchlistDirty(): void {
  watchlistDirty = true;
  if (watchlistTimer) clearTimeout(watchlistTimer);
  watchlistTimer = setTimeout(() => {
    watchlistTimer = null;
    void flushWatchlist();
  }, FLUSH_DEBOUNCE);
}

async function flushWatchlist(): Promise<void> {
  if (!watchlistDirty || !currentDatasetId) return;
  if (watchlistFlushing) {
    watchlistAgain = true;
    return;
  }
  watchlistFlushing = true;
  watchlistDirty = false;
  const datasetId = currentDatasetId;
  try {
    await saveWatchlist(datasetId, getState().watchlist);
  } catch (e) {
    watchlistDirty = true;
    useJournalStore.setState({
      syncState: 'error',
      syncError: e instanceof Error ? e.message : '关注列表同步失败',
    });
  } finally {
    watchlistFlushing = false;
    if (watchlistAgain) {
      watchlistAgain = false;
      markWatchlistDirty();
    }
    settleSyncState();
  }
}

/** 立即把待写数据落盘（页面隐藏/卸载时用 keepalive 降低丢写概率） */
export async function flushJournalsNow(keepalive = false): Promise<void> {
  await Promise.all([flushJournals(keepalive), flushSnapshots(), flushWatchlist()]);
  settleSyncState();
}

function collectOrphanSnapshots(): void {
  const { journals, snapshots } = getState();
  if (snapshots.length === 0) return;
  const referenced = new Set<string>();
  for (const journal of journals) {
    if (journal.snapshotId) referenced.add(journal.snapshotId);
  }
  const latest = snapshots[snapshots.length - 1]?.snapshotId;
  const kept = snapshots.filter(s => referenced.has(s.snapshotId) || s.snapshotId === latest);
  if (kept.length !== snapshots.length) {
    useJournalStore.setState({ snapshots: kept });
    markSnapshotsDirty();
  }
}

export const useJournalStore = create<JournalState>((set, get) => ({
  journals: [],
  snapshots: [],
  activeStages: buildActiveStages(DEFAULT_JOURNAL_STAGES, DEFAULT_SHARED_STRATEGY_GROUPS),
  watchlist: [],
  version: 0,
  loading: false,
  error: null,
  syncState: 'idle',
  syncError: null,
  lastSyncedAt: null,

  init: async (datasetId: string) => {
    // 切换数据集前先把旧数据写完；未写完则中止切换，避免改动写进新数据集
    if (currentDatasetId && currentDatasetId !== datasetId) {
      if (hasPendingWrites()) await flushJournalsNow();
      if (hasPendingWrites()) {
        set({ error: '上一个数据集仍有改动未同步，请检查网络后重试' });
        return;
      }
    }
    currentDatasetId = datasetId;
    resetQueues();

    set({ loading: true, error: null, syncError: null, syncState: 'idle' });
    try {
      const [journalData, snapshots, watchlist] = await Promise.all([
        loadJournals(datasetId),
        loadSnapshots(datasetId),
        loadWatchlist(datasetId),
      ]);
      // 阶段名称始终从 fieldConfig 取，快照仅用于历史日志渲染
      const fc = useRecordsStore.getState().fieldConfig;
      const stageNames = fc.journalStrategyConfig?.length ? fc.journalStrategyConfig : DEFAULT_JOURNAL_STAGES;
      const sharedGroups = fc.sharedJournalStrategyGroups ?? DEFAULT_SHARED_STRATEGY_GROUPS;
      const activeStages = buildActiveStages(stageNames, sharedGroups);
      const fixedJournals = journalData.journals.map(migrateJournal);
      set({
        journals: fixedJournals,
        snapshots,
        activeStages,
        watchlist: Array.isArray(watchlist) ? watchlist : [],
        version: journalData.version,
        loading: false,
        lastSyncedAt: Date.now(),
      });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createSnapshot: async (stages: JournalStageConfig[], datasetId: string) => {
    currentDatasetId = datasetId;
    const snapshotId = `snap_${await hashStages(stages)}`;
    const existing = get().snapshots.find(s => s.snapshotId === snapshotId);
    if (existing) {
      set({ activeStages: stages });
      return existing;
    }
    const version = get().snapshots.reduce((max, s) => Math.max(max, s.version), 0) + 1;
    const snapshot: JournalConfigSnapshot = {
      snapshotId,
      version,
      stages: JSON.parse(JSON.stringify(stages)),
      createdAt: new Date().toISOString(),
    };
    set({ snapshots: [...get().snapshots, snapshot], activeStages: stages });
    markSnapshotsDirty();
    return snapshot;
  },

  // 提交创建 → status: 'draft'（中间态）
  createJournal: async (draft: JournalDraft, snapshotId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournal: TradingJournal = {
      id: `jrnl_${generateId()}`,
      openDate: draft.openDate,
      stockCode: draft.stockCode,
      stockName: draft.stockName,
      stage: draft.stage,
      strategies: [...draft.strategies],
      stageStrategies: { [draft.stage]: [...draft.strategies] },
      customStrategies: {},
      stageCustomStrategies: {},
      strategyBold: [],
      strategyRed: [],
      strategyYellow: [],
      strategyRedText: [],
      strategyHidden: [],
      priceLevels: ['', '', '', '', '', '', ''],
      strategyOrder: {},
      snapshotId,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    set({ journals: [...get().journals, newJournal] });
    markTouched(newJournal.id, 'upsert');
    localStorage.removeItem(`${DRAFT_PREFIX}${draft.entryId}`);
  },

  // 提交日志 → status: 'submitted'（最终态）
  finalizeJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, status: 'submitted' as const } : j
    );
    set({ journals: newJournals });
    markTouched(journalId, 'upsert');
  },

  // 撤回提交 → status: 'draft'（回退到中间态）
  revertJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, status: 'draft' as const } : j
    );
    set({ journals: newJournals });
    markTouched(journalId, 'upsert');
  },

  // 编辑 draft 日志
  updateDraftJournal: async (journalId: string, partial: Partial<TradingJournal>, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, ...partial } : j
    );
    set({ journals: newJournals });
    markTouched(journalId, 'upsert');
  },

  updateJournalRecordId: async (journalId: string, recordId: string | undefined, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, recordId } : j
    );
    set({ journals: newJournals });
    markTouched(journalId, 'upsert');
  },

  deleteJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    set({ journals: get().journals.filter(j => j.id !== journalId) });
    markTouched(journalId, 'delete');
    // 孤儿快照在写回成功后再回收，避免删除失败导致历史日志失去配置引用
  },

  updateWatchlist: async (watchlist: string[], datasetId: string) => {
    currentDatasetId = datasetId;
    set({ watchlist });
    markWatchlistDirty();
  },

  retrySync: () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (!hasPendingWrites()) {
      set({ syncState: 'idle', syncError: null });
      return;
    }
    retryCount = 0;
    conflictRetried = false;
    set({ syncState: 'saving', syncError: null });
    void flushJournalsNow();
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

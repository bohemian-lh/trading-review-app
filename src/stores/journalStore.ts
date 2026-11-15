// 交易日志 + 快照 Zustand store
// 写入策略：乐观更新 + 出站队列（outbox）+ 合并提交
// 每次变更先写入 IndexedDB 出站队列，再更新 UI；
// 服务端严格 ACK（success 且返回 version）后才清理队列，刷新/断网可重放。
import { create } from 'zustand';
import type { TradingJournal, CustomStrategy, JournalConfigSnapshot, JournalStageConfig, JournalStrategyGroup, JournalDraft } from '@/types';
import { DEFAULT_JOURNAL_STAGES, DEFAULT_SHARED_STRATEGY_GROUPS } from '@/types';
import {
  loadJournalPage,
  loadSnapshots,
  saveSnapshots,
  saveJournalOps,
  loadWatchlist,
  saveWatchlist,
  JournalConflictError,
  CollectionConflictError,
} from '@/services/journalService';
import type { JournalOp, JournalPageQuery } from '@/services/journalService';
import { outboxKey, outboxList, outboxPut, outboxRemove } from '@/services/journalOutbox';
import type { JournalOutboxEntry } from '@/services/journalOutbox';
import { readPage, removeRows, writePage, writeRows } from '@/services/pagedCache';
import { generateId } from '@/utils';
import { useRecordsStore } from '@/stores/recordsStore';

/** 当前视图的服务端分页状态：只保存行 id 顺序与页码，行内容统一放 journals 缓存 */
export interface JournalPageState {
  status: 'submitted' | 'draft';
  ids: string[];
  total: number;
  /** 当前页码（从 1 开始） */
  page: number;
  pageSize: number;
  /** 总页数（至少 1，便于界面直接渲染页码） */
  totalPages: number;
  loading: boolean;
  error: string | null;
}

/** 查看页下推到服务端的筛选条件 */
export interface JournalQuery {
  fromDay: string;
  toDay: string;
  code: string;
  sort: 'asc' | 'desc';
}

/** 一页 50 条：与服务端默认一致 */
const JOURNAL_PAGE_SIZE = 50;

const EMPTY_PAGE: JournalPageState = {
  status: 'submitted',
  ids: [],
  total: 0,
  page: 1,
  pageSize: JOURNAL_PAGE_SIZE,
  totalPages: 1,
  loading: false,
  error: null,
};

const INITIAL_QUERY: JournalQuery = { fromDay: '', toDay: '', code: '', sort: 'desc' };

interface JournalState {
  /**
   * 已加载行缓存：只含「按需拉取过的分页」+「本地新增/编辑的行」，
   * 不再是整表数据；写路径（出站队列）与渲染都从这里取行内容。
   */
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
  /** 尚未被服务端确认的日志条数，用于页头提示 */
  pendingCount: number;
  journalPage: JournalPageState;
  journalQuery: JournalQuery;
  pageSize: number;

  init: (datasetId: string) => Promise<void>;
  loadPage: (
    status: 'submitted' | 'draft',
    query?: Partial<JournalQuery>,
    datasetId?: string,
    page?: number,
  ) => Promise<void>;
  /** 跳到指定页（1 起）：筛选条件与视图不变 */
  goToPage: (page: number, datasetId?: string) => Promise<void>;
  /**
   * 重排「当前交易」：nextOrder 是拖动后的完整显示顺序（当前页）。
   * 只给被移动的行写新序号，其余行不动；间隔耗尽时整页重新编号。
   */
  reorderDrafts: (movedId: string, nextOrder: string[], datasetId?: string) => Promise<void>;
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

type TouchedEntry = JournalOutboxEntry;

let currentDatasetId: string | null = null;

let touched = new Map<string, TouchedEntry>();
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
/** 快照集合的服务端版本，用于 CAS 保存 */
let snapshotsVersion = 0;

let watchlistDirty = false;
let watchlistTimer: ReturnType<typeof setTimeout> | null = null;
let watchlistFlushing = false;
let watchlistAgain = false;
/** 关注列表的服务端版本，用于 CAS 保存 */
let watchlistVersion = 0;

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
    useJournalStore.setState({ syncState: 'idle', syncError: null, pendingCount: touched.size });
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
  useJournalStore.setState({ pendingCount: 0 });
}

/**
 * 记录一条待同步变更：先构造完整出站条目并写入 IndexedDB，再驱动 UI 与提交。
 * 返回是否真正落盘；调用方（如新建日志）可据此决定是否删除本地草稿。
 */
function markTouched(id: string, op: 'upsert' | 'delete'): Promise<boolean> {
  const datasetId = currentDatasetId;
  if (!datasetId) return Promise.resolve(false);

  opSeq += 1;
  const state = getState();
  const journal = op === 'upsert' ? state.journals.find(j => j.id === id) ?? null : null;
  const snapshot = journal?.snapshotId
    ? state.snapshots.find(s => s.snapshotId === journal.snapshotId) ?? null
    : null;

  const entry: TouchedEntry = {
    key: outboxKey(datasetId, id),
    datasetId,
    journalId: id,
    op,
    journal,
    snapshot,
    opId: `${opSeq}_${Date.now()}`,
    updatedAt: Date.now(),
  };

  touched.set(id, entry);
  if (!firstTouchAt) firstTouchAt = Date.now();
  useJournalStore.setState({
    syncState: 'saving',
    syncError: null,
    pendingCount: touched.size,
  });
  scheduleFlush();
  return outboxPut(entry);
}

async function clearSent(sent: Map<string, TouchedEntry>): Promise<void> {
  const keys: string[] = [];
  for (const [id, entry] of sent) {
    // 期间又被改动过则保留，等待下一轮提交
    if (touched.get(id)?.opId === entry.opId) {
      touched.delete(id);
      keys.push(entry.key);
    }
  }
  await outboxRemove(keys);
  useJournalStore.setState({ pendingCount: touched.size });
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

/**
 * 冲突重放：服务端只回传受影响的行，因此这里按 id 覆盖缓存而不是整表替换。
 * 本地尚未确认的改动优先，避免把用户刚做的修改冲掉。
 */
function mergeServerState(version: number, serverJournals: TradingJournal[]): void {
  const cache = new Map<string, TradingJournal>();
  for (const journal of getState().journals) cache.set(journal.id, journal);
  for (const journal of serverJournals) {
    if (touched.has(journal.id)) continue;
    const migrated = migrateJournal(journal);
    cache.set(journal.id, migrated);
    cacheJournal(migrated);
  }
  useJournalStore.setState({ journals: [...cache.values()], version });
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
    if (entry.journal) ops.push({ op: 'upsert', journal: entry.journal });
  }

  if (ops.length === 0) {
    await clearSent(sent);
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
    await clearSent(sent);
    retryCount = 0;
    conflictRetried = false;
    firstTouchAt = 0;
    const remaining = touched.size > 0;
    useJournalStore.setState({
      version,
      syncState: remaining ? 'saving' : 'idle',
      syncError: null,
      lastSyncedAt: Date.now(),
      pendingCount: touched.size,
    });
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
    const result = await saveSnapshots(datasetId, getState().snapshots, snapshotsVersion);
    snapshotsVersion = result.version;
  } catch (e) {
    if (e instanceof CollectionConflictError) {
      // 服务端已被其它页面推进：以服务端为准，避免互相覆盖
      snapshotsVersion = e.version;
      useJournalStore.setState({
        snapshots: e.items as JournalConfigSnapshot[],
        syncError: '快照已被其它页面修改，已同步为最新内容',
      });
    } else {
      snapshotsDirty = true;
      useJournalStore.setState({
        syncState: 'error',
        syncError: e instanceof Error ? e.message : '快照同步失败',
      });
    }
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
    const result = await saveWatchlist(datasetId, getState().watchlist, watchlistVersion);
    watchlistVersion = result.version;
  } catch (e) {
    if (e instanceof CollectionConflictError) {
      watchlistVersion = e.version;
      useJournalStore.setState({
        watchlist: e.items as string[],
        syncError: '关注列表已被其它页面修改，已同步为最新内容',
      });
    } else {
      watchlistDirty = true;
      useJournalStore.setState({
        syncState: 'error',
        syncError: e instanceof Error ? e.message : '关注列表同步失败',
      });
    }
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

/**
 * 分页后前端只持有部分日志，无法再据本地数据判断「快照是否仍被引用」，
 * 因此不再在浏览器回收快照（误删会让历史日志丢失配置）。
 * 快照按内容哈希去重，重复创建不会增长；如需回收应在服务端按全表引用判断。
 */

/** 把服务端返回的行并入缓存（按 id 覆盖） */
function mergeCache(rows: TradingJournal[]): TradingJournal[] {
  const map = new Map<string, TradingJournal>();
  for (const journal of getState().journals) map.set(journal.id, journal);
  for (const journal of rows) map.set(journal.id, journal);
  return [...map.values()];
}

/** 页面视图里移除一行（删除 / 状态不再匹配当前视图） */
function dropFromPageView(ids: string[]): void {
  const page = getState().journalPage;
  const drop = new Set(ids);
  const next = page.ids.filter(id => !drop.has(id));
  if (next.length === page.ids.length) return;
  useJournalStore.setState({
    journalPage: { ...page, ids: next, total: Math.max(0, page.total - (page.ids.length - next.length)) },
  });
}

/** 把查询条件转成分页参数：空字符串不上行，避免服务端做无意义的空条件筛选 */
function toPageQuery(query: JournalQuery, extra: Partial<JournalPageQuery> = {}): JournalPageQuery {
  return {
    fromDay: query.fromDay || undefined,
    toDay: query.toDay || undefined,
    code: query.code || undefined,
    sort: query.sort,
    ...extra,
  };
}

/** 本地缓存的分页所属资源名 */
const JOURNAL_RESOURCE = 'journal';

function journalQueryKey(status: string, query: JournalQuery, page = 1): string {
  // 页码进入缓存 key：不同页各自缓存，翻回上一页可直接命中
  return `${status}|${query.fromDay}|${query.toDay}|${query.code}|${query.sort}|p${page}`;
}

/** 本地未确认的改动优先：拉回来的服务端旧值不能覆盖尚未提交的行 */
function preferPending(rows: TradingJournal[]): TradingJournal[] {
  if (touched.size === 0) return rows;
  const out: TradingJournal[] = [];
  for (const row of rows) {
    const entry = touched.get(row.id);
    if (!entry) {
      out.push(row);
      continue;
    }
    if (entry.op === 'delete') continue;
    out.push(entry.journal ? migrateJournal(entry.journal) : row);
  }
  return out;
}

/** 本地编辑后同步缓存，避免下次进入页面读到旧值 */
function cacheJournal(journal: TradingJournal): void {
  const datasetId = currentDatasetId;
  if (!datasetId) return;
  void writeRows(datasetId, JOURNAL_RESOURCE, [journal], j => j.id);
}

/** 把新的手动序号写回本地缓存，并按现有 outbox 逐行提交（合并成一次请求） */
async function applyDraftSortValues(updates: Map<string, number>): Promise<void> {
  if (updates.size === 0) return;
  const journals = getState().journals.map(j => {
    const value = updates.get(j.id);
    return value === undefined ? j : { ...j, sortOrder: value };
  });
  useJournalStore.setState({ journals });
  for (const journal of journals) {
    if (!updates.has(journal.id)) continue;
    cacheJournal(journal);
    void markTouched(journal.id, 'upsert');
  }
}

/**
 * 「当前交易」跨页时的整表重编号：
 * 按服务端手动顺序取回全部 draft，把当前页的新顺序替换进去，再整体编号 10,20,30…
 * 草稿是工作队列，数量很小；只有超过一页（>50 条）才会走这里。
 */
async function renumberAllDrafts(dsId: string, pageOrder: string[]): Promise<void> {
  const fetched: TradingJournal[] = [];
  let offset = 0;
  for (let guard = 0; guard < 5; guard += 1) {
    const result = await loadJournalPage(dsId, { status: 'draft', orderBy: 'manual', limit: 200, offset });
    fetched.push(...result.journals.map(migrateJournal));
    if (result.journals.length < 200) break;
    offset += 200;
  }
  const ids = fetched.map(j => j.id);
  const start = ids.indexOf(pageOrder[0]);
  if (start >= 0) ids.splice(start, pageOrder.length, ...pageOrder);

  // 取回的行并入缓存，后续 markTouched 才能取到完整行内容
  const merged = new Map(getState().journals.map(j => [j.id, j]));
  for (const row of fetched) if (!merged.has(row.id)) merged.set(row.id, row);
  useJournalStore.setState({ journals: [...merged.values()] });

  const updates = new Map<string, number>();
  ids.forEach((id, i) => updates.set(id, (i + 1) * 10));
  await applyDraftSortValues(updates);
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
  pendingCount: 0,
  journalPage: { ...EMPTY_PAGE },
  journalQuery: { ...INITIAL_QUERY },
  pageSize: JOURNAL_PAGE_SIZE,

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

    set({
      loading: true,
      error: null,
      syncError: null,
      syncState: 'idle',
      pendingCount: 0,
      journals: [],
      journalPage: { ...EMPTY_PAGE },
      journalQuery: { ...INITIAL_QUERY },
    });
    try {
      // 日志不再预取全表：只取 1 条拿到服务端版本号，真正的数据由各视图按需分页拉取
      const [versionProbe, snapshotData, watchlistData, pending] = await Promise.all([
        loadJournalPage(datasetId, { limit: 1 }),
        loadSnapshots(datasetId),
        loadWatchlist(datasetId),
        outboxList(datasetId),
      ]);
      const snapshots = snapshotData.snapshots;
      snapshotsVersion = snapshotData.version;
      watchlistVersion = watchlistData.version;
      // 阶段名称始终从 fieldConfig 取，快照仅用于历史日志渲染
      const fc = useRecordsStore.getState().fieldConfig;
      const stageNames = fc.journalStrategyConfig?.length ? fc.journalStrategyConfig : DEFAULT_JOURNAL_STAGES;
      const sharedGroups = fc.sharedJournalStrategyGroups ?? DEFAULT_SHARED_STRATEGY_GROUPS;
      const activeStages = buildActiveStages(stageNames, sharedGroups);

      // 出站队列里尚未确认的变更先落到缓存：它们不在任何已拉取的分页里，必须补出来
      const merged = new Map<string, TradingJournal>();
      const recoveredSnapshots: JournalConfigSnapshot[] = [];
      for (const entry of pending) {
        touched.set(entry.journalId, entry);
        if (entry.op === 'delete') {
          merged.delete(entry.journalId);
          continue;
        }
        if (!entry.journal) continue;
        merged.set(entry.journalId, migrateJournal(entry.journal));
        const snap = entry.snapshot;
        if (
          snap &&
          !snapshots.some(s => s.snapshotId === snap.snapshotId) &&
          !recoveredSnapshots.some(s => s.snapshotId === snap.snapshotId)
        ) {
          recoveredSnapshots.push(snap);
        }
      }

      const hasPending = touched.size > 0;
      if (hasPending) firstTouchAt = Date.now();
      set({
        journals: [...merged.values()],
        snapshots: recoveredSnapshots.length ? [...snapshots, ...recoveredSnapshots] : snapshots,
        activeStages,
        watchlist: Array.isArray(watchlistData.watchlist) ? watchlistData.watchlist : [],
        version: versionProbe.version,
        loading: false,
        lastSyncedAt: Date.now(),
        pendingCount: touched.size,
        syncState: hasPending ? 'saving' : 'idle',
      });

      if (hasPending) {
        // 恢复的日志可能引用了只在本地存在的新快照，一并补传
        if (recoveredSnapshots.length) markSnapshotsDirty();
        scheduleFlush();
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载失败', loading: false });
    }
  },

  // 拉取某一视图的指定页（替换当前视图）：服务端分页，前端只保留 id 顺序
  loadPage: async (status, query, datasetId, page = 1) => {
    const dsId = datasetId || currentDatasetId;
    if (!dsId) return;
    currentDatasetId = dsId;
    const nextQuery: JournalQuery = { ...INITIAL_QUERY, ...query };
    const pageSize = get().pageSize || JOURNAL_PAGE_SIZE;
    const targetPage = Math.max(1, Math.trunc(Number(page)) || 1);
    const offset = (targetPage - 1) * pageSize;
    // 缓存 key 带上页码：翻回上一页可以秒开
    const queryKey = journalQueryKey(status, nextQuery, targetPage);
    set({
      journalQuery: nextQuery,
      journalPage: {
        status,
        ids: [],
        total: 0,
        page: targetPage,
        pageSize,
        totalPages: 1,
        loading: true,
        error: null,
      },
    });

    // 先出本地缓存：同一查询同一页再次进入时不必等网络
    const cached = await readPage<TradingJournal>(dsId, JOURNAL_RESOURCE, queryKey);
    if (currentDatasetId !== dsId) return;
    if (cached && cached.items.length > 0) {
      const items = preferPending(cached.items);
      set({
        journals: mergeCache(items),
        version: cached.version,
        journalPage: {
          status,
          ids: items.map(j => j.id),
          total: cached.total,
          page: targetPage,
          pageSize,
          totalPages: Math.max(1, Math.ceil(cached.total / pageSize)),
          loading: true,
          error: null,
        },
      });
    }

    try {
      const result = await loadJournalPage(dsId, toPageQuery(nextQuery, {
        limit: pageSize,
        status,
        offset,
        // 「当前交易」按手动序号排；已存储日志仍按日期
        orderBy: status === 'draft' ? 'manual' : 'date',
      }));
      if (currentDatasetId !== dsId) return;

      const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

      // 版本没变且缓存已有这一页：保留缓存内容，只对齐总数
      if (cached && cached.version === result.version && cached.items.length > 0) {
        set({
          version: result.version,
          journalPage: { ...get().journalPage, total: result.total, totalPages, loading: false },
        });
        return;
      }

      // 页码越界（例如其它页面删除了数据）：回落到最后一页，避免停在空页
      if (result.journals.length === 0 && offset > 0 && targetPage > totalPages) {
        await get().loadPage(status, nextQuery, dsId, totalPages);
        return;
      }

      const rows = preferPending(result.journals.map(migrateJournal));
      set({
        journals: mergeCache(rows),
        version: result.version,
        journalPage: {
          status,
          ids: rows.map(j => j.id),
          total: result.total,
          page: targetPage,
          pageSize,
          totalPages,
          loading: false,
          error: null,
        },
      });
      void writePage({
        datasetId: dsId,
        resource: JOURNAL_RESOURCE,
        queryKey,
        items: rows,
        nextCursor: null,
        total: result.total,
        version: result.version,
        idOf: j => j.id,
      });
    } catch (e) {
      if (currentDatasetId !== dsId) return;
      set({
        journalPage: { ...get().journalPage, loading: false, error: e instanceof Error ? e.message : '读取失败' },
      });
    }
  },

  // 跳到指定页：视图与筛选条件保持不变
  goToPage: async (page, datasetId) => {
    const state = get().journalPage;
    await get().loadPage(state.status, get().journalQuery, datasetId, page);
  },

  // 拖动 / 上移下移后的顺序落库：走现有 outbox，一处提交
  reorderDrafts: async (movedId, nextOrder, datasetId) => {
    const dsId = datasetId || currentDatasetId;
    if (!dsId || nextOrder.length === 0) return;
    currentDatasetId = dsId;
    const state = get();
    const page = state.journalPage;
    const rows = nextOrder
      .map(id => state.journals.find(j => j.id === id))
      .filter((j): j is TradingJournal => !!j);
    const index = nextOrder.indexOf(movedId);
    if (index < 0) return;

    // 视图顺序先乐观更新，不等网络
    set({ journalPage: { ...page, ids: nextOrder } });

    // 跨页时整表重编号，否则页内序号会和其它页冲突
    if (page.totalPages > 1) {
      await renumberAllDrafts(dsId, nextOrder);
      return;
    }

    const valueOf = (row?: TradingJournal) => (typeof row?.sortOrder === 'number' ? row.sortOrder : 0);
    const prev = rows[index - 1];
    const next = rows[index + 1];
    const updates = new Map<string, number>();

    if (prev && next && valueOf(next) - valueOf(prev) > 1e-6) {
      // 取相邻两行中点，只改被移动的这一行
      updates.set(movedId, valueOf(prev) + (valueOf(next) - valueOf(prev)) / 2);
    } else if (prev && !next) {
      updates.set(movedId, valueOf(prev) + 10);
    } else if (!prev && next) {
      updates.set(movedId, valueOf(next) - 10);
    } else if (prev && next) {
      // 中点间隔耗尽（或尚未初始化序号）：单页就是整表，直接按显示顺序重编号
      rows.forEach((row, i) => updates.set(row.id, (i + 1) * 10));
    }

    if (updates.size === 0) return;
    await applyDraftSortValues(updates);
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
    cacheJournal(newJournal);
    // 只有出站队列真正落盘后才删除草稿，避免「提交后刷新」既没推送到服务端也丢了输入
    const durable = await markTouched(newJournal.id, 'upsert');
    if (durable) localStorage.removeItem(`${DRAFT_PREFIX}${draft.entryId}`);
  },

  // 提交日志 → status: 'submitted'（最终态）
  finalizeJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, status: 'submitted' as const } : j
    );
    set({ journals: newJournals });
    // 当前视图是「当前交易」时，提交后该行不再属于本视图
    if (get().journalPage.status === 'draft') dropFromPageView([journalId]);
    const updated = newJournals.find(j => j.id === journalId);
    if (updated) cacheJournal(updated);
    void markTouched(journalId, 'upsert');
  },

  // 撤回提交 → status: 'draft'（回退到中间态，并排到「当前交易」末尾）
  revertJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      // 清掉旧序号，交给服务端按「当前交易」最大值 + 10 重新分配
      j.id === journalId ? { ...j, status: 'draft' as const, sortOrder: undefined } : j
    );
    set({ journals: newJournals });
    // 当前视图是「已存储日志」时，回退后该行不再属于本视图
    if (get().journalPage.status === 'submitted') dropFromPageView([journalId]);
    const updated = newJournals.find(j => j.id === journalId);
    if (updated) cacheJournal(updated);
    void markTouched(journalId, 'upsert');
  },

  // 编辑 draft 日志
  updateDraftJournal: async (journalId: string, partial: Partial<TradingJournal>, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, ...partial } : j
    );
    set({ journals: newJournals });
    const updated = newJournals.find(j => j.id === journalId);
    if (updated) cacheJournal(updated);
    void markTouched(journalId, 'upsert');
  },

  updateJournalRecordId: async (journalId: string, recordId: string | undefined, datasetId: string) => {
    currentDatasetId = datasetId;
    const newJournals = get().journals.map(j =>
      j.id === journalId ? { ...j, recordId } : j
    );
    set({ journals: newJournals });
    const updated = newJournals.find(j => j.id === journalId);
    if (updated) cacheJournal(updated);
    void markTouched(journalId, 'upsert');
  },

  deleteJournal: async (journalId: string, datasetId: string) => {
    currentDatasetId = datasetId;
    set({ journals: get().journals.filter(j => j.id !== journalId) });
    dropFromPageView([journalId]);
    void removeRows(datasetId, JOURNAL_RESOURCE, [journalId]);
    void markTouched(journalId, 'delete');
    // 快照回收需要全表引用判断，已不再由前端执行
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

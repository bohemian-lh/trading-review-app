import { useEffect } from 'react';
import { r2StorageService } from '@/services/r2Service';
import type { RecordsSavePayload } from '@/services/r2Service';
import { useRecordsStore, migrateRecord } from '@/stores/recordsStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { useUIStore } from '@/stores/uiStore';
import { useAnalysisTabStore } from '@/stores/analysisTabStore';
import { useStressTestStore } from '@/stores/stressTestStore';
import {
  DEFAULT_FIELD_CONFIG,
  migrateFieldConfig,
  migrateAnalysisTabGroups,
  type AnalysisTab,
  type StressSeries,
  type MonthlyAnalysis,
  type CycleStats,
  type TradingRecord,
} from '@/types';
import { generateCycleStats } from '@/services/cycleStatsService';
import { fetchStats, recomputeStats } from '@/services/statsService';
import {
  recordsOutboxGet,
  recordsOutboxMerge,
  recordsOutboxClear,
  recordsOutboxReset,
  entryToPayload,
  cycleEntryKey,
} from '@/services/recordsOutbox';
import type { RecordsOutboxEntry } from '@/services/recordsOutbox';

// ─── 增量保存基线 ──────────────────────────────────────────────────
// 记录编辑只上行真正变化的条目：以「上次成功落盘的内容」为基线做差集，
// 避免每次保存都序列化并上传全部记录。
interface RecordsBaseline {
  records: Map<string, string>;
  customAnalysis: string;
  monthly: Map<string, string>;
  monthlyUseCustom: boolean;
  cycleStats: Map<string, string>;
  cycleStatsGeneratedAt: number | null;
}

let recordsBaseline: RecordsBaseline | null = null;

function cycleKey(statType: string, cycleId: string): string {
  return `${statType}::${cycleId}`;
}

function snapshotBaseline(state: any): RecordsBaseline {
  const records = new Map<string, string>();
  for (const record of state.records ?? []) records.set(record.id, JSON.stringify(record));

  const monthly = new Map<string, string>();
  for (const item of state.customMonthly?.data ?? []) monthly.set(item.month, JSON.stringify(item));

  const cycleStats = new Map<string, string>();
  for (const [statType, list] of Object.entries(state.cycleStats ?? {})) {
    for (const item of (list as CycleStats[]) ?? []) {
      cycleStats.set(cycleKey((item as any).statType ?? statType, item.cycleId), JSON.stringify(item));
    }
  }

  return {
    records,
    customAnalysis: JSON.stringify(state.customAnalysis ?? null),
    monthly,
    monthlyUseCustom: !!state.customMonthly?.useCustom,
    cycleStats,
    cycleStatsGeneratedAt: state.cycleStatsGeneratedAt ?? null,
  };
}

/** 计算相对基线的增量；无任何变化时返回 null（不发起请求） */
function buildRecordsPayload(state: any): RecordsSavePayload | null {
  if (!recordsBaseline) recordsBaseline = snapshotBaseline(state);
  const base = recordsBaseline;

  const upserts: TradingRecord[] = [];
  const seenRecords = new Set<string>();
  for (const record of state.records ?? []) {
    seenRecords.add(record.id);
    if (base.records.get(record.id) !== JSON.stringify(record)) upserts.push(record);
  }
  const deletes = [...base.records.keys()].filter(id => !seenRecords.has(id));

  const monthlyUpserts: MonthlyAnalysis[] = [];
  const seenMonths = new Set<string>();
  for (const item of state.customMonthly?.data ?? []) {
    seenMonths.add(item.month);
    if (base.monthly.get(item.month) !== JSON.stringify(item)) monthlyUpserts.push(item);
  }
  const monthlyDeletes = [...base.monthly.keys()].filter(month => !seenMonths.has(month));

  const cycleStatsUpserts: CycleStats[] = [];
  const seenCycles = new Set<string>();
  for (const [statType, list] of Object.entries(state.cycleStats ?? {})) {
    for (const item of (list as CycleStats[]) ?? []) {
      const type = (item as any).statType ?? statType;
      const key = cycleKey(type, item.cycleId);
      seenCycles.add(key);
      const normalized = { ...item, statType: type } as CycleStats;
      if (base.cycleStats.get(key) !== JSON.stringify(normalized)) cycleStatsUpserts.push(normalized);
    }
  }
  const cycleStatsDeletes = [...base.cycleStats.keys()]
    .filter(key => !seenCycles.has(key))
    .map(key => {
      const index = key.indexOf('::');
      return { statType: key.slice(0, index), cycleId: key.slice(index + 2) };
    });

  const customAnalysisChanged = JSON.stringify(state.customAnalysis ?? null) !== base.customAnalysis;
  const monthlyUseCustom = !!state.customMonthly?.useCustom;
  const monthlyUseChanged = monthlyUseCustom !== base.monthlyUseCustom;
  const generatedAtChanged = (state.cycleStatsGeneratedAt ?? null) !== base.cycleStatsGeneratedAt;

  const hasChanges =
    upserts.length > 0 ||
    deletes.length > 0 ||
    monthlyUpserts.length > 0 ||
    monthlyDeletes.length > 0 ||
    cycleStatsUpserts.length > 0 ||
    cycleStatsDeletes.length > 0 ||
    customAnalysisChanged ||
    monthlyUseChanged ||
    generatedAtChanged;

  if (!hasChanges) return null;

  const payload: RecordsSavePayload = { baseVersion: state.version ?? 0 };
  if (upserts.length > 0) payload.upserts = upserts;
  if (deletes.length > 0) payload.deletes = deletes;
  if (customAnalysisChanged) payload.customAnalysis = state.customAnalysis;
  if (monthlyUpserts.length > 0) payload.monthlyUpserts = monthlyUpserts;
  if (monthlyDeletes.length > 0) payload.monthlyDeletes = monthlyDeletes;
  if (monthlyUseChanged) payload.monthlyUseCustom = monthlyUseCustom;
  if (cycleStatsUpserts.length > 0) payload.cycleStatsUpserts = cycleStatsUpserts;
  if (cycleStatsDeletes.length > 0) payload.cycleStatsDeletes = cycleStatsDeletes;
  if (generatedAtChanged) payload.cycleStatsGeneratedAt = state.cycleStatsGeneratedAt ?? null;
  return payload;
}

/** 落盘成功后刷新基线，避免同一批变更被重复提交 */
function commitBaseline(): void {
  recordsBaseline = snapshotBaseline(useRecordsStore.getState());
}

/**
 * 只把「本次实际提交的内容」合并进基线。
 * 保存过程中用户可能又改了别的记录，那些改动不在本次 payload 里，
 * 必须保持脏状态留给下一轮，否则会被误判为已落盘而丢失。
 */
function applyPayloadToBaseline(payload: RecordsSavePayload): void {
  if (!recordsBaseline) return;
  for (const record of payload.upserts ?? []) recordsBaseline.records.set(record.id, JSON.stringify(record));
  for (const id of payload.deletes ?? []) recordsBaseline.records.delete(id);
  if (payload.customAnalysis !== undefined) {
    recordsBaseline.customAnalysis = JSON.stringify(payload.customAnalysis ?? null);
  }
  for (const item of payload.monthlyUpserts ?? []) recordsBaseline.monthly.set(item.month, JSON.stringify(item));
  for (const month of payload.monthlyDeletes ?? []) recordsBaseline.monthly.delete(month);
  if (payload.monthlyUseCustom !== undefined) recordsBaseline.monthlyUseCustom = payload.monthlyUseCustom;
  for (const item of payload.cycleStatsUpserts ?? []) {
    if (!item?.statType || !item?.cycleId) continue;
    recordsBaseline.cycleStats.set(cycleKey(item.statType, item.cycleId), JSON.stringify(item));
  }
  for (const item of payload.cycleStatsDeletes ?? []) {
    recordsBaseline.cycleStats.delete(cycleKey(item.statType, item.cycleId));
  }
  if (payload.cycleStatsGeneratedAt !== undefined) {
    recordsBaseline.cycleStatsGeneratedAt = payload.cycleStatsGeneratedAt ?? null;
  }
}

/** 批量导入等「已在别处落盘」的场景，调用它把基线对齐到当前状态 */
export function markRecordsSynced(): void {
  commitBaseline();
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (datasetId) void recordsOutboxReset(datasetId);
}

/** 把待发队列叠加到服务端快照上，用于刷新后恢复「已改但未确认」的数据 */
function applyOutboxToLoadedState(loaded: any, entry: RecordsOutboxEntry): any {
  const records = new Map<string, TradingRecord>();
  for (const record of loaded.records ?? []) records.set(record.id, record);
  for (const record of Object.values(entry.upserts)) records.set(record.id, record);
  for (const id of Object.keys(entry.deletes)) records.delete(id);

  const monthly = new Map<string, MonthlyAnalysis>();
  for (const item of loaded.customMonthly?.data ?? []) monthly.set(item.month, item);
  for (const item of Object.values(entry.monthlyUpserts)) monthly.set(item.month, item);
  for (const month of Object.keys(entry.monthlyDeletes)) monthly.delete(month);

  const cycles = new Map<string, CycleStats>();
  for (const [statType, list] of Object.entries(loaded.cycleStats ?? {})) {
    for (const item of (list as CycleStats[]) ?? []) {
      cycles.set(cycleEntryKey((item as any).statType ?? statType, item.cycleId), item);
    }
  }
  for (const [key, item] of Object.entries(entry.cycleStatsUpserts)) cycles.set(key, item as CycleStats);
  for (const key of Object.keys(entry.cycleStatsDeletes)) cycles.delete(key);

  const cycleStats: Record<string, CycleStats[]> = {};
  for (const item of cycles.values()) {
    const statType = (item as any).statType ?? '';
    (cycleStats[statType] ||= []).push(item);
  }

  return {
    records: [...records.values()],
    customAnalysis: entry.customAnalysisSet ? entry.customAnalysis : loaded.customAnalysis,
    customMonthly: {
      useCustom: entry.monthlyUseCustom ?? loaded.customMonthly?.useCustom ?? false,
      data: [...monthly.values()],
    },
    cycleStats,
    cycleStatsGeneratedAt: entry.cycleStatsGeneratedAtSet
      ? entry.cycleStatsGeneratedAt
      : loaded.cycleStatsGeneratedAt,
  };
}

async function persistRecords(keepalive = false, retried = false): Promise<void> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) return;

  const delta = buildRecordsPayload(useRecordsStore.getState());
  if (!delta) return;

  // 写前日志：先把变更落盘到本地出站队列，再请求服务端
  const entry = await recordsOutboxMerge(datasetId, delta);
  const payload = entryToPayload(entry, useRecordsStore.getState().version ?? 0);

  useUIStore.getState().setSaving(true);
  try {
    const result = await r2StorageService.saveRecords(datasetId, payload, keepalive);
    if (result.success) {
      useRecordsStore.getState().setVersion(result.version ?? null);
      useUIStore.getState().setError(null);
      // 只把本次提交的内容记为已落盘，保存期间的新改动留给下一轮
      applyPayloadToBaseline(payload);
      await recordsOutboxClear(datasetId, entry.opId);
    } else if (result.conflict && typeof result.version === 'number' && !retried) {
      // 版本被其它页面推进：用服务端返回的版本号把同一批待发变更重放一次，
      // 不覆盖本地状态，避免把用户刚做的改动冲掉。
      useRecordsStore.getState().setVersion(result.version);
      await persistRecords(keepalive, true);
    } else {
      useUIStore.getState().setError(result.error || result.message || '保存失败');
    }
  } catch (e) {
    useUIStore.getState().setError(e instanceof Error ? e.message : '保存失败，请检查网络连接');
  } finally {
    useUIStore.getState().setSaving(false);
  }
}

/**
 * R2 数据同步 Hook
 * - 监听 records/customAnalysis/customMonthly/cycleStats 变化，防抖保存
 * - 提供 loadFromR2 / switchDataset 用于初始化和切换
 */
export function useStoreSync() {
  const records = useRecordsStore(s => s.records);
  const customAnalysis = useRecordsStore(s => s.customAnalysis);
  const customMonthly = useRecordsStore(s => s.customMonthly);
  const cycleStats = useRecordsStore(s => s.cycleStats);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);

  const isInitialized = useUIStore(s => s.isInitialized);

  // 任意数据变化都排进同一条保存流水线：由基线差集决定是否真的发请求。
  // 刻意不依赖 version：它在保存成功后会被写回，若纳入依赖会导致每次保存后再空跑一轮全量比对。
  useEffect(() => {
    if (!isInitialized) return; // 初始化完成前不触发自动保存
    scheduleSaveNow();
  }, [records, customAnalysis, customMonthly, cycleStats, currentDatasetId, isInitialized]);

  // 全局兜底落盘：任意页面关页/切后台都尽量把待保存变更送出去（不局限于数据编辑页）
  useEffect(() => {
    const flush = () => { void flushScheduledSave(true); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}

/**
 * 从 R2 加载数据集列表并初始化
 */
export async function initializeFromR2(): Promise<void> {
  useUIStore.getState().setLoading(true);
  try {
    const datasetsResult = await r2StorageService.getDatasets();
    const datasets = datasetsResult.success ? (datasetsResult.datasets || []) : [];

    if (datasets.length === 0) {
      useDatasetStore.getState().setDatasets([]);
      useUIStore.getState().setInitialized(true);
    } else {
      const firstId = datasets[0].id;
      useDatasetStore.getState().setDatasets(datasets);
      useDatasetStore.getState().setCurrentDatasetId(firstId);
      await loadDatasetData(firstId);
      useUIStore.getState().setInitialized(true);
    }
  } catch (e) {
    useUIStore.getState().setError(e instanceof Error ? e.message : '加载失败');
    useUIStore.getState().setInitialized(true);
  } finally {
    useUIStore.getState().setLoading(false);
  }
}

/**
 * 切换到指定数据集
 */
export async function switchDataset(datasetId: string): Promise<void> {
  // 取消正在进行的防抖保存
  useUIStore.getState().setLoading(true);
  useDatasetStore.getState().setCurrentDatasetId(datasetId);
  await loadDatasetData(datasetId);
  useUIStore.getState().setLoading(false);
}

// 记录按 200 条一页拉取（API 上限），逐页累积后交给 store：
// 统计、压测、导出都基于这份全量数据在浏览器里计算，一个数据集一次会话只拉一遍。
const RECORDS_PAGE_SIZE = 200;
const MAX_PAGES = 5000;

/** 配置 / 页签 / 压测系列各自的服务端版本，用于 CAS 保存 */
const serverVersions = {
  config: new Map<string, number>(),
  tab: new Map<string, number>(),
  stress: new Map<string, number>(),
};

async function fetchAllRecords(datasetId: string): Promise<{ first: any; records: TradingRecord[] }> {
  const records: TradingRecord[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let first: any = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await r2StorageService.getRecords(datasetId, cursor, RECORDS_PAGE_SIZE);
    if (!first) first = result;
    if (!result.success) break;

    // 去重 + 终止保护：服务端若返回重复页，这里不会无限翻页
    let added = 0;
    for (const record of result.records ?? []) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
      added += 1;
    }

    const nextCursor = result.nextCursor ?? null;
    if (!nextCursor || nextCursor === cursor || added === 0) break;
    cursor = nextCursor;
  }

  return { first, records };
}

async function loadDatasetData(datasetId: string): Promise<void> {
  try {
    // 记录分页拉取与配置/页签/压测系列/统计结果并行，减少首屏串行等待
    const [recordPages, configResult, tabsResult, stressResult, statsSnapshot] = (await Promise.all([
      fetchAllRecords(datasetId),
      r2StorageService.getConfig(datasetId),
      r2StorageService.getTabs(datasetId),
      r2StorageService.getStressSeries(datasetId),
      fetchStats(datasetId),
    ])) as any[];

    const result = recordPages.first ?? { success: false };
    const fieldConfig = configResult.success && configResult.config
      ? migrateFieldConfig(configResult.config)
      : { ...DEFAULT_FIELD_CONFIG };

    // 记下服务端版本，保存时用于 CAS
    if (configResult.success) serverVersions.config.set(datasetId, configResult.version ?? 0);
    if (tabsResult.success) serverVersions.tab.set(datasetId, tabsResult.version ?? 0);
    if (stressResult.success) serverVersions.stress.set(datasetId, stressResult.version ?? 0);

    useAnalysisTabStore.getState().setTabs(
      tabsResult.success
        ? (tabsResult.tabs || []).map((t: AnalysisTab) => ({ ...t, groups: migrateAnalysisTabGroups(t) }))
        : []
    );
    useAnalysisTabStore.getState().setActiveTabId(null);

    useStressTestStore.getState().setSeries(
      stressResult.success
        ? (stressResult.series || []).map((s: StressSeries) => ({ ...s, groups: migrateAnalysisTabGroups(s) }))
        : []
    );

    const loaded = result.success
      ? {
          records: (recordPages.records as TradingRecord[]).map(migrateRecord),
          version: result.version || 0,
          customAnalysis: result.customAnalysis || { useCustom: false, data: {} as any },
          customMonthly: result.customMonthly || { useCustom: false, data: [] },
          cycleStats: result.cycleStats || {},
          cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
        }
      : {
          records: [],
          version: 0,
          customAnalysis: { useCustom: false, data: {} as any },
          customMonthly: { useCustom: false, data: [] },
          cycleStats: {},
          cycleStatsGeneratedAt: null,
        };

    // 基线 = 服务端真相；出站队列里未确认的改动叠加后仍保持「脏」，等下一轮提交
    recordsBaseline = snapshotBaseline(loaded);

    const pending = await recordsOutboxGet(datasetId);
    const merged = pending ? applyOutboxToLoadedState(loaded, pending) : loaded;

    // 预计算统计结果（D1）：读取即取数，缺失时由 useAnalysis 回退到浏览器计算
    if (statsSnapshot) {
      useRecordsStore.getState().setStats({
        overview: statsSnapshot.overview ?? null,
        monthly: statsSnapshot.monthly ?? [],
        results: statsSnapshot.analysisResults ?? [],
      });
    } else {
      useRecordsStore.getState().setStats({ overview: null, monthly: [], results: [] });
    }

    // 记录状态最后写入：出站队列里有未确认改动时，统计结果必然已经过期
    useRecordsStore.setState({ ...merged, fieldConfig, statsNeedUpdate: !!pending });

    // 上次没送出去的改动，进入页面后立刻重放
    if (pending) scheduleSaveNow(0);
  } catch (e) {
    useUIStore.getState().setError(e instanceof Error ? e.message : '切换数据集失败');
  }
}

/**
 * 保存 fieldConfig 到 R2
 */
export async function saveFieldConfigToR2(config: any): Promise<{ success: boolean; error?: string }> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) {
    return { success: false, error: '未选择数据集' };
  }

  const baseVersion = serverVersions.config.get(datasetId) ?? null;
  let result = await r2StorageService.saveConfig(datasetId, config, baseVersion);
  if (result.conflict && typeof result.version === 'number') {
    // 版本已被其它页面推进：用新版本号把同一份配置重放一次
    result = await r2StorageService.saveConfig(datasetId, config, result.version);
  }
  if (!result.success) return { success: false, error: result.message || '保存失败' };
  if (typeof result.version === 'number') serverVersions.config.set(datasetId, result.version);
  return { success: true };
}

/**
 * 保存分析页签到 R2
 */
export async function saveTabsToR2(tabs: AnalysisTab[]): Promise<{ success: boolean; error?: string }> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) {
    return { success: false, error: '未选择数据集' };
  }

  const baseVersion = serverVersions.tab.get(datasetId) ?? null;
  let result = await r2StorageService.saveTabs(datasetId, tabs, baseVersion);
  if (result.conflict && typeof result.version === 'number') {
    result = await r2StorageService.saveTabs(datasetId, tabs, result.version);
  }
  if (!result.success) return { success: false, error: result.message || '保存失败' };
  if (typeof result.version === 'number') serverVersions.tab.set(datasetId, result.version);
  return { success: true };
}

/**
 * 保存压测对比系列到 R2
 */
export async function saveStressSeriesToR2(series: StressSeries[]): Promise<{ success: boolean; error?: string }> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) {
    return { success: false, error: '未选择数据集' };
  }

  const baseVersion = serverVersions.stress.get(datasetId) ?? null;
  let result = await r2StorageService.saveStressSeries(datasetId, series, baseVersion);
  if (result.conflict && typeof result.version === 'number') {
    result = await r2StorageService.saveStressSeries(datasetId, series, result.version);
  }
  if (!result.success) return { success: false, error: result.message || '保存失败' };
  if (typeof result.version === 'number') serverVersions.stress.set(datasetId, result.version);
  return { success: true };
}

/**
 * 立即保存（跳过防抖）
 * 只提交相对上次落盘基线的差异；无变化时不发请求。
 */
export async function saveNow(keepalive = false): Promise<void> {
  await persistRecords(keepalive);
}

/**
 * 重新计算统计数据（服务端 SQL）并刷新本地结果。
 * 先落盘记录，保证服务端算的是最新数据；版本冲突（重算期间记录被改动）时保存后重试一次。
 */
export async function refreshStats(
  options: { kinds?: string[]; ids?: string[] } = {},
): Promise<{ ok: boolean; error?: string }> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) return { ok: false, error: '未选择数据集' };

  await saveNow();
  let result = await recomputeStats(datasetId, options);
  if (!result.ok && !result.error) {
    await saveNow();
    result = await recomputeStats(datasetId, options);
  }
  // 未启用 D1：统计回退到浏览器计算，周期统计仍然有效，不报错
  if (!result.ok && result.unsupported) return { ok: true };
  if (!result.ok) return { ok: false, error: result.error || '统计数据更新失败' };

  const snapshot = await fetchStats(datasetId);
  if (snapshot) {
    useRecordsStore.getState().setStats({
      overview: snapshot.overview,
      monthly: snapshot.monthly,
      results: snapshot.analysisResults,
    });
  }
  return { ok: true };
}

/**
 * 独立导出 updateCycleStats（需要 generateCycleStats）
 */
export function updateCycleStats(): void {
  const state = useRecordsStore.getState();
  const cleanRecords = state.records.map(r => ({ ...r, hasCycleStats: false, cycleId: undefined }));
  const { result, updatedRecords } = generateCycleStats(cleanRecords, state.fieldConfig, state.cycleStats);
  useRecordsStore.setState({
    records: updatedRecords,
    cycleStats: result.stats,
    cycleStatsGeneratedAt: result.generatedAt,
    statsNeedUpdate: false,
  });
}

// ─── 合并保存（乐观更新后的后台落盘）───────────────────────────────
let scheduledSaveTimer: ReturnType<typeof setTimeout> | null = null;
let savingInFlight = false;
let saveAgain = false;
let hasScheduledChanges = false;

/** 合并多次保存请求：防抖后只落盘一次最新状态，不阻塞界面 */
export function scheduleSaveNow(delay = 600): void {
  hasScheduledChanges = true;
  if (scheduledSaveTimer) clearTimeout(scheduledSaveTimer);
  scheduledSaveTimer = setTimeout(() => {
    scheduledSaveTimer = null;
    void runScheduledSave();
  }, delay);
}

async function runScheduledSave(): Promise<void> {
  if (savingInFlight) {
    saveAgain = true;
    return;
  }
  hasScheduledChanges = false;
  savingInFlight = true;
  try {
    await saveNow();
  } finally {
    savingInFlight = false;
    if (saveAgain) {
      saveAgain = false;
      scheduleSaveNow(0);
    }
  }
}

/** 立即落盘待保存变更（页面隐藏/卸载时使用，keepalive 降低丢写概率） */
export async function flushScheduledSave(keepalive = false): Promise<void> {
  if (!hasScheduledChanges) return;
  if (scheduledSaveTimer) {
    clearTimeout(scheduledSaveTimer);
    scheduledSaveTimer = null;
  }
  if (savingInFlight) {
    saveAgain = true;
    return;
  }
  hasScheduledChanges = false;
  savingInFlight = true;
  try {
    await saveNow(keepalive);
  } finally {
    savingInFlight = false;
    if (saveAgain) {
      saveAgain = false;
      scheduleSaveNow(0);
    }
  }
}

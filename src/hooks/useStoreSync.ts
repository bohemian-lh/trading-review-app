import { useEffect } from 'react';
import { r2StorageService } from '@/services/r2Service';
import type { RecordsSavePayload } from '@/services/r2Service';
import { useRecordsStore, migrateRecord, RECORDS_PAGE_SIZE, DEFAULT_RECORD_QUERY } from '@/stores/recordsStore';
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
  type TradingRecord,
} from '@/types';
import { fetchStats, recomputeStats } from '@/services/statsService';
import {
  recordsOutboxGet,
  recordsOutboxMerge,
  recordsOutboxClear,
  recordsOutboxReset,
  entryHasChanges,
  entryToPayload,
} from '@/services/recordsOutbox';
import type { RecordsOutboxEntry } from '@/services/recordsOutbox';

// ─── 增量保存基线 ──────────────────────────────────────────────────
// 记录本身已改为「按 id 待写集合」（recordsStore.pendingUpserts / pendingDeletes），
// 这里只跟踪不适合做待写集合的小集合：自定义分析、月度数据。
interface RecordsBaseline {
  customAnalysis: string;
  monthly: Map<string, string>;
  monthlyUseCustom: boolean;
}

let recordsBaseline: RecordsBaseline | null = null;

function snapshotBaseline(state: any): RecordsBaseline {
  const monthly = new Map<string, string>();
  for (const item of state.customMonthly?.data ?? []) monthly.set(item.month, JSON.stringify(item));

  return {
    customAnalysis: JSON.stringify(state.customAnalysis ?? null),
    monthly,
    monthlyUseCustom: !!state.customMonthly?.useCustom,
  };
}

/** 只上行本地待写集合；不再遍历全表做差集 */
function buildRecordsPayload(state: any): RecordsSavePayload | null {
  if (!recordsBaseline) recordsBaseline = snapshotBaseline(state);
  const base = recordsBaseline;

  const upserts: TradingRecord[] = Object.values(state.pendingUpserts ?? {});
  const deletes = Object.keys(state.pendingDeletes ?? {});

  const monthlyUpserts: MonthlyAnalysis[] = [];
  const seenMonths = new Set<string>();
  for (const item of state.customMonthly?.data ?? []) {
    seenMonths.add(item.month);
    if (base.monthly.get(item.month) !== JSON.stringify(item)) monthlyUpserts.push(item);
  }
  const monthlyDeletes = [...base.monthly.keys()].filter(month => !seenMonths.has(month));

  const customAnalysisChanged = JSON.stringify(state.customAnalysis ?? null) !== base.customAnalysis;
  const monthlyUseCustom = !!state.customMonthly?.useCustom;
  const monthlyUseChanged = monthlyUseCustom !== base.monthlyUseCustom;

  const hasChanges =
    upserts.length > 0 ||
    deletes.length > 0 ||
    monthlyUpserts.length > 0 ||
    monthlyDeletes.length > 0 ||
    customAnalysisChanged ||
    monthlyUseChanged;

  if (!hasChanges) return null;

  const payload: RecordsSavePayload = { baseVersion: state.version ?? 0 };
  if (upserts.length > 0) payload.upserts = upserts;
  if (deletes.length > 0) payload.deletes = deletes;
  if (customAnalysisChanged) payload.customAnalysis = state.customAnalysis;
  if (monthlyUpserts.length > 0) payload.monthlyUpserts = monthlyUpserts;
  if (monthlyDeletes.length > 0) payload.monthlyDeletes = monthlyDeletes;
  if (monthlyUseChanged) payload.monthlyUseCustom = monthlyUseCustom;
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
  if (payload.customAnalysis !== undefined) {
    recordsBaseline.customAnalysis = JSON.stringify(payload.customAnalysis ?? null);
  }
  for (const item of payload.monthlyUpserts ?? []) recordsBaseline.monthly.set(item.month, JSON.stringify(item));
  for (const month of payload.monthlyDeletes ?? []) recordsBaseline.monthly.delete(month);
  if (payload.monthlyUseCustom !== undefined) recordsBaseline.monthlyUseCustom = payload.monthlyUseCustom;
}

/** 批量导入等「已在别处落盘」的场景，调用它把基线对齐到当前状态 */
export function markRecordsSynced(): void {
  commitBaseline();
  useRecordsStore.getState().clearPendingRecords();
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (datasetId) void recordsOutboxReset(datasetId);
}

/** 出站队列 → 待写集合：刷新后恢复「已改但未确认」的记录 */
function pendingFromOutbox(entry: RecordsOutboxEntry | null): {
  pendingUpserts: Record<string, TradingRecord>;
  pendingDeletes: Record<string, true>;
} {
  return {
    pendingUpserts: { ...(entry?.upserts ?? {}) },
    pendingDeletes: { ...(entry?.deletes ?? {}) },
  };
}

/** 服务端行 + 本地待写覆盖 */
function applyPendingToRows(
  rows: TradingRecord[],
  pendingUpserts: Record<string, TradingRecord>,
  pendingDeletes: Record<string, true>,
): TradingRecord[] {
  const map = new Map(rows.filter(r => !pendingDeletes[r.id]).map(r => [r.id, r]));
  for (const record of Object.values(pendingUpserts)) map.set(record.id, record);
  return [...map.values()];
}

/**
 * 出站队列里未确认的自定义分析 / 月度数据叠加到服务端快照上。
 * 只返回这两类集合：周期统计由 /api/stats 负责，不能被记录接口的 meta 覆盖。
 */
function applyOutboxCollections(
  loaded: any,
  entry: RecordsOutboxEntry | null,
): { customAnalysis: any; customMonthly: any } {
  if (!entry) return { customAnalysis: loaded.customAnalysis, customMonthly: loaded.customMonthly };

  const monthly = new Map<string, MonthlyAnalysis>();
  for (const item of loaded.customMonthly?.data ?? []) monthly.set(item.month, item);
  for (const item of Object.values(entry.monthlyUpserts)) monthly.set(item.month, item);
  for (const month of Object.keys(entry.monthlyDeletes)) monthly.delete(month);

  return {
    customAnalysis: entry.customAnalysisSet ? entry.customAnalysis : loaded.customAnalysis,
    customMonthly: {
      useCustom: entry.monthlyUseCustom ?? loaded.customMonthly?.useCustom ?? false,
      data: [...monthly.values()],
    },
  };
}

async function persistRecords(keepalive = false, retried = false): Promise<void> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) return;

  const state = useRecordsStore.getState();
  const delta = buildRecordsPayload(state);

  // 内存里没有新差异时，仍要看一眼出站队列：上一次请求可能已在服务端成功但响应丢失
  const stored = await recordsOutboxGet(datasetId);
  if (!delta && !(stored && entryHasChanges(stored))) return;
  const entry = delta ? await recordsOutboxMerge(datasetId, delta) : stored!;
  if (!entryHasChanges(entry)) return;
  const payload = entryToPayload(entry, state.version ?? 0);

  useUIStore.getState().setSaving(true);
  try {
    const result = await r2StorageService.saveRecords(datasetId, payload, keepalive);
    if (result.success) {
      saveRetryCount = 0;
      // 请求返回时已经切到别的数据集：只清理本数据集的 outbox，
      // 不要用旧库的 payload 去动当前库的基线与待写集合
      if (useDatasetStore.getState().currentDatasetId !== datasetId) {
        await recordsOutboxClear(datasetId, entry.opId);
        return;
      }
      useRecordsStore.getState().setVersion(result.version ?? null);
      useUIStore.getState().setError(null);
      // 只把本次提交的内容记为已落盘，保存期间的新改动留给下一轮
      applyPayloadToBaseline(payload);
      useRecordsStore.getState().ackPendingRecords(payload.upserts ?? [], payload.deletes ?? []);
      await recordsOutboxClear(datasetId, entry.opId);
      // 删除会让当前页缺行、甚至页码越界：服务端确认后回填一次
      if ((payload.deletes ?? []).length > 0) {
        const latest = useRecordsStore.getState();
        void latest.loadRecordPage(datasetId, { offset: latest.recordPage.offset });
      }
    } else if (result.conflict && typeof result.version === 'number' && !retried) {
      // 版本被其它页面推进：用服务端返回的版本号把同一批待发变更重放一次，
      // 不覆盖本地状态，避免把用户刚做的改动冲掉。
      useRecordsStore.getState().setVersion(result.version);
      await persistRecords(keepalive, true);
    } else {
      scheduleSaveRetry(result.error || result.message || '保存失败');
    }
  } catch (e) {
    scheduleSaveRetry(e instanceof Error ? e.message : '保存失败，请检查网络连接');
  } finally {
    useUIStore.getState().setSaving(false);
  }
}

/**
 * 保存失败退避重试：改动此时只活在内存与 outbox 里，不主动重试就要等到下一次编辑
 * 或刷新页面才会再次上行。重试次数有上限，耗尽后把错误显式抛给用户。
 */
const MAX_SAVE_RETRIES = 4;
let saveRetryCount = 0;

function scheduleSaveRetry(message: string): void {
  saveRetryCount += 1;
  if (saveRetryCount <= MAX_SAVE_RETRIES) {
    useUIStore.getState().setError(`${message}（正在重试 ${saveRetryCount}/${MAX_SAVE_RETRIES}）`);
    scheduleSaveNow(1000 * 2 ** (saveRetryCount - 1));
    return;
  }
  saveRetryCount = 0;
  useUIStore.getState().setError(`${message}（已重试 ${MAX_SAVE_RETRIES} 次，请检查网络后重新编辑）`);
}

/** 等待在飞的保存结束，供「切数据集 / 重新加载」等必须落盘的场景使用 */
async function waitForSaveIdle(): Promise<void> {
  while (savingInFlight) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * R2 数据同步 Hook
 * - 监听 records/customAnalysis/customMonthly/cycleStats 变化，防抖保存
 * - 提供 loadFromR2 / switchDataset 用于初始化和切换
 */
export function useStoreSync() {
  const pendingUpserts = useRecordsStore(s => s.pendingUpserts);
  const pendingDeletes = useRecordsStore(s => s.pendingDeletes);
  const customAnalysis = useRecordsStore(s => s.customAnalysis);
  const customMonthly = useRecordsStore(s => s.customMonthly);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);

  const isInitialized = useUIStore(s => s.isInitialized);

  // 只有待写集合 / 自定义集合变化才排保存：翻页加载不会再触发空跑
  // 刻意不依赖 version：它在保存成功后会被写回，若纳入依赖会导致每次保存后再跑一轮。
  useEffect(() => {
    if (!isInitialized) return; // 初始化完成前不触发自动保存
    scheduleSaveNow();
  }, [pendingUpserts, pendingDeletes, customAnalysis, customMonthly, currentDatasetId, isInitialized]);

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
 * 切换到指定数据集。
 * 必须先落盘当前数据集的待保存变更：切换后内存 pending 会被新数据集的出站队列替换，
 * 未落盘的改动既不在 outbox 也不在服务端，会直接丢失。
 */
export async function switchDataset(datasetId: string): Promise<void> {
  useUIStore.getState().setLoading(true);
  // 先等在飞的保存结束，再把当前数据集的待保存变更落盘（写入 outbox 是本地操作，很快）。
  // 加超时兜底：网络挂起时不能把切换数据集永久卡住 —— 此时改动已在 outbox 里，
  // 下次打开旧数据集会自动重放，不会丢。
  await withTimeout(waitForSaveIdle(), 5000);
  await withTimeout(saveNow(), 5000);
  useDatasetStore.getState().setCurrentDatasetId(datasetId);
  await loadDatasetData(datasetId);
  useUIStore.getState().setLoading(false);
}

/** 给必须等待但对失败不敏感的操作加超时上限 */
function withTimeout(task: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    task.then(() => undefined).catch(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, ms)),
  ]);
}

// 首屏只取一页；翻页按需请求（recordsStore.loadRecordPage），导出时才 fetchAllRecords
const MAX_PAGES = 5000;

/** 配置 / 页签 / 压测系列各自的服务端版本，用于 CAS 保存 */
const serverVersions = {
  config: new Map<string, number>(),
  tab: new Map<string, number>(),
  stress: new Map<string, number>(),
};

/**
 * 明确需要全量时才调用（导出、字段配置批量重映射、整体覆盖）。
 * 用户主动触发的动作，循环翻页拉完即用，不常驻内存。
 */
export async function fetchAllRecords(datasetId: string): Promise<TradingRecord[]> {
  const records: TradingRecord[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await r2StorageService.getRecords(datasetId, { cursor, limit: 200, sort: 'desc' });
    if (!result.success) break;

    // 去重 + 终止保护：服务端若返回重复页，这里不会无限翻页
    let added = 0;
    for (const record of result.records ?? []) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(migrateRecord(record));
      added += 1;
    }

    const nextCursor = result.nextCursor ?? null;
    if (!nextCursor || nextCursor === cursor || added === 0) break;
    cursor = nextCursor;
  }

  return records;
}

async function loadDatasetData(datasetId: string): Promise<void> {
  // 切库瞬间先清掉上一个数据集的内存视图：避免旧库的行/筛选在异步加载期间被写回，
  // 也避免写路径把旧库的 pending 当成新库的数据上行。
  useRecordsStore.getState().resetRecordView();
  try {
    // 首屏只拉一页记录（带 meta 拿版本/月份选项），其余配置/页签/压测/统计并行
    const initialPageSize = useRecordsStore.getState().recordPage.pageSize || RECORDS_PAGE_SIZE;
    const [recordPage, configResult, tabsResult, stressResult, statsSnapshot, pending] = await Promise.all([
      r2StorageService.getRecords(datasetId, { limit: initialPageSize, sort: 'desc', meta: true }),
      r2StorageService.getConfig(datasetId),
      r2StorageService.getTabs(datasetId),
      r2StorageService.getStressSeries(datasetId),
      fetchStats(datasetId),
      recordsOutboxGet(datasetId),
    ]);

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

    const serverRecords = recordPage.success
      ? (recordPage.records ?? []).map(migrateRecord)
      : [];

    const loaded = {
      version: recordPage.version || 0,
      customAnalysis: recordPage.customAnalysis || { useCustom: false, data: {} as any },
      customMonthly: recordPage.customMonthly || { useCustom: false, data: [] },
    };

    // 基线 = 服务端真相；出站队列里未确认的改动叠加后仍保持「脏」，等下一轮提交
    recordsBaseline = snapshotBaseline(loaded);

    const collections = applyOutboxCollections(loaded, pending);
    const { pendingUpserts, pendingDeletes } = pendingFromOutbox(pending);

    // 预计算统计结果（D1）：读取即取数
    if (statsSnapshot) {
      useRecordsStore.getState().setStats({
        overview: statsSnapshot.overview ?? null,
        monthly: statsSnapshot.monthly ?? [],
        results: statsSnapshot.analysisResults ?? [],
        cycles: statsSnapshot.cycleStats ?? {},
        cycleStatsGeneratedAt: statsSnapshot.cycleStatsGeneratedAt ?? null,
        stale: statsSnapshot.staleKinds ?? [],
      });
    } else {
      useRecordsStore.getState().setStats({ overview: null, monthly: [], results: [], cycles: {}, stale: [] });
    }
    const statsStale = statsSnapshot?.staleKinds ?? [];

    // 本地新建但还没上行成功的行，服务端页里没有，补到视图最前面
    const pageIds = serverRecords.filter(r => !pendingDeletes[r.id]).map(r => r.id);
    const seenIds = new Set(pageIds);
    const offlineIds = Object.keys(pendingUpserts).filter(id => !seenIds.has(id) && !pendingDeletes[id]);

    useRecordsStore.setState({
      records: applyPendingToRows(serverRecords, pendingUpserts, pendingDeletes),
      recordPage: {
        ids: [...offlineIds, ...pageIds],
        total: typeof recordPage.total === 'number' ? recordPage.total : serverRecords.length,
        datasetTotal: typeof recordPage.datasetTotal === 'number' ? recordPage.datasetTotal : serverRecords.length,
        months: recordPage.months ?? [],
        offset: 0,
        pageSize: initialPageSize,
        loading: false,
        error: recordPage.success ? null : (recordPage.message || '读取记录失败'),
      },
      // 切数据集：查询条件回到默认，避免把上一个数据集的筛选带到新数据集
      recordQuery: { ...DEFAULT_RECORD_QUERY },
      // 版本必须同步到新数据集，否则下一次保存会带着旧库版本号必然冲突
      version: typeof recordPage.version === 'number' ? recordPage.version : null,
      pendingUpserts,
      pendingDeletes,
      ...collections,
      fieldConfig,
      // 待保存改动或统计落后都算“需要更新统计”
      statsNeedUpdate: statsStale.length > 0 || (!!pending && entryHasChanges(pending)),
    });

    // 上次没送出去的改动，进入页面后立刻重放
    if (pending && entryHasChanges(pending)) scheduleSaveNow(0);
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
  // 未启用 D1：统计不可用（R2 模式已停用），不视为错误
  if (!result.ok && result.unsupported) return { ok: true };
  if (!result.ok) return { ok: false, error: result.error || '统计数据更新失败' };

  const snapshot = await fetchStats(datasetId);
  if (snapshot) {
    useRecordsStore.getState().setStats({
      overview: snapshot.overview,
      monthly: snapshot.monthly,
      results: snapshot.analysisResults,
      cycles: snapshot.cycleStats,
      cycleStatsGeneratedAt: snapshot.cycleStatsGeneratedAt,
      stale: snapshot.staleKinds,
    });
  }
  return { ok: true };
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

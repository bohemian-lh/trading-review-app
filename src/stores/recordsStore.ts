import { create } from 'zustand';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, CustomAnalysisData, CustomMonthlyData, CycleStats, FieldConfig, StatOverview, AnalysisSeriesResult } from '@/types';
import { DEFAULT_FIELD_CONFIG } from '@/types';
import { generateId } from '@/utils';
import { normalizeTheoreticalValue } from '@/utils/theoreticalRatio';
import { r2StorageService } from '@/services/r2Service';

/** 一页 50 条（与表格分页一致）：一次只取当前页，跳页再请求 */
export const RECORDS_PAGE_SIZE = 50;

/** 记录分页视图：只存 id 顺序与分页信息，行内容统一放 records 缓存 */
export interface RecordPageState {
  ids: string[];
  /** 当前筛选条件下的总条数（服务端 COUNT） */
  total: number;
  /** 数据集全量条数（不受筛选影响） */
  datasetTotal: number;
  /** 月份筛选项（YYYYMM），服务端首页下发 */
  months: string[];
  /** 当前页起点，等于 (页码 - 1) * pageSize */
  offset: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
}

/** 记录列表的筛选与排序条件（全部下推服务端） */
export interface RecordQuery {
  sortKey: 'openDate' | 'stockCode';
  sort: 'asc' | 'desc';
  fromDay: string;
  toDay: string;
  code: string;
  keyword: string;
  tradingType: string;
  trendFeature: string;
  patternFeature: string;
}

const INITIAL_RECORD_PAGE: RecordPageState = {
  ids: [],
  total: 0,
  datasetTotal: 0,
  months: [],
  offset: 0,
  pageSize: RECORDS_PAGE_SIZE,
  loading: false,
  error: null,
};

/** 默认查询：无筛选、按开单日倒序 */
export const DEFAULT_RECORD_QUERY: RecordQuery = {
  sortKey: 'openDate',
  sort: 'desc',
  fromDay: '',
  toDay: '',
  code: '',
  keyword: '',
  tradingType: '',
  trendFeature: '',
  patternFeature: '',
};

/** 当前数据集：分页请求返回时用于丢弃跨数据集的过期响应 */
let activeDatasetId: string | null = null;

function toPageQuery(query: RecordQuery, extra: Record<string, unknown> = {}) {
  return {
    sortKey: query.sortKey,
    sort: query.sort,
    fromDay: query.fromDay || undefined,
    toDay: query.toDay || undefined,
    code: query.code || undefined,
    keyword: query.keyword || undefined,
    tradingType: query.tradingType || undefined,
    trendFeature: query.trendFeature || undefined,
    patternFeature: query.patternFeature || undefined,
    ...extra,
  };
}

/** 服务端行并入缓存：本地未确认的改动（编辑/删除）优先，不被旧值覆盖 */
function mergeRowCache(
  cache: TradingRecord[],
  rows: TradingRecord[],
  pendingUpserts: Record<string, TradingRecord>,
  pendingDeletes: Record<string, true>,
): TradingRecord[] {
  const map = new Map(cache.map(r => [r.id, r]));
  for (const row of rows) {
    if (pendingUpserts[row.id] || pendingDeletes[row.id]) continue;
    map.set(row.id, row);
  }
  return [...map.values()];
}

/** 归一化理论盈亏字段：±999 / 'NULL' / 'N/A' → null；未填保持缺失 */
function normalizeTheoreticalMap(map: any): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const normalized = normalizeTheoreticalValue(value);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

/** 迁移旧数据：entryType → trendFeatures；isSystem → patternFeatures；丢弃已删除的旧字段 */
export function migrateRecord(r: any): TradingRecord {
  const { entryType, isSystem, ...rest } = r;
  delete rest.subsequentProfitSpace;
  delete rest.theoreticalProfitPercent;
  const trendFeatures = r.trendFeatures ?? entryType;
  const patternFeatures = r.patternFeatures ?? (isSystem === '是' ? ['系统'] : isSystem === '否' ? ['非系统'] : []);
  return {
    ...rest,
    trendFeatures: typeof trendFeatures === 'string'
      ? [trendFeatures]
      : (Array.isArray(trendFeatures) && trendFeatures.length > 0 ? trendFeatures : ['未知']),
    patternFeatures: Array.isArray(patternFeatures) ? patternFeatures : [],
    hasCycleStats: r.hasCycleStats ?? false,
    hasMonthlyStats: r.hasMonthlyStats ?? false,
    positionSize: typeof r.positionSize === 'number' ? Math.min(100, Math.max(0, r.positionSize)) : 33,
    theoreticalProfitRatios: normalizeTheoreticalMap(r.theoreticalProfitRatios),
    theoreticalProfitDeltas: normalizeTheoreticalMap(r.theoreticalProfitDeltas),
  };
}

interface RecordsState {
  /** 已加载行缓存：按需拉取过的分页 + 本地新增/编辑的行，不再是整表 */
  records: TradingRecord[];
  /** 当前列表视图：id 顺序 + 分页信息 */
  recordPage: RecordPageState;
  recordQuery: RecordQuery;
  /** 统计结果落后的类别（服务端 source_version 对比得出） */
  statsStale: string[];
  /** 尚未被服务端确认的写入，保存时只上行这些 */
  pendingUpserts: Record<string, TradingRecord>;
  pendingDeletes: Record<string, true>;
  fieldConfig: FieldConfig;
  customAnalysis: CustomAnalysisData;
  customMonthly: CustomMonthlyData;
  cycleStats: Record<string, CycleStats[]>;
  cycleStatsGeneratedAt: number | null;
  statsNeedUpdate: boolean;
  version: number | null;
  /** 预计算统计结果：总览宽表 */
  statOverview: StatOverview | null;
  /** 预计算统计结果：月度宽表 */
  statMonthly: MonthlyAnalysis[];
  /** 预计算统计结果：`${configKind}:${configId}` → 序列结果 */
  analysisResults: Record<string, AnalysisSeriesResult>;

  /** 拉一页记录；`meta` 只在需要刷新版本/月份选项/全量条数时带（首屏、导入后） */
  loadRecordPage: (
    datasetId: string,
    query?: Partial<RecordQuery> & { offset?: number; meta?: boolean },
  ) => Promise<void>;
  /** 切数据集时清空视图与查询条件，避免旧库的行/筛选残留 */
  resetRecordView: () => void;
  /** 每页条数：改完回到第一页重新请求 */
  setRecordPageSize: (size: number) => void;
  ackPendingRecords: (upserts: TradingRecord[], deletes: string[]) => void;
  clearPendingRecords: () => void;

  addRecord: (record: Omit<TradingRecord, 'id' | 'hasCycleStats' | 'hasMonthlyStats'>) => void;
  updateRecord: (id: string, updates: Partial<TradingRecord>) => void;
  deleteRecord: (id: string) => void;

  setCustomAnalysis: (data: CustomAnalysisData) => void;
  updateCustomAnalysisField: (field: keyof AnalysisResult, value: number | 'N/A') => void;
  toggleUseCustomAnalysis: () => void;

  setCustomMonthly: (data: CustomMonthlyData) => void;
  addCustomMonthly: (item: MonthlyAnalysis) => void;
  updateCustomMonthly: (month: string, updates: Partial<MonthlyAnalysis>) => void;
  deleteCustomMonthly: (month: string) => void;
  toggleUseCustomMonthly: () => void;

  setFieldConfig: (config: FieldConfig) => void;

  setVersion: (version: number | null) => void;
  setStats: (snapshot: {
    overview: StatOverview | null;
    monthly: MonthlyAnalysis[];
    results: AnalysisSeriesResult[];
    /** 周期统计：结果表里的一行一个周期 */
    cycles?: Record<string, CycleStats[]>;
    cycleStatsGeneratedAt?: number | null;
    /** 结果落后于记录的类别（overview / month / dimension / tab / stress / cycle） */
    stale?: string[];
  }) => void;
}

const emptyAnalysis: AnalysisResult = {
  systemProfitRatio: 'N/A', systemNoMistakeProfitRatio: 'N/A', systemWithMistakeProfitRatio: 'N/A',
  nonSystemProfitRatio: 'N/A', systemProfitAvgHoldDays: 'N/A', systemLossAvgHoldDays: 'N/A',
  nonSystemProfitAvgHoldDays: 'N/A', nonSystemLossAvgHoldDays: 'N/A',
  tradingTypeRatios: {}, trendFeatureRatios: {}, aggregateRatios: {},
  theoreticalProfitRatios: {},
};

export const emptyCycleStats: Record<string, CycleStats[]> = {};

export const useRecordsStore = create<RecordsState>((set, get) => ({
  records: [],
  recordPage: { ...INITIAL_RECORD_PAGE },
  recordQuery: { ...DEFAULT_RECORD_QUERY },
  pendingUpserts: {},
  pendingDeletes: {},
  fieldConfig: { ...DEFAULT_FIELD_CONFIG },
  customAnalysis: { useCustom: false, data: { ...emptyAnalysis } },
  customMonthly: { useCustom: false, data: [] },
  cycleStats: emptyCycleStats,
  cycleStatsGeneratedAt: null,
  statsNeedUpdate: false,
  version: null,
  statOverview: null,
  statMonthly: [],
  analysisResults: {},
  statsStale: [],

  // 拉取一页（替换当前视图）：筛选、排序、页码全部下推服务端
  loadRecordPage: async (datasetId, query) => {
    activeDatasetId = datasetId;
    const { offset, meta, ...queryPatch } = query ?? {};
    const nextQuery: RecordQuery = { ...get().recordQuery, ...queryPatch };
    const pageSize = get().recordPage.pageSize || RECORDS_PAGE_SIZE;
    const nextOffset = typeof offset === 'number' && offset >= 0
      ? Math.trunc(offset)
      : queryPatch.fromDay !== undefined
        || queryPatch.toDay !== undefined
        || queryPatch.code !== undefined
        || queryPatch.keyword !== undefined
        || queryPatch.tradingType !== undefined
        || queryPatch.trendFeature !== undefined
        || queryPatch.patternFeature !== undefined
        || queryPatch.sort !== undefined
        || queryPatch.sortKey !== undefined
        ? 0
        : get().recordPage.offset;

    set({
      recordQuery: nextQuery,
      // 保留上一页的行直到新页到达：避免切筛选/翻页时表格先闪成空表
      recordPage: { ...get().recordPage, offset: nextOffset, loading: true, error: null },
    });
    try {
      const page = await r2StorageService.getRecords(datasetId, toPageQuery(nextQuery, {
        limit: pageSize,
        offset: nextOffset,
        meta: !!meta,
      }));
      if (activeDatasetId !== datasetId) return;
      if (!page.success) throw new Error(page.message || '读取记录失败');
      const rows = (page.records ?? []).map(migrateRecord);
      const total = typeof page.total === 'number' ? page.total : rows.length;
      set((s) => ({
        records: mergeRowCache(s.records, rows, s.pendingUpserts, s.pendingDeletes),
        version: typeof page.version === 'number' ? page.version : s.version,
        recordPage: {
          ids: rows.filter(r => !s.pendingDeletes[r.id]).map(r => r.id),
          total,
          // 元信息只在首页下发，翻页时沿用上一次的值
          datasetTotal: typeof page.datasetTotal === 'number' ? page.datasetTotal : s.recordPage.datasetTotal,
          months: page.months ?? s.recordPage.months,
          offset: nextOffset,
          pageSize,
          loading: false,
          error: null,
        },
      }));
      // 删到当前页为空时自动回退一页，避免停在越界页码上
      if (rows.length === 0 && nextOffset > 0) {
        await get().loadRecordPage(datasetId, { offset: Math.max(0, nextOffset - pageSize) });
      }
    } catch (e) {
      if (activeDatasetId !== datasetId) return;
      set({
        recordPage: { ...get().recordPage, loading: false, error: e instanceof Error ? e.message : '读取失败' },
      });
    }
  },

  resetRecordView: () => set((s) => ({
    records: [],
    recordPage: { ...INITIAL_RECORD_PAGE, pageSize: s.recordPage.pageSize },
    recordQuery: { ...DEFAULT_RECORD_QUERY },
  })),

  setRecordPageSize: (size) => {
    const pageSize = Math.min(200, Math.max(1, Math.trunc(size)));
    set((s) => ({ recordPage: { ...s.recordPage, pageSize, offset: 0 } }));
    const datasetId = activeDatasetId;
    if (datasetId) void get().loadRecordPage(datasetId, { offset: 0 });
  },

  // 服务端确认后清空已提交的待写项；请求飞行期间又改过的行保留到下一轮
  ackPendingRecords: (upserts, deletes) => {
    set((s) => {
      const pendingUpserts = { ...s.pendingUpserts };
      for (const record of upserts) {
        const current = pendingUpserts[record.id];
        if (current && JSON.stringify(current) !== JSON.stringify(record)) continue;
        delete pendingUpserts[record.id];
      }
      const pendingDeletes = { ...s.pendingDeletes };
      for (const id of deletes) delete pendingDeletes[id];
      return { pendingUpserts, pendingDeletes };
    });
  },

  clearPendingRecords: () => set({ pendingUpserts: {}, pendingDeletes: {} }),

  addRecord: (recordData) => {
    const newRecord: TradingRecord = { ...recordData, id: generateId(), hasCycleStats: false, hasMonthlyStats: false };
    set((s) => ({
      records: [...s.records, newRecord],
      pendingUpserts: { ...s.pendingUpserts, [newRecord.id]: newRecord },
      // 新行按开单日倒序应排在最前（表格默认倒序），先插到视图首行
      recordPage: {
        ...s.recordPage,
        ids: [newRecord.id, ...s.recordPage.ids],
        total: s.recordPage.total + 1,
        datasetTotal: s.recordPage.datasetTotal + 1,
      },
      statsNeedUpdate: true,
    }));
  },

  // 行不在当前页缓存里（例如编辑弹窗打开后翻过页）也要能落进待写集合
  updateRecord: (id, updates) => {
    const current = get().records.find(r => r.id === id) ?? get().pendingUpserts[id];
    const updated = (current ? { ...current, ...updates } : { ...updates, id }) as TradingRecord;
    set((s) => ({
      records: s.records.map(r => r.id === id ? { ...r, ...updates } : r),
      pendingUpserts: { ...s.pendingUpserts, [id]: updated },
      statsNeedUpdate: true,
    }));
  },

  deleteRecord: (id) => {
    set((s) => {
      const pendingUpserts = { ...s.pendingUpserts };
      delete pendingUpserts[id];
      // 只有该行确实在当前视图里，才需要扣减两个计数
      const inView = s.recordPage.ids.includes(id);
      return {
        records: s.records.filter(r => r.id !== id),
        pendingUpserts,
        pendingDeletes: { ...s.pendingDeletes, [id]: true },
        recordPage: {
          ...s.recordPage,
          ids: s.recordPage.ids.filter(x => x !== id),
          total: inView ? Math.max(0, s.recordPage.total - 1) : s.recordPage.total,
          datasetTotal: Math.max(0, s.recordPage.datasetTotal - 1),
        },
        statsNeedUpdate: true,
      };
    });
  },

  setCustomAnalysis: (data) => set({ customAnalysis: data }),
  updateCustomAnalysisField: (field, value) => {
    set((s) => ({ customAnalysis: { ...s.customAnalysis, data: { ...s.customAnalysis.data, [field]: value } } }));
  },
  toggleUseCustomAnalysis: () => {
    set((s) => ({ customAnalysis: { ...s.customAnalysis, useCustom: !s.customAnalysis.useCustom } }));
  },

  setCustomMonthly: (data) => set({ customMonthly: data }),
  addCustomMonthly: (item) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: [...s.customMonthly.data, item] } }));
  },
  updateCustomMonthly: (month, updates) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.map(i => i.month === month ? { ...i, ...updates } : i) } }));
  },
  deleteCustomMonthly: (month) => {
    set((s) => ({ customMonthly: { ...s.customMonthly, data: s.customMonthly.data.filter(i => i.month !== month) } }));
  },
  toggleUseCustomMonthly: () => {
    set((s) => ({ customMonthly: { ...s.customMonthly, useCustom: !s.customMonthly.useCustom } }));
  },

  setFieldConfig: (config) => set({ fieldConfig: config, statsNeedUpdate: true }),

  setVersion: (version) => set({ version }),
  setStats: ({ overview, monthly, results, cycles, cycleStatsGeneratedAt, stale }) => {
    const analysisResults: Record<string, AnalysisSeriesResult> = {};
    for (const item of results) analysisResults[`${item.configKind}:${item.configId}`] = item;
    set({
      statOverview: overview,
      statMonthly: monthly,
      analysisResults,
      statsStale: stale ?? [],
      ...(cycles ? { cycleStats: cycles } : {}),
      ...(cycleStatsGeneratedAt !== undefined ? { cycleStatsGeneratedAt } : {}),
      // 结果本身落后于记录时提示更新；刚重算完（stale 为空）则熄灭提示
      statsNeedUpdate: (stale?.length ?? 0) > 0,
    });
  },
}));

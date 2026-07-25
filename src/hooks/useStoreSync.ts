import { useEffect, useRef } from 'react';
import { r2StorageService } from '@/services/r2Service';
import { useRecordsStore } from '@/stores/recordsStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { useUIStore } from '@/stores/uiStore';
import { DEFAULT_FIELD_CONFIG } from '@/types';
import { generateCycleStats } from '@/services/cycleStatsService';
import type { TradingRecord } from '@/types';

/** 迁移旧数据：entryType 从 string 转为 string[] */
function migrateRecord(r: any): TradingRecord {
  return {
    ...r,
    entryType: typeof r.entryType === 'string'
      ? [r.entryType]
      : (Array.isArray(r.entryType) && r.entryType.length > 0 ? r.entryType : ['未知']),
    hasCycleStats: r.hasCycleStats ?? false,
    hasMonthlyStats: r.hasMonthlyStats ?? false,
  };
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
  const version = useRecordsStore(s => s.version);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);

  const isInitialized = useUIStore(s => s.isInitialized);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 防抖保存
  useEffect(() => {
    if (!isInitialized) return; // 初始化完成前不触发自动保存
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!currentDatasetId) return;
      const state = useRecordsStore.getState();
      if (state.records.length === 0 && !state.customAnalysis.useCustom) return;

      useUIStore.getState().setSaving(true);
      try {
        const result = await r2StorageService.saveRecords(
          currentDatasetId,
          state.records, state.version ?? undefined,
          state.customAnalysis, state.customMonthly,
          state.cycleStats, state.cycleStatsGeneratedAt
        ) as any;
        if (result.success) {
          useRecordsStore.getState().setVersion(result.version ?? null);
          useUIStore.getState().setError(null);
        } else if (result.conflict) {
          const migrated = (result.records || []).map(migrateRecord);
          useRecordsStore.setState({
            records: migrated,
            customAnalysis: result.customAnalysis || { useCustom: false, data: {} as any },
            customMonthly: result.customMonthly || { useCustom: false, data: [] },
            cycleStats: result.cycleStats || {},
            cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
            version: result.version || null,
          });
          useUIStore.getState().setError('数据冲突，已加载最新数据，请重试操作');
        } else {
          const msg = result.error || result.message || '保存失败';
          useUIStore.getState().setError(msg);
        }
      } catch (e) {
        useUIStore.getState().setError(e instanceof Error ? e.message : '保存失败，请检查网络连接');
      } finally {
        useUIStore.getState().setSaving(false);
      }
    }, 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [records, customAnalysis, customMonthly, cycleStats, version, currentDatasetId, isInitialized]);
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

/**
 * 加载指定数据集的所有数据
 */
async function loadDatasetData(datasetId: string): Promise<void> {
  try {
    const result = await r2StorageService.getRecords(datasetId) as any;
    const configResult = await r2StorageService.getConfig(datasetId);
    const fieldConfig = (configResult.success && configResult.config?.tradingTypes)
      ? configResult.config
      : { ...DEFAULT_FIELD_CONFIG };

    if (result.success) {
      const migrated = (result.records || []).map(migrateRecord);
      useRecordsStore.setState({
        records: migrated,
        fieldConfig,
        customAnalysis: result.customAnalysis || { useCustom: false, data: {} as any },
        customMonthly: result.customMonthly || { useCustom: false, data: [] },
        cycleStats: result.cycleStats || {},
        cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
        version: result.version || null,
        statsNeedUpdate: false,
      });
    } else {
      useRecordsStore.setState({
        records: [], version: null, fieldConfig: { ...DEFAULT_FIELD_CONFIG },
        customAnalysis: { useCustom: false, data: {} as any },
        customMonthly: { useCustom: false, data: [] },
        cycleStats: {}, cycleStatsGeneratedAt: null, statsNeedUpdate: false,
      });
    }
  } catch (e) {
    useUIStore.getState().setError(e instanceof Error ? e.message : '切换数据集失败');
  }
}

/**
 * 保存 fieldConfig 到 R2
 */
export async function saveFieldConfigToR2(config: any): Promise<void> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (datasetId) {
    await r2StorageService.saveConfig(datasetId, config);
  }
}

/**
 * 立即保存（跳过防抖）
 */
export async function saveNow(): Promise<void> {
  const datasetId = useDatasetStore.getState().currentDatasetId;
  if (!datasetId) return;
  const state = useRecordsStore.getState();

  useUIStore.getState().setSaving(true);
  try {
    const result = await r2StorageService.saveRecords(
      datasetId,
      state.records, state.version ?? undefined,
      state.customAnalysis, state.customMonthly,
      state.cycleStats, state.cycleStatsGeneratedAt
    ) as any;
    if (result.success) {
      useRecordsStore.getState().setVersion(result.version ?? null);
      useUIStore.getState().setError(null);
    } else if (result.conflict) {
      const migrated = (result.records || []).map(migrateRecord);
      useRecordsStore.setState({
        records: migrated,
        customAnalysis: result.customAnalysis || { useCustom: false, data: {} as any },
        customMonthly: result.customMonthly || { useCustom: false, data: [] },
        cycleStats: result.cycleStats || {},
        cycleStatsGeneratedAt: result.cycleStatsGeneratedAt || null,
        version: result.version || null,
      });
      useUIStore.getState().setError('数据冲突，已加载最新数据，请重试操作');
    } else {
      useUIStore.getState().setError(result.error || result.message || '保存失败');
    }
  } catch (e) {
    useUIStore.getState().setError(e instanceof Error ? e.message : '保存失败');
  } finally {
    useUIStore.getState().setSaving(false);
  }
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

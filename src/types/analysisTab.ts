import type { MistakeStatus } from './trading';
import type { FieldConfig } from './fieldConfig';

// 盈亏比信源：盈亏情况 或 某个理论维度（dim:<维度id>）
export type ProfitSource = 'profitPercent' | `dim:${string}`;

/** 是否为理论维度信源 */
export function isDimensionSource(source: ProfitSource): source is `dim:${string}` {
  return source.startsWith('dim:');
}

/** 从信源中取出维度 id（profitPercent 返回 null） */
export function getSourceDimensionId(source: ProfitSource): string | null {
  return isDimensionSource(source) ? source.slice(4) : null;
}

/** 信源展示名称 */
export function getProfitSourceLabel(source: ProfitSource, fieldConfig: FieldConfig): string {
  if (source === 'profitPercent') return '盈亏情况';
  const id = source.slice(4);
  return fieldConfig.theoreticalDimensions.find(d => d.id === id)?.name ?? '未知维度';
}

/** 迁移旧信源值：后续盈亏空间 / 理论盈亏率 均归为盈亏情况 */
export function migrateProfitSource(raw: unknown): ProfitSource {
  if (typeof raw === 'string' && raw.startsWith('dim:')) return raw as ProfitSource;
  return 'profitPercent';
}

export interface AnalysisTabFilter {
  startDate?: string;          // 'YYYYMM' 起，空=不限
  endDate?: string;            // 'YYYYMM' 止，空=不限
  tradingTypes: string[];      // 多选，空=不限
  trendFeatures: string[];     // 多选，空=不限
  patternFeatures: string[];   // 多选，空=不限
  hasMistake: MistakeStatus[]; // 多选，空=不限
}

/** 序列在页签中的角色：merge = 并入结果，exclude = 从结果中剔除 */
export type SeriesGroupMode = 'merge' | 'exclude';

/** 一组「完整筛选条件 + 独立信源」；merge 组取并集，exclude 组从并集中剔除 */
export interface AnalysisTabGroup {
  filter: AnalysisTabFilter;
  source: ProfitSource;
  mode: SeriesGroupMode;
}

export interface AnalysisTab {
  id: string;
  name: string;
  groups: AnalysisTabGroup[]; // 至少 1 组，多组合并
  createdAt: number;
}

// ============ 压测对比系列 ============

/** 压测对比中的一条对比系列：与首页页签相同的数据维度筛选 + 盈亏信源 */
export interface StressSeries {
  id: string;
  name: string;
  groups: AnalysisTabGroup[];
  createdAt: number;
}

// ============ 迁移 ============

function migrateFilter(raw: unknown): AnalysisTabFilter {
  const f = (raw ?? {}) as Partial<AnalysisTabFilter>;
  return {
    startDate: typeof f.startDate === 'string' ? f.startDate : undefined,
    endDate: typeof f.endDate === 'string' ? f.endDate : undefined,
    tradingTypes: Array.isArray(f.tradingTypes) ? f.tradingTypes : [],
    trendFeatures: Array.isArray(f.trendFeatures) ? f.trendFeatures : [],
    patternFeatures: Array.isArray(f.patternFeatures) ? f.patternFeatures : [],
    hasMistake: Array.isArray(f.hasMistake) ? f.hasMistake : [],
  };
}

/** 迁移页签/系列的 groups：兼容旧的 { filter, source } 结构 */
export function migrateAnalysisTabGroups(raw: unknown): AnalysisTabGroup[] {
  const r = (raw ?? {}) as { groups?: unknown[]; filter?: unknown; source?: unknown };
  const toGroup = (g: unknown): AnalysisTabGroup => {
    const gg = (g ?? {}) as { filter?: unknown; source?: unknown; mode?: unknown };
    return {
      filter: migrateFilter(gg.filter),
      source: migrateProfitSource(gg.source),
      mode: gg.mode === 'exclude' ? 'exclude' : 'merge',
    };
  };
  if (Array.isArray(r.groups) && r.groups.length > 0) {
    return r.groups.map(toGroup);
  }
  return [toGroup(r)];
}

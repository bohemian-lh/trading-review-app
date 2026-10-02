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

export interface AnalysisTab {
  id: string;
  name: string;
  filter: AnalysisTabFilter;
  source: ProfitSource;
  createdAt: number;
}

// ============ 压测对比系列 ============

/** 压测对比中的一条对比系列：与首页页签相同的数据维度筛选 + 盈亏信源 */
export interface StressSeries {
  id: string;
  name: string;
  filter: AnalysisTabFilter;
  source: ProfitSource;
  createdAt: number;
}

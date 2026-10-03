import type { TradingRecord, FieldConfig, ProfitSource, AnalysisTabFilter, AnalysisTabGroup } from '@/types';
import { extractMonth } from '@/utils/dateUtils';

// ============ 信源取值 ============

export function getSourceValue(record: TradingRecord, source: ProfitSource): number {
  if (source === 'profitPercent') return record.profitPercent;
  const dimensionId = source.slice(4);
  return record.theoreticalProfitRatios[dimensionId] ?? record.profitPercent;
}

// ============ 数据范围筛选 ============

export function filterRecords(records: TradingRecord[], filter: AnalysisTabFilter): TradingRecord[] {
  return records.filter(r => {
    if (filter.startDate && extractMonth(r.openDate) < filter.startDate) return false;
    if (filter.endDate && extractMonth(r.openDate) > filter.endDate) return false;
    if (filter.tradingTypes.length > 0 && !filter.tradingTypes.includes(r.tradingType)) return false;
    if (filter.trendFeatures.length > 0 && !r.trendFeatures.some(t => filter.trendFeatures.includes(t))) return false;
    if (filter.patternFeatures.length > 0 && !r.patternFeatures.some(p => filter.patternFeatures.includes(p))) return false;
    if (filter.hasMistake.length > 0 && !filter.hasMistake.includes(r.hasMistake)) return false;
    return true;
  });
}

// ============ 多组合并（并集） ============

export interface MergedSeriesItem {
  record: TradingRecord;
  value: number; // 解析后的信源值
}

/**
 * 多序列合并：merge 组的筛选结果取记录并集（按 record.id 去重），
 * 再从并集中剔除所有 exclude 组的筛选结果；
 * 信源按组独立解析；同一记录命中多组时以先出现组为准。
 * 结果按开单时间升序返回。
 */
export function mergeGroupRecords(records: TradingRecord[], groups: AnalysisTabGroup[]): MergedSeriesItem[] {
  const map = new Map<string, MergedSeriesItem>();
  for (const g of groups) {
    if (g.mode === 'exclude') continue;
    for (const r of filterRecords(records, g.filter)) {
      if (!map.has(r.id)) {
        map.set(r.id, { record: r, value: getSourceValue(r, g.source) });
      }
    }
  }
  for (const g of groups) {
    if (g.mode !== 'exclude') continue;
    for (const r of filterRecords(records, g.filter)) {
      map.delete(r.id);
    }
  }
  return [...map.values()].sort((a, b) => a.record.openDate.localeCompare(b.record.openDate));
}

// ============ 盈亏比（按信源，沿用现有 v3 公式） ============

/** 由累计盈利/亏损总和直接求盈亏比（v3 公式，O(1)） */
function ratioFromSums(sumPositive: number, sumNegative: number): number | 'N/A' {
  const absProfit = Math.abs(sumPositive);
  const absLoss = Math.abs(sumNegative);

  if (absProfit === 0 && absLoss === 0) return 'N/A';
  if (absProfit > 0 && absLoss === 0) return parseFloat((absProfit / 1).toFixed(2));
  if (absProfit === 0 && absLoss > 0) return parseFloat((-absLoss / 1).toFixed(2));

  let ratio: number;
  if (absProfit > absLoss) ratio = absProfit / absLoss;
  else if (absProfit < absLoss) ratio = -(absLoss / absProfit);
  else ratio = sumPositive > 0 ? 1.0 : -1.0;

  return parseFloat(ratio.toFixed(2));
}

/** 值域版盈亏比公式（v3）：基于一组已解析的数值 */
function computeProfitRatioFromValues(values: number[]): number | 'N/A' {
  let sumPositive = 0;
  let sumNegative = 0;

  for (const v of values) {
    if (v === null || v === undefined) continue; // 空值跳过
    if (v > 0) sumPositive += v;
    else if (v < 0) sumNegative += v;
  }

  return ratioFromSums(sumPositive, sumNegative);
}

export function computeProfitRatio(records: TradingRecord[], source: ProfitSource): number | 'N/A' {
  return computeProfitRatioFromValues(records.map(r => getSourceValue(r, source)));
}

// ============ 排序（按开单时间升序） ============

function sortByOpenDate(records: TradingRecord[]): TradingRecord[] {
  return [...records].sort((a, b) => a.openDate.localeCompare(b.openDate));
}

// ============ 图1：累计盈亏曲线 ============

export interface Point {
  index: number; // 交易序号（从 1 开始）
  value: number | null;
}

export function computeCumulativeProfit(records: TradingRecord[], source: ProfitSource): Point[] {
  const sorted = sortByOpenDate(records);
  let cum = 0;
  return sorted.map((r, i) => {
    const v = getSourceValue(r, source);
    if (v !== null) cum += v;
    return { index: i + 1, value: parseFloat(cum.toFixed(2)) };
  });
}

// ============ 图2：盈亏比周期图（30 笔/周期） ============

export interface PeriodPoint {
  period: string;
  value: number | null;
}

export function computeCycleProfitRatios(records: TradingRecord[], source: ProfitSource, cycleSize = 30): PeriodPoint[] {
  const sorted = sortByOpenDate(records);
  const result: PeriodPoint[] = [];
  for (let i = 0; i < sorted.length; i += cycleSize) {
    const chunk = sorted.slice(i, i + cycleSize);
    const ratio = computeProfitRatio(chunk, source);
    result.push({ period: `第${Math.floor(i / cycleSize) + 1}周期`, value: ratio === 'N/A' ? null : ratio });
  }
  return result;
}

// ============ 图3：盈亏比成长曲线（逐笔累计） ============

export function computeGrowthProfitRatios(records: TradingRecord[], source: ProfitSource): Point[] {
  const sorted = sortByOpenDate(records);
  let sumPositive = 0;
  let sumNegative = 0;
  return sorted.map((r, i) => {
    const v = getSourceValue(r, source);
    if (v !== null && v !== undefined) {
      if (v > 0) sumPositive += v;
      else if (v < 0) sumNegative += v;
    }
    const ratio = ratioFromSums(sumPositive, sumNegative);
    return { index: i + 1, value: ratio === 'N/A' ? null : ratio };
  });
}

// ============ 值域版计算（基于合并后的 { record, value } 序列，已按开单时间排序） ============

export function computeCumulativeProfitFromItems(items: MergedSeriesItem[]): Point[] {
  let cum = 0;
  return items.map((it, i) => {
    if (it.value !== null && it.value !== undefined) cum += it.value;
    return { index: i + 1, value: parseFloat(cum.toFixed(2)) };
  });
}

export function computeCycleProfitRatiosFromItems(items: MergedSeriesItem[], cycleSize = 30): PeriodPoint[] {
  const result: PeriodPoint[] = [];
  for (let i = 0; i < items.length; i += cycleSize) {
    const chunk = items.slice(i, i + cycleSize).map(it => it.value);
    const ratio = computeProfitRatioFromValues(chunk);
    result.push({ period: `第${Math.floor(i / cycleSize) + 1}周期`, value: ratio === 'N/A' ? null : ratio });
  }
  return result;
}

export function computeGrowthProfitRatiosFromItems(items: MergedSeriesItem[]): Point[] {
  let sumPositive = 0;
  let sumNegative = 0;
  return items.map((it, i) => {
    const v = it.value;
    if (v !== null && v !== undefined) {
      if (v > 0) sumPositive += v;
      else if (v < 0) sumNegative += v;
    }
    const ratio = ratioFromSums(sumPositive, sumNegative);
    return { index: i + 1, value: ratio === 'N/A' ? null : ratio };
  });
}

// ============ 维度定义（默认页签多曲线） ============

export interface DimensionDef {
  key: string;
  label: string;
  color: string;
}

const DIMENSION_COLORS = ['#0ea5e9', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#06b6d4', '#a78bfa', '#22d3ee', '#e11d48', '#84cc16', '#fb923c'];

export function buildDimensions(fieldConfig: FieldConfig): DimensionDef[] {
  const dims: DimensionDef[] = [
    { key: '总', label: '总', color: DIMENSION_COLORS[0] },
    { key: '系统', label: '系统', color: DIMENSION_COLORS[1] },
    { key: '非系统', label: '非系统', color: DIMENSION_COLORS[2] },
  ];
  let ci = 3;
  for (const t of fieldConfig.tradingTypes) {
    if (t === '未知') continue;
    dims.push({ key: t, label: t, color: DIMENSION_COLORS[ci++ % DIMENSION_COLORS.length] });
  }
  return dims;
}

export function getDimensionRecords(records: TradingRecord[], dim: string): TradingRecord[] {
  if (dim === '总') return records;
  if (dim === '系统') return records.filter(r => r.patternFeatures.includes('系统'));
  if (dim === '非系统') return records.filter(r => r.patternFeatures.includes('非系统'));
  return records.filter(r => r.tradingType === dim);
}

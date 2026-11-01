// 理论盈亏比维度 — 基准 / 关联取值与换算
import type { TradingRecord, TheoreticalDimension } from '@/types';

const round2 = (n: number) => parseFloat(n.toFixed(2));

/** 是否为关联维度：非基准且已指定基准 id */
export function isLinkedDimension(dim: TheoreticalDimension): boolean {
  return !dim.isBase && !!dim.baseDimensionId;
}

/** 查找关联维度锚定的基准维度（只允许单层：基准必须是独立维度） */
export function findBaseDimension(
  dim: TheoreticalDimension,
  dimensions: TheoreticalDimension[],
): TheoreticalDimension | undefined {
  if (!isLinkedDimension(dim)) return undefined;
  return dimensions.find(d => d.id === dim.baseDimensionId && d.isBase);
}

/** 基准维度的实际值：录入值，未填时回退盈亏情况 */
export function getBaseDimensionValue(
  record: Pick<TradingRecord, 'profitPercent' | 'theoreticalProfitRatios'>,
  baseDim: TheoreticalDimension,
): number {
  const raw = record.theoreticalProfitRatios?.[baseDim.id];
  return typeof raw === 'number' ? raw : record.profitPercent;
}

export interface LinkedDimensionParts {
  baseDimension?: TheoreticalDimension;
  /** 基准实际值（未填时回退盈亏情况） */
  baseValue: number;
  /** 变化率（未填视为 0） */
  delta: number;
}

/** 关联维度展示用数据：基准实际值 + 变化率 */
export function getLinkedDimensionParts(
  record: Pick<TradingRecord, 'profitPercent' | 'theoreticalProfitRatios' | 'theoreticalProfitDeltas'>,
  dim: TheoreticalDimension,
  dimensions: TheoreticalDimension[],
): LinkedDimensionParts {
  const baseDimension = findBaseDimension(dim, dimensions);
  const baseValue = baseDimension ? getBaseDimensionValue(record, baseDimension) : record.profitPercent;
  const rawDelta = record.theoreticalProfitDeltas?.[dim.id];
  if (typeof rawDelta === 'number') return { baseDimension, baseValue, delta: rawDelta };
  // 兼容只有最终结果（如 Excel 导入）没有变化率的数据：按「结果 - 基准值」反推
  const storedRatio = record.theoreticalProfitRatios?.[dim.id];
  const delta = typeof storedRatio === 'number' ? round2(storedRatio - baseValue) : 0;
  return { baseDimension, baseValue, delta };
}

type TheoreticalInput = {
  profitPercent: number | null;
  theoreticalProfitRatios?: Record<string, number>;
  theoreticalProfitDeltas?: Record<string, number>;
};

/**
 * 准备录入表单数据：
 * - 基准维度只保留录入值
 * - 关联维度只保留变化率（缺失时按「已存结果 - 基准值」反推，兼容导入数据）
 * 避免把旧的「最终结果」误当成变化率参与后续计算。
 */
export function prepareTheoreticalForm(
  record: TheoreticalInput,
  dimensions: TheoreticalDimension[],
): { theoreticalProfitRatios: Record<string, number>; theoreticalProfitDeltas: Record<string, number> } {
  const rawRatios = record.theoreticalProfitRatios ?? {};
  const rawDeltas = record.theoreticalProfitDeltas ?? {};
  const fallback = record.profitPercent ?? 0;
  const ratios: Record<string, number> = {};
  const deltas: Record<string, number> = {};

  for (const dim of dimensions) {
    if (isLinkedDimension(dim)) {
      const baseDim = findBaseDimension(dim, dimensions);
      const baseValue = baseDim
        ? (typeof rawRatios[baseDim.id] === 'number' ? rawRatios[baseDim.id] : fallback)
        : fallback;
      if (typeof rawDeltas[dim.id] === 'number') deltas[dim.id] = rawDeltas[dim.id];
      else if (typeof rawRatios[dim.id] === 'number') deltas[dim.id] = round2(rawRatios[dim.id] - baseValue);
    } else if (typeof rawRatios[dim.id] === 'number') {
      ratios[dim.id] = rawRatios[dim.id];
    }
  }

  return { theoreticalProfitRatios: ratios, theoreticalProfitDeltas: deltas };
}

/**
 * 材料化一条记录的理论盈亏比：
 * - 基准维度：保留录入值（未填仍不回写，展示时回退盈亏情况）
 * - 关联维度：最终值 = 基准实际值 + 变化率，同时写入 ratios 与 deltas
 * - 兼容只有结果没有变化率的历史/导入数据：按「结果 - 基准值」反推变化率
 */
export function materializeTheoreticalRatios(
  record: TheoreticalInput,
  dimensions: TheoreticalDimension[],
): { theoreticalProfitRatios: Record<string, number>; theoreticalProfitDeltas: Record<string, number> } {
  const ratios: Record<string, number> = { ...(record.theoreticalProfitRatios ?? {}) };
  const deltas: Record<string, number> = { ...(record.theoreticalProfitDeltas ?? {}) };
  const fallback = record.profitPercent ?? 0;

  for (const dim of dimensions) {
    if (!isLinkedDimension(dim)) {
      // 基准维度不保留变化率
      delete deltas[dim.id];
      continue;
    }

    const baseDim = findBaseDimension(dim, dimensions);
    const baseValue = baseDim
      ? (typeof ratios[baseDim.id] === 'number' ? ratios[baseDim.id] : fallback)
      : fallback;

    if (typeof deltas[dim.id] !== 'number') {
      const existing = ratios[dim.id];
      deltas[dim.id] = typeof existing === 'number' ? round2(existing - baseValue) : 0;
    }
    ratios[dim.id] = round2(baseValue + deltas[dim.id]);
  }

  return { theoreticalProfitRatios: ratios, theoreticalProfitDeltas: deltas };
}

/**
 * 维度配置变更后换算历史记录，保证「最终值不变」：
 * - 独立 → 关联：变化率 = 旧最终值 - 新基准值
 * - 关联 → 独立：写入最终值，删除变化率
 * - 关联 A → 关联 B：变化率 = 旧最终值 - 新基准值
 * - 未变化的维度保持原有存储（避免把「默认」固化成显式值）
 */
export function convertRecordForDimensionChange(
  record: TradingRecord,
  oldDimensions: TheoreticalDimension[],
  newDimensions: TheoreticalDimension[],
): TradingRecord {
  const oldById = new Map(oldDimensions.map(d => [d.id, d]));
  const newById = new Map(newDimensions.map(d => [d.id, d]));
  const ratios = { ...(record.theoreticalProfitRatios ?? {}) };
  const deltas = { ...(record.theoreticalProfitDeltas ?? {}) };

  // 旧口径下每个维度的最终值
  const oldFinal = new Map<string, number>();
  for (const dim of oldDimensions) {
    if (isLinkedDimension(dim)) {
      const baseDim = oldById.get(dim.baseDimensionId!);
      const baseValue = baseDim
        ? (typeof ratios[baseDim.id] === 'number' ? ratios[baseDim.id] : record.profitPercent)
        : record.profitPercent;
      const delta = deltas[dim.id];
      if (typeof delta === 'number') oldFinal.set(dim.id, round2(baseValue + delta));
      else if (typeof ratios[dim.id] === 'number') oldFinal.set(dim.id, ratios[dim.id]);
      else oldFinal.set(dim.id, round2(baseValue));
    } else {
      oldFinal.set(dim.id, typeof ratios[dim.id] === 'number' ? ratios[dim.id] : record.profitPercent);
    }
  }

  const nextRatios: Record<string, number> = {};
  const nextDeltas: Record<string, number> = {};

  for (const dim of newDimensions) {
    const oldDim = oldById.get(dim.id);
    if (!oldDim) continue; // 新增维度：无历史值

    const oldLinked = isLinkedDimension(oldDim);
    const newLinked = isLinkedDimension(dim);
    const sameShape = oldLinked === newLinked && oldDim.baseDimensionId === dim.baseDimensionId;

    if (sameShape) {
      if (typeof ratios[dim.id] === 'number') nextRatios[dim.id] = ratios[dim.id];
      if (typeof deltas[dim.id] === 'number') nextDeltas[dim.id] = deltas[dim.id];
      continue;
    }

    const finalValue = oldFinal.get(dim.id) ?? record.profitPercent;
    nextRatios[dim.id] = round2(finalValue);

    if (newLinked) {
      const baseDim = newById.get(dim.baseDimensionId!);
      const baseValue = baseDim
        ? (typeof ratios[baseDim.id] === 'number' ? ratios[baseDim.id] : record.profitPercent)
        : record.profitPercent;
      nextDeltas[dim.id] = round2(finalValue - baseValue);
    }
  }

  return { ...record, theoreticalProfitRatios: nextRatios, theoreticalProfitDeltas: nextDeltas };
}

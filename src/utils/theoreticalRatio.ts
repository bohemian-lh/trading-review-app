// 理论盈亏比维度 — 基准 / 关联取值与换算
// NULL 语义：
// - 键不存在（未填写）→ 回退到基准值/盈亏情况
// - null（显式 NULL/未知）→ 该维度下本记录失效，作为信源统计时排除
// - 历史哨兵 999 / -999 统一视为 NULL
import type { TradingRecord, TheoreticalDimension } from '@/types';

const round2 = (n: number) => parseFloat(n.toFixed(2));

/** 展示用 NULL 文案 */
export const THEORETICAL_NULL_LABEL = 'N/A';

/** 是否为显式 NULL：null、历史哨兵 ±999、字符串 NULL/N/A */
export function isExcludedTheoreticalValue(value: unknown): boolean {
  return value === null
    || value === 999
    || value === -999
    || value === 'NULL'
    || value === 'N/A';
}

/**
 * 把任意输入规范化为 number | null | undefined
 * - undefined：未填写（保留回退语义）
 * - null：显式 NULL（统计排除）
 */
export function normalizeTheoreticalValue(value: unknown): number | null | undefined {
  if (value === undefined || value === '') return undefined;
  if (isExcludedTheoreticalValue(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return undefined;
    if (text.toUpperCase() === 'NULL' || text.toUpperCase() === 'N/A') return null;
    const num = parseFloat(text);
    if (Number.isNaN(num)) return undefined;
    return isExcludedTheoreticalValue(num) ? null : num;
  }
  return undefined;
}

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

/** 从原始 map 中解析基准值：NULL → null；未填 → 盈亏情况 */
function resolveBaseFromRaw(
  ratios: Record<string, number | null> | undefined,
  profitPercent: number,
  baseDim: TheoreticalDimension,
): number | null {
  const raw = normalizeTheoreticalValue(ratios?.[baseDim.id]);
  if (raw === null) return null;
  if (raw === undefined) return profitPercent;
  return raw;
}

/** 基准维度的有效值：显式 NULL → null；未填 → 回退盈亏情况 */
export function getBaseDimensionValue(
  record: Pick<TradingRecord, 'profitPercent' | 'theoreticalProfitRatios'>,
  baseDim: TheoreticalDimension,
): number | null {
  return resolveBaseFromRaw(record.theoreticalProfitRatios, record.profitPercent, baseDim);
}

/**
 * 解析某个维度的最终有效值。
 * 返回 null 表示该记录在此维度下为 NULL，统计时应排除。
 */
export function resolveTheoreticalValue(
  record: Pick<TradingRecord, 'profitPercent' | 'theoreticalProfitRatios' | 'theoreticalProfitDeltas'>,
  dim: TheoreticalDimension,
  dimensions: TheoreticalDimension[],
): number | null {
  if (!isLinkedDimension(dim)) {
    return getBaseDimensionValue(record, dim);
  }

  const baseDim = findBaseDimension(dim, dimensions);
  const baseValue = baseDim
    ? getBaseDimensionValue(record, baseDim)
    : record.profitPercent;
  if (baseValue === null) return null;

  const delta = normalizeTheoreticalValue(record.theoreticalProfitDeltas?.[dim.id]);
  if (delta === null) return null;
  if (delta !== undefined) return round2(baseValue + delta);

  // 兼容只有最终结果（如 Excel 导入）没有变化率的数据
  const final = normalizeTheoreticalValue(record.theoreticalProfitRatios?.[dim.id]);
  if (final === null) return null;
  if (final !== undefined) return final;
  return round2(baseValue);
}

export interface LinkedDimensionParts {
  baseDimension?: TheoreticalDimension;
  /** 基准实际值；null 表示基准为 NULL */
  baseValue: number | null;
  /** 变化率；null 表示显式 NULL */
  delta: number | null;
}

/** 关联维度展示用数据：基准实际值 + 变化率 */
export function getLinkedDimensionParts(
  record: Pick<TradingRecord, 'profitPercent' | 'theoreticalProfitRatios' | 'theoreticalProfitDeltas'>,
  dim: TheoreticalDimension,
  dimensions: TheoreticalDimension[],
): LinkedDimensionParts {
  const baseDimension = findBaseDimension(dim, dimensions);
  const baseValue = baseDimension ? getBaseDimensionValue(record, baseDimension) : record.profitPercent;

  const delta = normalizeTheoreticalValue(record.theoreticalProfitDeltas?.[dim.id]);
  if (delta === null) return { baseDimension, baseValue, delta: null };
  if (baseValue === null) return { baseDimension, baseValue, delta: null };
  if (delta !== undefined) return { baseDimension, baseValue, delta };

  const storedRatio = normalizeTheoreticalValue(record.theoreticalProfitRatios?.[dim.id]);
  if (storedRatio === null) return { baseDimension, baseValue, delta: null };
  if (storedRatio !== undefined) {
    return { baseDimension, baseValue, delta: round2(storedRatio - baseValue) };
  }
  return { baseDimension, baseValue, delta: 0 };
}

type TheoreticalMap = Record<string, number | null>;

type TheoreticalInput = {
  profitPercent: number | null;
  theoreticalProfitRatios?: Record<string, number | null>;
  theoreticalProfitDeltas?: Record<string, number | null>;
};

function normalizeMap(map: Record<string, number | null> | undefined): TheoreticalMap {
  const result: TheoreticalMap = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const normalized = normalizeTheoreticalValue(value);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

/**
 * 准备录入表单数据：
 * - 基准维度保留录入值或显式 NULL
 * - 关联维度只保留变化率（缺失时按「已存结果 - 基准值」反推，兼容导入数据）
 * 避免把旧的「最终结果」误当成变化率参与后续计算。
 */
export function prepareTheoreticalForm(
  record: TheoreticalInput,
  dimensions: TheoreticalDimension[],
): { theoreticalProfitRatios: TheoreticalMap; theoreticalProfitDeltas: TheoreticalMap } {
  const rawRatios = record.theoreticalProfitRatios ?? {};
  const rawDeltas = record.theoreticalProfitDeltas ?? {};
  const fallback = record.profitPercent ?? 0;
  const ratios: TheoreticalMap = {};
  const deltas: TheoreticalMap = {};

  for (const dim of dimensions) {
    if (isLinkedDimension(dim)) {
      const baseDim = findBaseDimension(dim, dimensions);
      const baseValue = baseDim
        ? (normalizeTheoreticalValue(rawRatios[baseDim.id]) === null
          ? null
          : typeof normalizeTheoreticalValue(rawRatios[baseDim.id]) === 'number'
            ? normalizeTheoreticalValue(rawRatios[baseDim.id]) as number
            : fallback)
        : fallback;

      const rawDelta = normalizeTheoreticalValue(rawDeltas[dim.id]);
      if (rawDelta !== undefined) {
        deltas[dim.id] = rawDelta;
        continue;
      }

      const rawFinal = normalizeTheoreticalValue(rawRatios[dim.id]);
      if (rawFinal === null || baseValue === null) {
        deltas[dim.id] = null;
      } else if (rawFinal !== undefined) {
        deltas[dim.id] = round2(rawFinal - baseValue);
      }
    } else {
      const raw = normalizeTheoreticalValue(rawRatios[dim.id]);
      if (raw !== undefined) ratios[dim.id] = raw;
    }
  }

  return { theoreticalProfitRatios: ratios, theoreticalProfitDeltas: deltas };
}

/**
 * 材料化一条记录的理论盈亏比：
 * - 基准维度：保留录入值 / 显式 NULL；未填时保持缺失（展示时回退盈亏情况）
 * - 关联维度：基准为 NULL 或变化率为 NULL → 最终值写 null
 * - 关联维度正常：最终值 = 基准实际值 + 变化率，同时写入 ratios 与 deltas
 * - 历史哨兵 ±999 统一归一化为 null
 */
export function materializeTheoreticalRatios(
  record: TheoreticalInput,
  dimensions: TheoreticalDimension[],
): { theoreticalProfitRatios: TheoreticalMap; theoreticalProfitDeltas: TheoreticalMap } {
  const ratios = normalizeMap(record.theoreticalProfitRatios);
  const deltas = normalizeMap(record.theoreticalProfitDeltas);
  const fallback = record.profitPercent ?? 0;

  for (const dim of dimensions) {
    if (!isLinkedDimension(dim)) {
      // 基准维度不保留变化率
      delete deltas[dim.id];
      continue;
    }

    const baseDim = findBaseDimension(dim, dimensions);
    const baseValue = baseDim
      ? (ratios[baseDim.id] === null
        ? null
        : typeof ratios[baseDim.id] === 'number'
          ? ratios[baseDim.id]
          : fallback)
      : fallback;

    const delta = deltas[dim.id];
    // 基准缺失或变化率显式 NULL → 该关联维度失效
    if (baseValue === null || delta === null) {
      ratios[dim.id] = null;
      continue;
    }
    if (typeof delta === 'number') {
      ratios[dim.id] = round2(baseValue + delta);
      continue;
    }

    // 没有变化率：兼容「只有最终结果」的数据
    const existing = ratios[dim.id];
    if (existing === null) continue;
    if (typeof existing === 'number') {
      deltas[dim.id] = round2(existing - baseValue);
      continue;
    }
    ratios[dim.id] = round2(baseValue);
    deltas[dim.id] = 0;
  }

  return { theoreticalProfitRatios: ratios, theoreticalProfitDeltas: deltas };
}

/**
 * 维度配置变更后换算历史记录，保证「最终值不变」：
 * - 独立 → 关联：变化率 = 旧最终值 - 新基准值
 * - 关联 → 独立：写入最终值，删除变化率
 * - 关联 A → 关联 B：变化率 = 旧最终值 - 新基准值
 * - 未变化的维度保持原有存储（避免把「默认」固化成显式值）
 * - 原维度为 NULL 时，新维度继续写 null
 */
export function convertRecordForDimensionChange(
  record: TradingRecord,
  oldDimensions: TheoreticalDimension[],
  newDimensions: TheoreticalDimension[],
): TradingRecord {
  const oldById = new Map(oldDimensions.map(d => [d.id, d]));
  const newById = new Map(newDimensions.map(d => [d.id, d]));
  const ratios = normalizeMap(record.theoreticalProfitRatios);
  const deltas = normalizeMap(record.theoreticalProfitDeltas);

  // 旧口径下每个维度的最终值（null 表示失效）
  const oldFinal = new Map<string, number | null>();
  for (const dim of oldDimensions) {
    if (isLinkedDimension(dim)) {
      const baseDim = oldById.get(dim.baseDimensionId!);
      const baseValue = baseDim
        ? (ratios[baseDim.id] === null
          ? null
          : typeof ratios[baseDim.id] === 'number'
            ? ratios[baseDim.id]
            : record.profitPercent)
        : record.profitPercent;
      const delta = deltas[dim.id];
      const final = ratios[dim.id];
      if (baseValue === null || delta === null) oldFinal.set(dim.id, null);
      else if (typeof delta === 'number') oldFinal.set(dim.id, round2(baseValue + delta));
      else if (final === null) oldFinal.set(dim.id, null);
      else if (typeof final === 'number') oldFinal.set(dim.id, final);
      else oldFinal.set(dim.id, round2(baseValue));
    } else {
      const raw = ratios[dim.id];
      oldFinal.set(dim.id, raw === null ? null : typeof raw === 'number' ? raw : record.profitPercent);
    }
  }

  const nextRatios: TheoreticalMap = {};
  const nextDeltas: TheoreticalMap = {};

  for (const dim of newDimensions) {
    const oldDim = oldById.get(dim.id);
    if (!oldDim) continue; // 新增维度：无历史值

    const oldLinked = isLinkedDimension(oldDim);
    const newLinked = isLinkedDimension(dim);
    const sameShape = oldLinked === newLinked && oldDim.baseDimensionId === dim.baseDimensionId;

    if (sameShape) {
      const ratio = normalizeTheoreticalValue(ratios[dim.id]);
      if (ratio !== undefined) nextRatios[dim.id] = ratio;
      const delta = normalizeTheoreticalValue(deltas[dim.id]);
      if (delta !== undefined) nextDeltas[dim.id] = delta;
      continue;
    }

    const finalValue = oldFinal.get(dim.id) ?? null;
    if (finalValue === null) {
      nextRatios[dim.id] = null;
      if (newLinked) nextDeltas[dim.id] = null;
      continue;
    }

    nextRatios[dim.id] = round2(finalValue);
    if (newLinked) {
      const baseDim = newById.get(dim.baseDimensionId!);
      const baseValue = baseDim
        ? (ratios[baseDim.id] === null
          ? null
          : typeof ratios[baseDim.id] === 'number'
            ? ratios[baseDim.id]
            : record.profitPercent)
        : record.profitPercent;
      nextDeltas[dim.id] = baseValue === null ? null : round2(finalValue - baseValue);
    }
  }

  return { ...record, theoreticalProfitRatios: nextRatios, theoreticalProfitDeltas: nextDeltas };
}

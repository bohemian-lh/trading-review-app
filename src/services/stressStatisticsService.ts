// ============ 压测对比统计：偏度/峰度/JB 正态性检验 + 蒙特卡洛模拟 ============
// 本文件为纯函数实现，不依赖 DOM / React，可在 Web Worker 中运行。

// ---------- 描述性统计 ----------

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Moments { n: number; m2: number; m3: number; m4: number }

/** 一次遍历计算中心矩（m2/m3/m4），供偏度/峰度/JB 复用，避免多次全量扫描 */
function computeMoments(values: number[]): Moments {
  const n = values.length;
  if (n === 0) return { n: 0, m2: 0, m3: 0, m4: 0 };
  const m = mean(values);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - m;
    m2 += d ** 2;
    m3 += d ** 3;
    m4 += d ** 4;
  }
  return { n, m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

function skewnessFromMoments(n: number, m2: number, m3: number): number {
  if (n < 3) return 0;
  if (m2 === 0) return 0;
  const g1 = m3 / m2 ** 1.5;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
}

function kurtosisFromMoments(n: number, m2: number, m4: number): number {
  if (n < 4) return 0;
  if (m2 === 0) return 0;
  const g2 = m4 / m2 ** 2 - 3;
  return ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
}

/** 样本偏度（Fisher-Pearson 调整） */
export function computeSkewness(values: number[]): number {
  const { n, m2, m3 } = computeMoments(values);
  return skewnessFromMoments(n, m2, m3);
}

/** 样本超额峰度（excess kurtosis，正态分布为 0） */
export function computeKurtosis(values: number[]): number {
  const { n, m2, m4 } = computeMoments(values);
  return kurtosisFromMoments(n, m2, m4);
}

/** Jarque-Bera 正态性检验（2 自由度卡方近似） */
export function computeJarqueBera(values: number[]): { jb: number; pValue: number } {
  const n = values.length;
  if (n < 3) return { jb: 0, pValue: 1 };
  const { m2, m3, m4 } = computeMoments(values);
  const S = skewnessFromMoments(n, m2, m3);
  const K = kurtosisFromMoments(n, m2, m4);
  const jb = (n / 6) * (S ** 2 + (K ** 2) / 4);
  const pValue = Math.exp(-jb / 2);
  return { jb, pValue };
}

// ---------- 蒙特卡洛模拟 ----------

export interface MonteCarloConfig {
  initialCapital: number;   // 初始资金
  bankruptcyRatio: number;  // 破产线 = 初始资金 * 比例/100（0-100）
  numSimulations: number;   // 模拟次数（10000-1000000）
  replacement: boolean;     // true=有放回(Bootstrap)，false=无放回(Permutation)
  seed: number;             // 随机种子，保证可复现
}

export interface ReturnMetric {
  amount: number; // 金额
  ratio: number;  // 比率（%）
}

export interface DrawdownMetric {
  amount: number; // 金额
  ratio: number;  // 比率（%，相对初始资金）
}

export interface MonteCarloResult {
  seed: number;
  numSimulations: number;
  bankruptcyRate: number; // 破产率（%）
  returns: {
    avg: ReturnMetric;
    median: ReturnMetric;
    best: ReturnMetric;
    worst: ReturnMetric;
  };
  drawdowns: {
    avg: DrawdownMetric;
    worst: DrawdownMetric; // 最深
    best: DrawdownMetric;  // 最浅
  };
  streaks: {
    avg: number;
    max: number;
    min: number;
  };
  histogram: { label: string; count: number }[];
}

/** mulberry32 确定性伪随机数生成器 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimOutcome {
  finalCapital: number;
  bankrupt: boolean;
  maxDrawdown: number;
  longestStreak: number;
}

function simulateOnce(
  returns: number[],
  positions: number[],
  initialCapital: number,
  bankruptcyLine: number,
  replacement: boolean,
  rng: () => number,
): SimOutcome {
  const n = returns.length;
  let capital = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  let longestStreak = 0;
  let currentStreak = 0;

  const order: number[] = [];
  if (replacement) {
    for (let i = 0; i < n; i++) order.push(Math.floor(rng() * n));
  } else {
    for (let i = 0; i < n; i++) order.push(i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  for (const idx of order) {
    const ret = returns[idx];      // 单位：%
    const pos = positions[idx];    // 0-100
    // 资金模型：capital *= (1 + ret% × pos%)
    capital = Math.max(0, capital * (1 + (ret / 100) * (pos / 100)));

    if (capital > peak) peak = capital;
    const dd = peak - capital;
    if (dd > maxDrawdown) maxDrawdown = dd;

    if (ret < 0) {
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }

    if (capital <= bankruptcyLine) {
      return { finalCapital: capital, bankrupt: true, maxDrawdown, longestStreak };
    }
  }

  return { finalCapital: capital, bankrupt: false, maxDrawdown, longestStreak };
}

function toReturnMetric(finalCapital: number, initialCapital: number): ReturnMetric {
  const amount = finalCapital - initialCapital;
  return { amount: round2(amount), ratio: round2((amount / initialCapital) * 100) };
}

function toDrawdownMetric(drawdown: number, initialCapital: number): DrawdownMetric {
  return { amount: round2(drawdown), ratio: round2((drawdown / initialCapital) * 100) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function buildHistogram(values: number[], bins = 25): { label: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: round2(min).toString(), count: values.length }];
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / step);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  return counts.map((c, i) => ({ label: round2(min + i * step).toString(), count: c }));
}

/**
 * 蒙特卡洛模拟核心（纯函数，可在 Worker 中调用）。
 * @param returns   每笔交易的信源收益率（%，可为负）
 * @param positions 每笔交易的仓位（0-100）
 */
export function runMonteCarloCore(
  returns: number[],
  positions: number[],
  config: MonteCarloConfig,
): MonteCarloResult {
  const n = returns.length;
  if (n === 0) {
    return {
      seed: config.seed,
      numSimulations: 0,
      bankruptcyRate: 0,
      returns: {
        avg: { amount: 0, ratio: 0 },
        median: { amount: 0, ratio: 0 },
        best: { amount: 0, ratio: 0 },
        worst: { amount: 0, ratio: 0 },
      },
      drawdowns: {
        avg: { amount: 0, ratio: 0 },
        worst: { amount: 0, ratio: 0 },
        best: { amount: 0, ratio: 0 },
      },
      streaks: { avg: 0, max: 0, min: 0 },
      histogram: [],
    };
  }

  const bankruptcyLine = config.initialCapital * config.bankruptcyRatio / 100;
  const rng = mulberry32(config.seed);

  const finalCapitals: number[] = new Array(config.numSimulations);
  const drawdowns: number[] = new Array(config.numSimulations);
  const streaks: number[] = new Array(config.numSimulations);
  let bankruptCount = 0;

  for (let i = 0; i < config.numSimulations; i++) {
    const o = simulateOnce(returns, positions, config.initialCapital, bankruptcyLine, config.replacement, rng);
    finalCapitals[i] = o.finalCapital;
    drawdowns[i] = o.maxDrawdown;
    streaks[i] = o.longestStreak;
    if (o.bankrupt) bankruptCount++;
  }

  const sortedCaps = [...finalCapitals].sort((a, b) => a - b);
  const medianCap = median(sortedCaps);
  const bestCap = sortedCaps[sortedCaps.length - 1];
  const worstCap = sortedCaps[0];

  const sortedDD = [...drawdowns].sort((a, b) => a - b);
  const sortedStreaks = [...streaks].sort((a, b) => a - b);

  return {
    seed: config.seed,
    numSimulations: config.numSimulations,
    bankruptcyRate: round2((bankruptCount / config.numSimulations) * 100),
    returns: {
      avg: toReturnMetric(mean(finalCapitals), config.initialCapital),
      median: toReturnMetric(medianCap, config.initialCapital),
      best: toReturnMetric(bestCap, config.initialCapital),
      worst: toReturnMetric(worstCap, config.initialCapital),
    },
    drawdowns: {
      avg: toDrawdownMetric(mean(drawdowns), config.initialCapital),
      worst: toDrawdownMetric(sortedDD[sortedDD.length - 1], config.initialCapital),
      best: toDrawdownMetric(sortedDD[0], config.initialCapital),
    },
    streaks: {
      avg: round2(mean(streaks)),
      max: sortedStreaks[sortedStreaks.length - 1],
      min: sortedStreaks[0],
    },
    histogram: buildHistogram(finalCapitals),
  };
}

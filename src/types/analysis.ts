export interface AnalysisResult {
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  systemProfitAvgHoldDays: number | 'N/A';
  systemLossAvgHoldDays: number | 'N/A';
  nonSystemProfitAvgHoldDays: number | 'N/A';
  nonSystemLossAvgHoldDays: number | 'N/A';
  // 动态字段（从 fieldConfig 驱动）
  tradingTypeRatios: Record<string, number>;
  trendFeatureRatios: Record<string, number>;
  aggregateRatios: Record<string, number>;
  // 各理论维度的系统盈亏比（key = 维度 id）
  theoreticalProfitRatios: Record<string, number | 'N/A'>;
}

export interface MonthlyAnalysis {
  month: string;
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  avgProfitRatio: number | 'N/A';
  totalProfit: number | 'N/A';
}

export interface ChartDataPoint {
  month: string;
  displayMonth: string;
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  avgProfitRatio: number | 'N/A';
  totalProfit: number | 'N/A';
}

// 自定义分析数据（表2）
export interface CustomAnalysisData {
  useCustom: boolean;
  data: AnalysisResult;
}

// 自定义月度分析数据（表3）
export interface CustomMonthlyData {
  useCustom: boolean;
  data: MonthlyAnalysis[];
}

// ============ 预计算统计结果（D1 结果表） ============

/** 总览统计宽表：一个数据集一行 */
export interface StatOverview {
  recordCount: number;
  profitCount: number;
  lossCount: number;
  flatCount: number;
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  systemProfitAvgHoldDays: number | 'N/A';
  systemLossAvgHoldDays: number | 'N/A';
  nonSystemProfitAvgHoldDays: number | 'N/A';
  nonSystemLossAvgHoldDays: number | 'N/A';
  tradingTypeRatios: Record<string, number>;
  trendFeatureRatios: Record<string, number>;
  aggregateRatios: Record<string, number>;
  theoreticalProfitRatios: Record<string, number | 'N/A'>;
  sourceVersion: number;
  computedAt: string;
}

export type AnalysisConfigKind = 'dimension' | 'tab' | 'stress';

/** 配置化统计结果：一行 = 一个配置的一次计算结果 */
export interface AnalysisSeriesResult {
  configKind: AnalysisConfigKind;
  configId: string;
  recordCount: number;
  /** 信源值序列（按开单时间排序，压测的蒙特卡洛用） */
  values: number[];
  /** 仓位序列（仅压测） */
  positions: number[];
  cumulative: number[];
  cycle: (number | null)[];
  growth: (number | null)[];
  skewness: number | null;
  kurtosis: number | null;
  jb: number | null;
  jbPValue: number | null;
  sourceVersion: number;
  computedAt: string;
}

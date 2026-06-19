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
  entryTypeRatios: Record<string, number>;
  aggregateRatios: Record<string, number>;
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

// ============ 后续盈亏空间分析（独立统计） ============

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface SubsequentProfitStats {
  tradingType: string;
  count: number;
  avg: number;
  max: number;
  min: number;
  histogram: HistogramBucket[];
}

export interface SubsequentProfitAnalysis {
  stats: SubsequentProfitStats[];
  allPoints: {
    tradingType: string;
    value: number;
    stockName: string;
  }[];
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

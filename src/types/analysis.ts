export interface AnalysisResult {
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  systemProfitAvgHoldDays: number | 'N/A';
  systemLossAvgHoldDays: number | 'N/A';
  nonSystemProfitAvgHoldDays: number | 'N/A';
  nonSystemLossAvgHoldDays: number | 'N/A';
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


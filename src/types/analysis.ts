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
  systemProfitAvgHoldDays: number | 'N/A';
  systemLossAvgHoldDays: number | 'N/A';
  nonSystemProfitAvgHoldDays: number | 'N/A';
  nonSystemLossAvgHoldDays: number | 'N/A';
}

export interface ChartDataPoint {
  month: string;
  displayMonth: string;
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
}

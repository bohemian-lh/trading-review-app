import type { MistakeStatus } from './trading';

// 盈亏比信源：决定盈亏比/盈亏曲线用哪个字段计算
export type ProfitSource = 'profitPercent' | 'subsequentProfitSpace' | 'theoreticalProfitPercent';

export const PROFIT_SOURCE_LABELS: Record<ProfitSource, string> = {
  profitPercent: '盈亏情况',
  subsequentProfitSpace: '后续盈亏空间',
  theoreticalProfitPercent: '理论盈亏率',
};

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

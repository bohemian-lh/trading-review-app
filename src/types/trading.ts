export interface TradingRecord {
  id: string;
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  isSystem: YesNo;
  hasMistake: MistakeStatus;
  profitPercent: number;
  holdDays: number;
  chart1?: string;
  chart2?: string;
  keyChart1?: string;
  keyChart2?: string;
  preMarket: YesNo;
  // 周期统计标记
  hasCycleStats: boolean;
  // 月度统计标记
  hasMonthlyStats: boolean;
  // 关联的周期ID（可选）
  cycleId?: string;
}

export type TradingType = 
  | '齐飞水底'
  | '齐飞水底三等量'
  | '齐飞前多踩MA'
  | '风险释放平台转一致'
  | '双阳平台转一致'
  | '非系统';

export type YesNo = '是' | '否';

export type MistakeStatus = '是' | '否' | '其他';

export interface TradingRecordInput {
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  isSystem: YesNo;
  hasMistake: MistakeStatus;
  profitPercent: number | null;
  holdDays: number | null;
  chart1?: string;
  chart2?: string;
  keyChart1?: string;
  keyChart2?: string;
  preMarket: YesNo;
  // 新增字段，默认值在创建时设置
  hasCycleStats?: boolean;
  hasMonthlyStats?: boolean;
  cycleId?: string;
}

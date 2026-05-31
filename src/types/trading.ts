export interface TradingRecord {
  id: string;
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  isSystem: YesNo;
  hasMistake: YesNo;
  profitPercent: number;
  holdDays: number;
  chart1?: string;
  chart2?: string;
  keyChart1?: string;
  keyChart2?: string;
  preMarket: YesNo;
}

export type TradingType = 
  | '齐飞水底'
  | '齐飞前多踩MA'
  | '风险释放平台转一致'
  | '双阳平台转一致';

export type YesNo = '是' | '否';

export interface TradingRecordInput {
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  isSystem: YesNo;
  hasMistake: YesNo;
  profitPercent: number | null;
  holdDays: number | null;
  chart1?: string;
  chart2?: string;
  keyChart1?: string;
  keyChart2?: string;
  preMarket: YesNo;
}

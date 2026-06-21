export interface TradingRecord {
  id: string;
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  entryType: EntryType;
  isSystem: YesNo;
  hasMistake: MistakeStatus;
  profitPercent: number;
  holdDays: number;
  images: string[];
  imagePrefix: string;
  preMarket: YesNo;
  // 周期统计标记
  hasCycleStats: boolean;
  // 月度统计标记
  hasMonthlyStats: boolean;
  // 关联的周期ID（可选）
  cycleId?: string;
  // 后续盈亏空间
  subsequentProfitSpace: number | null;
}

// 合法值由 fieldConfig 动态控制，类型层面不做约束
export type TradingType = string;
export type EntryType = string;

export type YesNo = '是' | '否';

export type MistakeStatus = '是' | '否' | '其他';

export interface TradingRecordInput {
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  entryType: EntryType;
  isSystem: YesNo;
  hasMistake: MistakeStatus;
  profitPercent: number | null;
  holdDays: number | null;
  images?: string[];
  imagePrefix?: string;
  preMarket: YesNo;
  // 新增字段，默认值在创建时设置
  hasCycleStats?: boolean;
  hasMonthlyStats?: boolean;
  cycleId?: string;
  subsequentProfitSpace?: number | null;
}

// ============ 数据集 ============

export interface Dataset {
  id: string;
  name: string;
  createdAt: string;
}

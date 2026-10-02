export interface TradingRecord {
  id: string;
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  trendFeatures: string[];
  patternFeatures: string[];
  hasMistake: MistakeStatus;
  profitPercent: number;
  holdDays: number;
  // 仓位（0-100，百分比，默认 33；仅用于蒙特卡洛模拟）
  positionSize: number;
  images: string[];
  imagePrefix: string;
  preMarket: YesNo;
  // 周期统计标记
  hasCycleStats: boolean;
  // 月度统计标记
  hasMonthlyStats: boolean;
  // 关联的周期ID（可选）
  cycleId?: string;
  // 备注
  remark: string;
  // 理论盈亏比（key = 维度 id，value = 该维度数值；未填时语义上等于盈亏情况）
  theoreticalProfitRatios: Record<string, number>;
}

// 合法值由 fieldConfig 动态控制，类型层面不做约束
export type TradingType = string;
export type TrendFeature = string;

export type YesNo = '是' | '否';

export type MistakeStatus = '是' | '否' | '其他';

export interface TradingRecordInput {
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: TradingType;
  trendFeatures: string[];
  patternFeatures: string[];
  hasMistake: MistakeStatus;
  profitPercent: number | null;
  holdDays: number | null;
  positionSize?: number;
  images?: string[];
  imagePrefix?: string;
  preMarket: YesNo;
  // 新增字段，默认值在创建时设置
  hasCycleStats?: boolean;
  hasMonthlyStats?: boolean;
  cycleId?: string;
  remark?: string;
  theoreticalProfitRatios?: Record<string, number>;
}

// ============ 数据集 ============

export interface Dataset {
  id: string;
  name: string;
  createdAt: string;
}

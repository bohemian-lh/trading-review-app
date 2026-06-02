// 8类统计类型
export type CycleStatType = 
  | '系统' 
  | '系统无失误' 
  | '系统有失误' 
  | '非系统'
  | '齐飞水底'
  | '齐飞前多踩MA'
  | '风险释放平台转一致'
  | '双阳平台转一致';

// 周期统计数据
export interface CycleStats {
  // 唯一标识符
  cycleId: string;
  // 统计类型
  statType: CycleStatType;
  // 周期起始日期
  startDate: string;
  // 周期结束日期
  endDate: string;
  // 该周期包含的记录数
  recordCount: number;
  // 是否为完整周期（满30条）
  isComplete: boolean;
  // 盈利总和
  profitSum: number;
  // 亏损绝对值总和
  lossSum: number;
  // 最终盈亏比（带符号，保留两位小数）
  profitRatio: number | null;
  // 参与统计的记录ID列表
  recordIds: string[];
  // 创建时间
  createdAt: number;
  // 更新时间
  updatedAt: number;
}

// 周期统计结果
export interface CycleStatsResult {
  // 各类统计的周期列表
  stats: Record<CycleStatType, CycleStats[]>;
  // 统计生成时间
  generatedAt: number;
}

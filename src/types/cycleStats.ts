// 统计类型 — 从 fieldConfig 动态派生，不再固定 union
export type CycleStatType = string;

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

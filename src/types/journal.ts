// 交易日志 — 数据类型

/** 单条策略 */
export interface JournalStrategy {
  strategyId: string;
  text: string;
  sortOrder: number;
}

/** 策略组 */
export interface JournalStrategyGroup {
  groupId: string;
  groupName: string;
  strategies: JournalStrategy[];
  sortOrder: number;
}

/** 阶段配置 */
export interface JournalStageConfig {
  stageId: 'stage1_left' | 'stage2_reversal' | 'stage3_profit' | 'special_stop_loss';
  stageName: string;
  strategyGroups: JournalStrategyGroup[];
}

/** 日志配置快照（每次变更全量存储） */
export interface JournalConfigSnapshot {
  snapshotId: string;
  version: number;
  stages: JournalStageConfig[];
  createdAt: string;
}

/** 自定义策略 */
export interface CustomStrategy {
  id: string;   // 唯一 ID，如 custom_g1_abc123
  text: string;
}

/** 已提交的单条交易日志 */
export interface TradingJournal {
  id: string;
  recordId?: string;       // 可选关联 TradingRecord.id（在 Viewer 手动匹配）
  openDate: string;        // 开单时间
  stockCode: string;       // 股票代码
  stockName: string;       // 股票名称
  stage: string;           // 阶段 ID
  strategies: string[];    // strategyId 列表
  customStrategies: Record<string, CustomStrategy[]>; // groupId -> 自定义策略列表
  strategyBold: string[];  // 加粗的策略 strategyId 列表
  strategyRed: string[];   // 标红的策略 strategyId 列表
  strategyYellow: string[];// 标黄的策略 strategyId 列表
  strategyRedText: string[];// 红色字体的策略 strategyId 列表
  priceLevels: string[];    // 固定5个价位卡片完整内容（含标签前缀），默认 ['', '', '目标位：', '压力1：', '压力2：']
  snapshotId: string;      // 写入时的配置快照 ID
  status: 'draft' | 'submitted';  // draft=中间态, submitted=已完成
  createdAt: string;
}

/** 本地草稿 */
export interface JournalDraft {
  entryId: string;         // 临时 ID，区分多条草稿
  openDate: string;
  stockCode: string;
  stockName: string;
  stage: string;
  strategies: string[];
}

/** 默认共享策略组（当 fieldConfig.sharedJournalStrategyGroups 不存在时使用） */
export const DEFAULT_SHARED_STRATEGY_GROUPS: JournalStrategyGroup[] = [
  { groupId: 'g1', groupName: '方向和整体策略', strategies: [], sortOrder: 1 },
  { groupId: 'g2', groupName: '可持仓策略', strategies: [], sortOrder: 2 },
  { groupId: 'g3', groupName: '买回策略', strategies: [], sortOrder: 3 },
  { groupId: 'g4', groupName: '放量观察', strategies: [], sortOrder: 4 },
];

/** 默认阶段配置（不含策略组；策略组由 sharedJournalStrategyGroups 或 DEFAULT_SHARED_STRATEGY_GROUPS 提供） */
export const DEFAULT_JOURNAL_STAGES: JournalStageConfig[] = [
  { stageId: 'stage1_left', stageName: '阶段1 左侧', strategyGroups: [] },
  { stageId: 'stage2_reversal', stageName: '阶段2 反转', strategyGroups: [] },
  { stageId: 'stage3_profit', stageName: '阶段3 止盈', strategyGroups: [] },
  { stageId: 'special_stop_loss', stageName: '特殊阶段 止错', strategyGroups: [] },
];

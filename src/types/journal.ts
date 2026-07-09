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

/** 已提交的单条交易日志 */
export interface TradingJournal {
  id: string;
  recordId?: string;       // 可选关联 TradingRecord.id（在 Viewer 手动匹配）
  openDate: string;        // 开单时间
  stockCode: string;       // 股票代码
  stockName: string;       // 股票名称
  stage: string;           // 阶段 ID
  strategies: string[];    // strategyId 列表
  snapshotId: string;      // 写入时的配置快照 ID
  status: 'draft' | 'submitted';  // draft=中间态, submitted=已完成
  isBold: boolean;         // 行内容加粗
  isRed: boolean;          // 行内容标红背景
  isYellow: boolean;       // 行内容标黄背景
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
  isBold: boolean;
  isRed: boolean;
  isYellow: boolean;
}

/** 默认 3 阶段 + 特殊阶段 */
export const DEFAULT_JOURNAL_STAGES: JournalStageConfig[] = [
  {
    stageId: 'stage1_left',
    stageName: '阶段1 左侧',
    strategyGroups: [
      { groupId: 'g1', groupName: '方向和整体策略', strategies: [], sortOrder: 1 },
      { groupId: 'g2', groupName: '可持仓策略', strategies: [], sortOrder: 2 },
      { groupId: 'g3', groupName: '买回策略', strategies: [], sortOrder: 3 },
      { groupId: 'g4', groupName: '放量观察', strategies: [], sortOrder: 4 },
    ],
  },
  {
    stageId: 'stage2_reversal',
    stageName: '阶段2 反转',
    strategyGroups: [
      { groupId: 'g1', groupName: '方向和整体策略', strategies: [], sortOrder: 1 },
      { groupId: 'g2', groupName: '可持仓策略', strategies: [], sortOrder: 2 },
      { groupId: 'g3', groupName: '买回策略', strategies: [], sortOrder: 3 },
      { groupId: 'g4', groupName: '放量观察', strategies: [], sortOrder: 4 },
    ],
  },
  {
    stageId: 'stage3_profit',
    stageName: '阶段3 止盈',
    strategyGroups: [
      { groupId: 'g1', groupName: '方向和整体策略', strategies: [], sortOrder: 1 },
      { groupId: 'g2', groupName: '可持仓策略', strategies: [], sortOrder: 2 },
      { groupId: 'g3', groupName: '买回策略', strategies: [], sortOrder: 3 },
      { groupId: 'g4', groupName: '放量观察', strategies: [], sortOrder: 4 },
    ],
  },
  {
    stageId: 'special_stop_loss',
    stageName: '特殊阶段 止错',
    strategyGroups: [
      { groupId: 'g1', groupName: '方向和整体策略', strategies: [], sortOrder: 1 },
      { groupId: 'g2', groupName: '可持仓策略', strategies: [], sortOrder: 2 },
      { groupId: 'g3', groupName: '买回策略', strategies: [], sortOrder: 3 },
      { groupId: 'g4', groupName: '放量观察', strategies: [], sortOrder: 4 },
    ],
  },
];

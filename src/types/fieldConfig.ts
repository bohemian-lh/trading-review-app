// 字段配置类型 — 驱动动态类型系统

import type { JournalStageConfig, JournalStrategyGroup } from './journal';
import type { MindsetRow } from './mindset';
import type { DecisionCheckItem } from './decision';

export interface AggregateRule {
  name: string;
  includedTypes: string[];
}

// 理论盈亏比维度（字段编辑维护）
export interface TheoreticalDimension {
  id: string;
  name: string;
  comment: string;
}

export interface FieldConfig {
  tradingTypes: string[];
  trendFeatures: string[];
  patternFeatures: string[];
  aggregateRules: AggregateRule[];
  // 理论盈亏比维度（字段编辑维护「维度 id → 名称 / 备注说明」）
  theoreticalDimensions: TheoreticalDimension[];
  // 交易日志策略配置（可选）
  journalStrategyConfig?: JournalStageConfig[];
  // 共享策略组（所有阶段共用；优先级高于 journalStrategyConfig 中的 per-stage groups）
  sharedJournalStrategyGroups?: JournalStrategyGroup[];
  // 心态管理和策略表数据（可选）
  mindsetTable?: MindsetRow[];
  // 决策质量检查清单（可选）
  decisionChecklist?: DecisionCheckItem[];
  // 价位代码（key = 价位索引 0..6，value = 代码；策略文本中可用 /代码 引用，渲染时替换为对应日志数值）
  priceLevelCodes?: Record<number, string>;
}

// 默认配置（首次使用 / R2不可用时的降级）
export const DEFAULT_FIELD_CONFIG: FieldConfig = {
  tradingTypes: [
    '齐飞水底',
    '齐飞水底三等量',
    '齐飞前多踩MA',
    '风险释放平台转一致',
    '双阳平台转一致',
    '非系统',
    '未知',
  ],
  trendFeatures: ['p2前', 'p34', 'p4后', '未知'],
  patternFeatures: ['系统', '非系统'],
  aggregateRules: [
    {
      name: '齐飞水底总',
      includedTypes: ['齐飞水底', '齐飞水底三等量', '齐飞前多踩MA'],
    },
    {
      name: '转一致',
      includedTypes: ['风险释放平台转一致', '双阳平台转一致'],
    },
  ],
  // 不预留默认理论维度，由用户在字段编辑中新增
  theoreticalDimensions: [],
  // 7 个价位对应的代码（策略文本可用 /代码 引用）
  priceLevelCodes: {
    0: 'entry',
    1: 'stop',
    2: 'target',
    3: 'fixTarget',
    4: 'res1',
    5: 'res2',
    6: 'low',
  },
};

/**
 * 迁移旧版 fieldConfig：entryTypes → trendFeatures；补齐 patternFeatures
 * 兼容 R2 中存量的旧配置（旧配置没有 trendFeatures/patternFeatures 字段）
 */
export function migrateFieldConfig(raw: unknown): FieldConfig {
  const base: FieldConfig = { ...DEFAULT_FIELD_CONFIG };
  if (!raw || typeof raw !== 'object') return base;

  const cfg = raw as Record<string, unknown>;

  return {
    ...base,
    ...raw,
    tradingTypes: Array.isArray(cfg.tradingTypes) && cfg.tradingTypes.length > 0
      ? (cfg.tradingTypes as string[])
      : base.tradingTypes,
    trendFeatures: Array.isArray(cfg.trendFeatures) && cfg.trendFeatures.length > 0
      ? (cfg.trendFeatures as string[])
      : (Array.isArray(cfg.entryTypes) && cfg.entryTypes.length > 0
          ? (cfg.entryTypes as string[])
          : base.trendFeatures),
    patternFeatures: Array.isArray(cfg.patternFeatures) && cfg.patternFeatures.length > 0
      ? (cfg.patternFeatures as string[])
      : base.patternFeatures,
    aggregateRules: Array.isArray(cfg.aggregateRules) ? (cfg.aggregateRules as AggregateRule[]) : base.aggregateRules,
    theoreticalDimensions: Array.isArray(cfg.theoreticalDimensions)
      ? (cfg.theoreticalDimensions as TheoreticalDimension[])
      : [],
  };
}

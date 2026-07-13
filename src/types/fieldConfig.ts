// 字段配置类型 — 驱动动态类型系统

import type { JournalStageConfig, JournalStrategyGroup } from './journal';
import type { MindsetRow } from './mindset';
import type { DecisionCheckItem } from './decision';

export interface AggregateRule {
  name: string;
  includedTypes: string[];
}

// 直方图档位配置（9 个切分点 → 10 档）
export interface HistogramConfig {
  cuts: number[];  // 9 个严格递增的切分点
}

export interface FieldConfig {
  tradingTypes: string[];
  entryTypes: string[];
  aggregateRules: AggregateRule[];
  histogramConfigs?: Record<string, HistogramConfig>;  // key = tradingType
  // 交易日志策略配置（可选）
  journalStrategyConfig?: JournalStageConfig[];
  // 共享策略组（所有阶段共用；优先级高于 journalStrategyConfig 中的 per-stage groups）
  sharedJournalStrategyGroups?: JournalStrategyGroup[];
  // 心态管理和策略表数据（可选）
  mindsetTable?: MindsetRow[];
  // 决策质量检查清单（可选）
  decisionChecklist?: DecisionCheckItem[];
}

// 默认直方图 9 切分点
export const DEFAULT_HISTOGRAM_CUTS: number[] = [-15, -10, -8, -5, 0, 5, 8, 15, 20];

// 根据切分点生成 10 个档位的标签
export function buildHistogramLabels(cuts: number[]): string[] {
  if (cuts.length === 0) return ['全部'];
  const labels: string[] = [];
  labels.push(`≤ ${cuts[0]}%`);
  for (let i = 0; i < cuts.length - 1; i++) {
    labels.push(`${cuts[i]}% ~ ${cuts[i + 1]}%`);
  }
  labels.push(`> ${cuts[cuts.length - 1]}%`);
  return labels;
}

// 数据值匹配档位索引
export function bucketValue(value: number, cuts: number[]): number {
  for (let i = 0; i < cuts.length; i++) {
    if (value <= cuts[i]) return i;
  }
  return cuts.length; // 落入末档
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
  entryTypes: ['p2前', 'p34', 'p4后', '未知'],
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
};

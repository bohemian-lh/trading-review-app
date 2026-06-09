// 字段配置类型 — 驱动动态类型系统

export interface AggregateRule {
  name: string;
  includedTypes: string[];
}

export interface FieldConfig {
  tradingTypes: string[];
  entryTypes: string[];
  aggregateRules: AggregateRule[];
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

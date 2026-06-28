import { describe, it, expect } from 'vitest';
import { buildStatTypes, matchesStatType } from './cycleStatsService';
import type { FieldConfig, TradingRecord, EntryType } from '@/types';

const DEFAULT_CONFIG: FieldConfig = {
  tradingTypes: ['齐飞水底', '齐飞水底三等量', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致', '非系统', '未知'],
  entryTypes: ['p2前', 'p34', 'p4后', '未知'],
  aggregateRules: [
    { name: '齐飞水底总', includedTypes: ['齐飞水底', '齐飞水底三等量', '齐飞前多踩MA'] },
    { name: '转一致', includedTypes: ['风险释放平台转一致', '双阳平台转一致'] },
  ],
};

function makeRecord(overrides: Partial<TradingRecord> = {}): TradingRecord {
  return {
    id: 'test-1', openDate: '20240101', stockName: '测试', stockCode: '000001',
    tradingType: '齐飞水底', entryType: '未知' as EntryType, isSystem: '是', hasMistake: '否',
    profitPercent: 0, holdDays: 1, preMarket: '否',
    hasCycleStats: false, hasMonthlyStats: false,
    ...overrides,
  } as TradingRecord;
}

describe('buildStatTypes', () => {
  it('默认配置生成正确数量的类型', () => {
    const types = buildStatTypes(DEFAULT_CONFIG);
    // 4固定 + 4理论固定 + 6 tradingType(排除未知) + 6 理论tradingType(排除未知) + 3 entryType(排除未知) + 2 aggregate
    expect(types).toHaveLength(25);
  });

  it('包含4个固定维度', () => {
    const types = buildStatTypes(DEFAULT_CONFIG);
    expect(types).toContain('系统');
    expect(types).toContain('系统无失误');
    expect(types).toContain('系统有失误');
    expect(types).toContain('非系统');
  });

  it('不包含未知类型', () => {
    const types = buildStatTypes(DEFAULT_CONFIG);
    for (const t of types) {
      expect(t).not.toBe('未知');
    }
  });

  it('包含聚合规则名称', () => {
    const types = buildStatTypes(DEFAULT_CONFIG);
    expect(types).toContain('齐飞水底总');
    expect(types).toContain('转一致');
  });

  it('空配置只返回固定维度', () => {
    const types = buildStatTypes({ tradingTypes: [], entryTypes: [], aggregateRules: [] });
    expect(types).toEqual([
      '系统', '系统无失误', '系统有失误', '非系统',
      '理论-系统', '理论-系统无失误', '理论-系统有失误', '理论-非系统',
    ]);
  });
});

describe('matchesStatType', () => {
  it('系统维度匹配 isSystem=是', () => {
    const r = makeRecord({ isSystem: '是' });
    expect(matchesStatType(r, '系统', DEFAULT_CONFIG)).toBe(true);
  });

  it('系统维度不匹配 isSystem=否', () => {
    const r = makeRecord({ isSystem: '否' });
    expect(matchesStatType(r, '系统', DEFAULT_CONFIG)).toBe(false);
  });

  it('系统无失误匹配', () => {
    const r = makeRecord({ isSystem: '是', hasMistake: '否' });
    expect(matchesStatType(r, '系统无失误', DEFAULT_CONFIG)).toBe(true);
  });

  it('系统有失误匹配', () => {
    const r = makeRecord({ isSystem: '是', hasMistake: '是' });
    expect(matchesStatType(r, '系统有失误', DEFAULT_CONFIG)).toBe(true);
  });

  it('非系统匹配', () => {
    const r = makeRecord({ isSystem: '否' });
    expect(matchesStatType(r, '非系统', DEFAULT_CONFIG)).toBe(true);
  });

  it('交易类型维度匹配', () => {
    const r = makeRecord({ tradingType: '齐飞前多踩MA' });
    expect(matchesStatType(r, '齐飞前多踩MA', DEFAULT_CONFIG)).toBe(true);
  });

  it('交易类型维度不匹配', () => {
    const r = makeRecord({ tradingType: '齐飞水底' });
    expect(matchesStatType(r, '齐飞前多踩MA', DEFAULT_CONFIG)).toBe(false);
  });

  it('交易切入类型维度匹配', () => {
    const r = makeRecord({ entryType: 'p2前' as EntryType });
    expect(matchesStatType(r, 'p2前', DEFAULT_CONFIG)).toBe(true);
  });

  it('聚合规则维度匹配', () => {
    const r = makeRecord({ tradingType: '齐飞水底' });
    expect(matchesStatType(r, '齐飞水底总', DEFAULT_CONFIG)).toBe(true);
  });

  it('聚合规则维度不匹配', () => {
    const r = makeRecord({ tradingType: '非系统' });
    expect(matchesStatType(r, '齐飞水底总', DEFAULT_CONFIG)).toBe(false);
  });

  it('未知类型返回 false', () => {
    const r = makeRecord();
    expect(matchesStatType(r, '不存在的类型', DEFAULT_CONFIG)).toBe(false);
  });
});

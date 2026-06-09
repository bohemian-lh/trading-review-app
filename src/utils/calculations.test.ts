import { describe, it, expect } from 'vitest';
import { calculateProfitRatioByEntryType, calculateProfitRatioByType, calculateProfitRatioByMultipleTypes, calculateTradingTypeRatios, calculateEntryTypeRatios, calculateAggregateRatios } from './calculations';
import type { TradingRecord, EntryType, AggregateRule } from '@/types';

function makeRecord(overrides: Partial<TradingRecord> = {}): TradingRecord {
  return {
    id: 'test-1',
    openDate: '20240101',
    stockName: '测试',
    stockCode: '000001',
    tradingType: '齐飞水底',
    entryType: '未知' as EntryType,
    isSystem: '是',
    hasMistake: '否',
    profitPercent: 0,
    holdDays: 1,
    preMarket: '否',
    hasCycleStats: false,
    hasMonthlyStats: false,
    ...overrides,
  } as TradingRecord;
}

describe('calculateProfitRatioByEntryType', () => {
  it('空记录返回 0', () => {
    expect(calculateProfitRatioByEntryType([], 'p2前')).toBe(0);
  });

  it('全部是盈利返回盈利和/1.00', () => {
    const records = [
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 5 }),
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 3 }),
    ];
    expect(calculateProfitRatioByEntryType(records, 'p2前')).toBe(8);
  });

  it('全部是亏损返回 -lossSum', () => {
    const records = [
      makeRecord({ entryType: 'p34' as EntryType, profitPercent: -5 }),
      makeRecord({ entryType: 'p34' as EntryType, profitPercent: -3 }),
    ];
    expect(calculateProfitRatioByEntryType(records, 'p34')).toBe(-8);
  });

  it('盈利多返回正盈亏比', () => {
    const records = [
      makeRecord({ entryType: 'p4后' as EntryType, profitPercent: 10 }),
      makeRecord({ entryType: 'p4后' as EntryType, profitPercent: -2 }),
    ];
    expect(calculateProfitRatioByEntryType(records, 'p4后')).toBe(5);
  });

  it('亏损多返回负盈亏比', () => {
    const records = [
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 2 }),
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: -8 }),
    ];
    expect(calculateProfitRatioByEntryType(records, 'p2前')).toBe(-4);
  });

  it('只筛选指定 entryType', () => {
    const records = [
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 10 }),
      makeRecord({ entryType: 'p34' as EntryType, profitPercent: -5 }),
      makeRecord({ entryType: 'p4后' as EntryType, profitPercent: 3 }),
    ];
    // p2前只有一条盈利10
    expect(calculateProfitRatioByEntryType(records, 'p2前')).toBe(10);
  });

  it('保留两位小数', () => {
    const records = [
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 10 }),
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: -3 }),
    ];
    const result = calculateProfitRatioByEntryType(records, 'p2前');
    expect(result).toBeCloseTo(3.33, 2);
  });
});

describe('tradingType 未知不参与聚合', () => {
  it('calculateProfitRatioByType 筛选未知时纳入', () => {
    const records = [
      makeRecord({ tradingType: '未知', profitPercent: 5 }),
    ];
    expect(calculateProfitRatioByType(records, '未知')).toBe(5);
  });

  it('calculateProfitRatioByMultipleTypes 不包含未知', () => {
    const records = [
      makeRecord({ tradingType: '齐飞水底', profitPercent: 5 }),
      makeRecord({ tradingType: '未知', profitPercent: 100 }),
    ];
    // 未知不在聚合数组中，不纳入计算
    const result = calculateProfitRatioByMultipleTypes(records, ['齐飞水底']);
    expect(result).toBe(5);
  });
});

// ============ Phase 2 动态批量计算函数测试 ============

describe('calculateTradingTypeRatios', () => {
  it('批量计算多个交易类型', () => {
    const records = [
      makeRecord({ tradingType: '齐飞水底', profitPercent: 5 }),
      makeRecord({ tradingType: '齐飞水底', profitPercent: -2 }),
      makeRecord({ tradingType: '齐飞前多踩MA', profitPercent: 10 }),
      makeRecord({ tradingType: '齐飞前多踩MA', profitPercent: -5 }),
    ];
    const result = calculateTradingTypeRatios(records, ['齐飞水底', '齐飞前多踩MA', '未知']);
    expect(result['齐飞水底']).toBeCloseTo(2.5, 2);
    expect(result['齐飞前多踩MA']).toBe(2);
    expect(result['未知']).toBeUndefined();
  });

  it('排除未知类型', () => {
    const result = calculateTradingTypeRatios([], ['未知']);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('calculateEntryTypeRatios', () => {
  it('批量计算多个切入类型', () => {
    const records = [
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: 6 }),
      makeRecord({ entryType: 'p2前' as EntryType, profitPercent: -3 }),
      makeRecord({ entryType: 'p34' as EntryType, profitPercent: 4 }),
    ];
    const result = calculateEntryTypeRatios(records, ['p2前', 'p34', 'p4后', '未知']);
    expect(result['p2前']).toBe(2);
    expect(result['p34']).toBe(4);
    expect(result['p4后']).toBe(0);
    expect(result['未知']).toBeUndefined();
  });
});

describe('calculateAggregateRatios', () => {
  it('批量计算聚合规则', () => {
    const records = [
      makeRecord({ tradingType: '齐飞水底', profitPercent: 5 }),
      makeRecord({ tradingType: '齐飞水底', profitPercent: -2 }),
      makeRecord({ tradingType: '齐飞前多踩MA', profitPercent: 3 }),
    ];
    const rules: AggregateRule[] = [
      { name: '齐飞水底总', includedTypes: ['齐飞水底', '齐飞前多踩MA'] },
      { name: '转一致', includedTypes: ['风险释放平台转一致', '双阳平台转一致'] },
    ];
    const result = calculateAggregateRatios(records, rules);
    expect(result['齐飞水底总']).toBe(4);
    expect(result['转一致']).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { validateTradingRecord } from './validationUtils';
import type { TradingRecord } from '@/types';

function makePartial(overrides: Partial<TradingRecord> = {}): Partial<TradingRecord> {
  return {
    openDate: '20240101',
    stockName: '测试股',
    stockCode: '000001',
    tradingType: '齐飞水底',
    trendFeatures: ['未知'],
    patternFeatures: ['系统'],
    hasMistake: '否',
    profitPercent: 5,
    holdDays: 3,
    preMarket: '否',
    ...overrides,
  };
}

describe('validateTradingRecord - trendFeatures', () => {
  it('有效的 trendFeatures p2前 通过', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: ['p2前'] }));
    expect(result.errors.filter(e => e.field === 'trendFeatures')).toHaveLength(0);
  });

  it('有效的 trendFeatures p34 通过', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: ['p34'] }));
    expect(result.errors.filter(e => e.field === 'trendFeatures')).toHaveLength(0);
  });

  it('有效的 trendFeatures p4后 通过', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: ['p4后'] }));
    expect(result.errors.filter(e => e.field === 'trendFeatures')).toHaveLength(0);
  });

  it('有效的 trendFeatures 未知 通过', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: ['未知'] }));
    expect(result.errors.filter(e => e.field === 'trendFeatures')).toHaveLength(0);
  });

  it('空的 trendFeatures 报错', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: [] }));
    const err = result.errors.find(e => e.field === 'trendFeatures');
    expect(err).toBeDefined();
    expect(err!.message).toContain('不能为空');
  });

  it('无效的 trendFeatures 报错', () => {
    const result = validateTradingRecord(makePartial({ trendFeatures: ['invalid'] }));
    const err = result.errors.find(e => e.field === 'trendFeatures');
    expect(err).toBeDefined();
    expect(err!.message).toContain('无效');
  });
});

describe('validateTradingRecord - patternFeatures', () => {
  it('有效的 patternFeatures 系统 通过', () => {
    const result = validateTradingRecord(makePartial({ patternFeatures: ['系统'] }));
    expect(result.errors.filter(e => e.field === 'patternFeatures')).toHaveLength(0);
  });

  it('有效的 patternFeatures 非系统 通过', () => {
    const result = validateTradingRecord(makePartial({ patternFeatures: ['非系统'] }));
    expect(result.errors.filter(e => e.field === 'patternFeatures')).toHaveLength(0);
  });

  it('空的 patternFeatures 允许通过', () => {
    const result = validateTradingRecord(makePartial({ patternFeatures: [] }));
    expect(result.errors.filter(e => e.field === 'patternFeatures')).toHaveLength(0);
  });

  it('无效的 patternFeatures 报错', () => {
    const result = validateTradingRecord(makePartial({ patternFeatures: ['invalid'] }));
    const err = result.errors.find(e => e.field === 'patternFeatures');
    expect(err).toBeDefined();
    expect(err!.message).toContain('无效');
  });
});

describe('validateTradingRecord - tradingType 未知', () => {
  it('tradingType 未知 通过校验', () => {
    const result = validateTradingRecord(makePartial({ tradingType: '未知' }));
    expect(result.errors.filter(e => e.field === 'tradingType')).toHaveLength(0);
  });

  it('tradingType 无效值报错', () => {
    const result = validateTradingRecord(makePartial({ tradingType: '不存在的类型' as any }));
    const err = result.errors.find(e => e.field === 'tradingType');
    expect(err).toBeDefined();
    expect(err!.message).toContain('无效');
  });
});

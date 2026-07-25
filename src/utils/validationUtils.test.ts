import { describe, it, expect } from 'vitest';
import { validateTradingRecord } from './validationUtils';
import type { TradingRecord } from '@/types';

function makePartial(overrides: Partial<TradingRecord> = {}): Partial<TradingRecord> {
  return {
    openDate: '20240101',
    stockName: '测试股',
    stockCode: '000001',
    tradingType: '齐飞水底',
    entryType: ['未知'],
    isSystem: '是',
    hasMistake: '否',
    profitPercent: 5,
    holdDays: 3,
    preMarket: '否',
    ...overrides,
  };
}

describe('validateTradingRecord - entryType', () => {
  it('有效的 entryType p2前 通过', () => {
    const result = validateTradingRecord(makePartial({ entryType: ['p2前'] }));
    expect(result.errors.filter(e => e.field === 'entryType')).toHaveLength(0);
  });

  it('有效的 entryType p34 通过', () => {
    const result = validateTradingRecord(makePartial({ entryType: ['p34'] }));
    expect(result.errors.filter(e => e.field === 'entryType')).toHaveLength(0);
  });

  it('有效的 entryType p4后 通过', () => {
    const result = validateTradingRecord(makePartial({ entryType: ['p4后'] }));
    expect(result.errors.filter(e => e.field === 'entryType')).toHaveLength(0);
  });

  it('有效的 entryType 未知 通过', () => {
    const result = validateTradingRecord(makePartial({ entryType: ['未知'] }));
    expect(result.errors.filter(e => e.field === 'entryType')).toHaveLength(0);
  });

  it('空的 entryType 报错', () => {
    const result = validateTradingRecord(makePartial({ entryType: [] }));
    const err = result.errors.find(e => e.field === 'entryType');
    expect(err).toBeDefined();
    expect(err!.message).toContain('不能为空');
  });

  it('无效的 entryType 报错', () => {
    const result = validateTradingRecord(makePartial({ entryType: ['invalid'] }));
    const err = result.errors.find(e => e.field === 'entryType');
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

import { describe, it, expect } from 'vitest';
import type { TradingRecord, TheoreticalDimension } from '@/types';
import {
  resolveTheoreticalValue,
  normalizeTheoreticalValue,
  materializeTheoreticalRatios,
  prepareTheoreticalForm,
  isExcludedTheoreticalValue,
} from './theoreticalRatio';

const dimensions: TheoreticalDimension[] = [
  { id: 'base', name: '基准', comment: '', isBase: true },
  { id: 'linked', name: '关联', comment: '', isBase: false, baseDimensionId: 'base' },
];

function makeRecord(overrides: Partial<TradingRecord> = {}): TradingRecord {
  return {
    id: 'r1',
    openDate: '20240101',
    stockName: '测试',
    stockCode: '000001',
    tradingType: '齐飞水底',
    trendFeatures: ['未知'],
    patternFeatures: ['系统'],
    hasMistake: '否',
    profitPercent: 5,
    holdDays: 1,
    positionSize: 33,
    images: [],
    imagePrefix: '',
    preMarket: '否',
    hasCycleStats: false,
    hasMonthlyStats: false,
    remark: '',
    theoreticalProfitRatios: {},
    theoreticalProfitDeltas: {},
    ...overrides,
  };
}

describe('normalizeTheoreticalValue', () => {
  it('空值保持未填写', () => {
    expect(normalizeTheoreticalValue(undefined)).toBeUndefined();
    expect(normalizeTheoreticalValue('')).toBeUndefined();
    expect(normalizeTheoreticalValue('   ')).toBeUndefined();
  });

  it('NULL / ±999 归一化为 null', () => {
    expect(normalizeTheoreticalValue(null)).toBeNull();
    expect(normalizeTheoreticalValue(999)).toBeNull();
    expect(normalizeTheoreticalValue(-999)).toBeNull();
    expect(normalizeTheoreticalValue('NULL')).toBeNull();
    expect(normalizeTheoreticalValue('N/A')).toBeNull();
  });

  it('普通数字保持', () => {
    expect(normalizeTheoreticalValue(12.5)).toBe(12.5);
    expect(normalizeTheoreticalValue('12.5%')).toBe(12.5);
  });
});

describe('resolveTheoreticalValue', () => {
  it('未填写基准 → 回退盈亏情况', () => {
    expect(resolveTheoreticalValue(makeRecord({ profitPercent: 7 }), dimensions[0], dimensions)).toBe(7);
  });

  it('基准显式 NULL → 排除', () => {
    const record = makeRecord({ theoreticalProfitRatios: { base: null } });
    expect(resolveTheoreticalValue(record, dimensions[0], dimensions)).toBeNull();
    expect(isExcludedTheoreticalValue(record.theoreticalProfitRatios.base)).toBe(true);
  });

  it('历史 ±999 视为 NULL', () => {
    const record = makeRecord({ theoreticalProfitRatios: { base: -999 } });
    expect(resolveTheoreticalValue(record, dimensions[0], dimensions)).toBeNull();
  });

  it('关联维度 = 基准值 + 变化率', () => {
    const record = makeRecord({
      theoreticalProfitRatios: { base: 10 },
      theoreticalProfitDeltas: { linked: 2 },
    });
    expect(resolveTheoreticalValue(record, dimensions[1], dimensions)).toBe(12);
  });

  it('基准 NULL 时关联维度一并排除', () => {
    const record = makeRecord({
      theoreticalProfitRatios: { base: null },
      theoreticalProfitDeltas: { linked: 2 },
    });
    expect(resolveTheoreticalValue(record, dimensions[1], dimensions)).toBeNull();
  });

  it('变化率 NULL 时关联维度排除', () => {
    const record = makeRecord({
      theoreticalProfitRatios: { base: 10 },
      theoreticalProfitDeltas: { linked: null },
    });
    expect(resolveTheoreticalValue(record, dimensions[1], dimensions)).toBeNull();
  });
});

describe('materializeTheoreticalRatios', () => {
  it('保留基准 NULL，关联维度写 null', () => {
    const result = materializeTheoreticalRatios({
      profitPercent: 5,
      theoreticalProfitRatios: { base: null },
      theoreticalProfitDeltas: { linked: 2 },
    }, dimensions);
    expect(result.theoreticalProfitRatios.base).toBeNull();
    expect(result.theoreticalProfitRatios.linked).toBeNull();
  });

  it('基准为空时关联维度按盈亏情况 + 变化率', () => {
    const result = materializeTheoreticalRatios({
      profitPercent: 5,
      theoreticalProfitRatios: {},
      theoreticalProfitDeltas: { linked: 1 },
    }, dimensions);
    expect(result.theoreticalProfitRatios.linked).toBe(6);
  });

  it('历史 ±999 在材料化时归一化为 null', () => {
    const result = materializeTheoreticalRatios({
      profitPercent: 5,
      theoreticalProfitRatios: { base: 999 },
    }, dimensions);
    expect(result.theoreticalProfitRatios.base).toBeNull();
  });
});

describe('prepareTheoreticalForm', () => {
  it('基准 NULL 在表单中保留为 null', () => {
    const form = prepareTheoreticalForm(makeRecord({
      theoreticalProfitRatios: { base: null },
    }), dimensions);
    expect(form.theoreticalProfitRatios.base).toBeNull();
  });

  it('关联维度按已存结果反推变化率', () => {
    const form = prepareTheoreticalForm(makeRecord({
      theoreticalProfitRatios: { base: 10, linked: 12 },
    }), dimensions);
    expect(form.theoreticalProfitDeltas.linked).toBe(2);
  });
});

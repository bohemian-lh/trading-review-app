import { describe, it, expect } from 'vitest';
import type { TradingRecord, TheoreticalDimension, AnalysisTabGroup } from '@/types';
import {
  getSourceValue,
  mergeGroupRecords,
  computeCumulativeProfit,
  computeCycleProfitRatios,
} from './analysisTabService';

const dimensions: TheoreticalDimension[] = [
  { id: 'd1', name: '维度1', comment: '', isBase: true },
  { id: 'd2', name: '维度2', comment: '', isBase: false, baseDimensionId: 'd1' },
];

const emptyFilter = {
  tradingTypes: [],
  trendFeatures: [],
  patternFeatures: [],
  hasMistake: [],
  startDate: '202301',
  endDate: '202512',
};

const groups: AnalysisTabGroup[] = [
  { filter: emptyFilter, source: 'dim:d1', mode: 'merge' },
];

function makeRecord(id: string, overrides: Partial<TradingRecord> = {}): TradingRecord {
  return {
    id,
    openDate: `2024010${id.length}`,
    stockName: `测试${id}`,
    stockCode: '000001',
    tradingType: '齐飞水底',
    trendFeatures: ['未知'],
    patternFeatures: ['系统'],
    hasMistake: '否',
    profitPercent: 4,
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

describe('getSourceValue - NULL 语义', () => {
  it('未填写回退盈亏情况', () => {
    expect(getSourceValue(makeRecord('a', { profitPercent: 6 }), 'dim:d1', dimensions)).toBe(6);
  });

  it('显式 NULL 返回 null', () => {
    const record = makeRecord('a', { theoreticalProfitRatios: { d1: null } });
    expect(getSourceValue(record, 'dim:d1', dimensions)).toBeNull();
  });

  it('关联维度基准 NULL 时返回 null', () => {
    const record = makeRecord('a', {
      theoreticalProfitRatios: { d1: null },
      theoreticalProfitDeltas: { d2: 1 },
    });
    expect(getSourceValue(record, 'dim:d2', dimensions)).toBeNull();
  });
});

describe('mergeGroupRecords - 排除 NULL 记录', () => {
  it('NULL 记录不进入合并结果，未填写仍回退参与', () => {
    const records = [
      makeRecord('a', { openDate: '20240101', theoreticalProfitRatios: { d1: 10 } }),
      makeRecord('b', { openDate: '20240102', theoreticalProfitRatios: { d1: null } }),
      makeRecord('c', { openDate: '20240103', profitPercent: 4 }),
    ];
    const merged = mergeGroupRecords(records, groups, dimensions);
    expect(merged.map(item => item.record.id)).toEqual(['a', 'c']);
    expect(merged[0].value).toBe(10);
    expect(merged[1].value).toBe(4);
  });
});

describe('曲线类统计 - 按有效记录重排', () => {
  const records = [
    makeRecord('a', { openDate: '20240101', theoreticalProfitRatios: { d1: 10 } }),
    makeRecord('b', { openDate: '20240102', theoreticalProfitRatios: { d1: null } }),
    makeRecord('c', { openDate: '20240103', theoreticalProfitRatios: { d1: 4 } }),
  ];

  it('累计曲线跳过 NULL 记录', () => {
    const points = computeCumulativeProfit(records, 'dim:d1', dimensions);
    expect(points.map(p => p.value)).toEqual([10, 14]);
    expect(points.map(p => p.index)).toEqual([1, 2]);
  });

  it('周期图按有效记录切分', () => {
    const points = computeCycleProfitRatios(records, 'dim:d1', 2, dimensions);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(14);
  });
});

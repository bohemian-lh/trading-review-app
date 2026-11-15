import { describe, expect, it } from 'vitest';
import { clampLimit, dayExpr, keysetWhere, makeCursor, parseCursor, parsePageParams } from './pagination';

describe('clampLimit', () => {
  it('缺省与非法值回退到默认页大小', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit('abc')).toBe(50);
    expect(clampLimit(0)).toBe(50);
    expect(clampLimit(-3, 20)).toBe(20);
  });

  it('超过上限时收敛到 MAX_PAGE_SIZE', () => {
    expect(clampLimit(10_000)).toBe(200);
    expect(clampLimit('30')).toBe(30);
  });
});

describe('parsePageParams', () => {
  it('sort 只接受 asc/desc，其它值用默认方向', () => {
    const url = new URL('https://x/api/records?limit=abc&sort=up');
    expect(parsePageParams(url, 'desc', 20)).toEqual({ limit: 20, cursor: null, sort: 'desc' });
  });

  it('读取 cursor 与 sort', () => {
    const url = new URL('https://x/api/records?cursor=20240101%7Cabc&sort=asc&limit=5');
    expect(parsePageParams(url)).toEqual({ limit: 5, cursor: '20240101|abc', sort: 'asc' });
  });
});

describe('cursor 编解码', () => {
  it('makeCursor 把空值写成空串，保持列数', () => {
    expect(makeCursor(['20240101', null, 'a'])).toBe('20240101||a');
    expect(makeCursor([1, 2])).toBe('1|2');
  });

  it('parseCursor 列数不足时视为无效游标', () => {
    expect(parseCursor(null, 3)).toBeNull();
    expect(parseCursor('only-one', 3)).toBeNull();
    expect(parseCursor('a|', 2)).toEqual(['a', '']);
    expect(parseCursor('a|b|c', 2)).toEqual(['a', 'b']);
  });
});

describe('keysetWhere', () => {
  it('desc 生成嵌套小于比较，参数顺序与占位符一致', () => {
    const { sql, params } = keysetWhere(['day', 'created_at', 'id'], ['20240101', 't1', 'a'], 'desc');
    expect(sql).toBe('(day < ? OR (day = ? AND (created_at < ? OR (created_at = ? AND (id < ?)))))');
    expect(params).toEqual(['20240101', '20240101', 't1', 't1', 'a']);
  });

  it('asc 用大于号', () => {
    const { sql, params } = keysetWhere(['id'], ['x'], 'asc');
    expect(sql).toBe('(id > ?)');
    expect(params).toEqual(['x']);
  });

  it('两列比较', () => {
    const { sql, params } = keysetWhere(['day', 'id'], ['20240101', 'a'], 'desc');
    expect(sql).toBe('(day < ? OR (day = ? AND (id < ?)))');
    expect(params).toEqual(['20240101', '20240101', 'a']);
  });
});

describe('dayExpr', () => {
  it('统一 8 位归一化表达式', () => {
    expect(dayExpr()).toBe("substr(replace(open_date, '-', ''), 1, 8)");
    expect(dayExpr('j.open_date')).toBe("substr(replace(j.open_date, '-', ''), 1, 8)");
  });
});

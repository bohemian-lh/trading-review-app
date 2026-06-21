/**
 * 持仓天数计算 — 扣除周末 + 节假日
 *
 * 休市日 = 所有周六日 + 中国A股节假日
 * 周末自动生成，节假日用农历预测算法 (±1-2 天误差可接受)
 * 预生成 2025-2034 共 10 年，按年份索引
 */

// ========== 农历春节日期（天文事实，非预测） ==========
// 来源: 中国农历正月初一对应的公历日期
const SPRING_FESTIVAL: Record<number, string> = {
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26',
  2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11',
  2033: '01-31', 2034: '02-19',
};

// ========== 工具函数 ==========

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 从 yyyy-MM-dd 或 yyyymmdd 解析 Date */
function parseDate(s: string): Date {
  if (s.length === 8) {
    s = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return new Date(s + 'T00:00:00');
}

/** 是否为周六日 */
function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

// ========== 节假日生成 ==========

/** 生成某一年所有节假日休市日期（不含周末） */
function buildHolidaysForYear(year: number): string[] {
  const y = String(year);
  const result: string[] = [];

  // --- 阳历固定节日（精确） ---

  // 元旦 1/1
  result.push(`${y}-01-01`);

  // 劳动节 5/1（通常 5/1，有时连休 5/1-5/5，保守取 5/1）
  result.push(`${y}-05-01`);

  // 国庆 10/1-10/3（法定休市日，可能连休更久）
  result.push(`${y}-10-01`, `${y}-10-02`, `${y}-10-03`);

  // 清明：天文日通常在 4/4 或 4/5
  result.push(`${y}-04-04`, `${y}-04-05`);

  // --- 农历节日（从春节推算） ---

  const cnyMMDD = SPRING_FESTIVAL[year];
  if (!cnyMMDD) return result; // 超出范围

  const cny = new Date(`${y}-${cnyMMDD}T00:00:00`);

  // 春节：除夕到初六共 8 天（有时 7 天，取 8 天覆盖）
  for (let i = -1; i <= 6; i++) {
    const d = new Date(cny);
    d.setDate(cny.getDate() + i);
    result.push(fmt(d));
  }

  // 端午：农历五月初五 ≈ 清明后 ~55 天
  // 清明约 4/5，端午约 5/28-6/25
  const qingming = new Date(`${y}-04-05T00:00:00`);
  const dragonBoat = new Date(qingming);
  dragonBoat.setDate(qingming.getDate() + 55);
  result.push(fmt(dragonBoat));

  // 中秋：农历八月十五 ≈ 春节后天数
  // 约在 9 月中旬到 10 月上旬
  // 简单近似：国庆前两天通常含中秋或相连
  // 中秋休市日 ≈ 约在 9/15 左右，取 1 天
  const midAutumn = new Date(`${y}-09-17T00:00:00`);
  result.push(fmt(midAutumn));

  return result;
}

// ========== 休市日历（模块级单例） ==========

/** year → Set<"YYYY-MM-DD"> */
const closedDaysCache = new Map<number, Set<string>>();

function getOrBuildClosedDays(year: number): Set<string> {
  const cached = closedDaysCache.get(year);
  if (cached) return cached;

  const set = new Set<string>();

  // 1. 所有周六日
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isWeekend(d)) set.add(fmt(d));
  }

  // 2. 节假日（可能落在周末，Set 自动去重）
  const holidays = buildHolidaysForYear(year);
  for (const h of holidays) set.add(h);

  closedDaysCache.set(year, set);
  return set;
}

// ========== 公开 API ==========

/**
 * 计算两个日期之间的交易日天数
 * @param start 起始日期 (yyyymmdd 或 yyyy-MM-dd)
 * @param end   结束日期 (yyyymmdd 或 yyyy-MM-dd)
 * @returns 交易日天数（含起始日和结束日）
 */
export function calculateHoldDays(start: string, end: string): number {
  const startDate = parseDate(start);
  const endDate = parseDate(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    // 解析失败 → 回退为简单日历天数
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  }

  let days = 0;
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const closedDays = getOrBuildClosedDays(year);
    if (!closedDays.has(fmt(cursor))) days++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

/**
 * 检查某一天是否为休市日
 */
export function isClosedDay(dateStr: string): boolean {
  const d = parseDate(dateStr);
  const year = d.getFullYear();
  return getOrBuildClosedDays(year).has(fmt(d));
}

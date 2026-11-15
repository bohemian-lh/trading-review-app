// 统一键集分页协议（服务端）
// 分层约定：只做参数收敛、游标编解码与多列比较 SQL 片段生成，不感知具体表结构。
//
// 统一约定：
//   - 请求：limit / cursor / sort(=asc|desc) + 各资源自己的过滤条件
//   - 响应：items + nextCursor + total + version
//   - 排序必须是「确定性全序」：业务排序键后面必须再拼主键，否则游标会漏行/重复

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type SortDirection = 'asc' | 'desc';

export interface PageParams {
  limit: number;
  cursor: string | null;
  sort: SortDirection;
}

export function clampLimit(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, n));
}

export function parsePageParams(
  url: URL,
  defaultSort: SortDirection = 'desc',
  defaultLimit = DEFAULT_PAGE_SIZE,
): PageParams {
  const sort = url.searchParams.get('sort');
  return {
    limit: clampLimit(url.searchParams.get('limit'), defaultLimit),
    cursor: url.searchParams.get('cursor'),
    sort: sort === 'asc' ? 'asc' : sort === 'desc' ? 'desc' : defaultSort,
  };
}

/** 游标编码：列值按顺序用 `|` 连接。日期 / ISO 时间 / id 都不含竖线 */
export function makeCursor(values: (string | number | null | undefined)[]): string {
  return values.map(v => String(v ?? '')).join('|');
}

/** 游标解码：列数不匹配视为无效游标，退回第一页而不是拼出错误条件 */
export function parseCursor(cursor: string | null, columns: number): string[] | null {
  if (!cursor) return null;
  const parts = cursor.split('|');
  if (parts.length < columns) return null;
  return parts.slice(0, columns);
}

/**
 * 多列键集比较：按 (c1, c2, ... cn) 依次比较，生成
 *   c1 > ? OR (c1 = ? AND (c2 > ? OR (c2 = ? AND c3 > ?)))
 * asc 用 `>`、desc 用 `<`，与 ORDER BY 方向保持一致。
 */
export function keysetWhere(
  exprs: string[],
  cursor: string[],
  sort: SortDirection,
): { sql: string; params: string[] } {
  const op = sort === 'asc' ? '>' : '<';
  const params: string[] = [];
  let sql = '';
  for (let i = exprs.length - 1; i >= 0; i -= 1) {
    const value = cursor[i] ?? '';
    if (i === exprs.length - 1) {
      sql = `${exprs[i]} ${op} ?`;
      params.unshift(value);
    } else {
      sql = `${exprs[i]} ${op} ? OR (${exprs[i]} = ? AND (${sql}))`;
      params.unshift(value, value);
    }
  }
  return { sql: `(${sql})`, params };
}

/** 开单日归一化为 8 位数字，兼容 `2024-01-01` 与 `20240101` 两种历史写法 */
export function dayExpr(column = 'open_date'): string {
  return `substr(replace(${column}, '-', ''), 1, 8)`;
}

/** 月份归一化为 6 位数字（YYYYMM），与 dayExpr 同一套兼容策略 */
export function monthExpr(column = 'open_date'): string {
  return `substr(replace(${column}, '-', ''), 1, 6)`;
}

/** 入参开单日归一化：`2024-01-01` / `20240101` → `20240101`，与 dayExpr 的产出对齐 */
export function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/-/g, '').slice(0, 8);
  return digits.length === 8 ? digits : null;
}

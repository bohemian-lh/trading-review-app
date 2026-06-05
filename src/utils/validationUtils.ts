import type { TradingRecord, ValidationResult, ValidationError } from '@/types';
import { parseDate } from './dateUtils';

const TRADING_TYPES = ['齐飞水底', '齐飞水底三等量', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致', '非系统'];

export function validateTradingRecord(
  record: Partial<TradingRecord>,
  rowIndex?: number
): ValidationResult {
  const errors: ValidationError[] = [];

  // 开单时间验证
  if (!record.openDate) {
    errors.push({
      field: 'openDate',
      message: '开单时间不能为空',
      row: rowIndex,
    });
  } else if (!/^\d{8}$/.test(record.openDate)) {
    errors.push({
      field: 'openDate',
      message: '开单时间格式错误，必须为8位数字（yyyymmdd）',
      row: rowIndex,
    });
  } else if (!parseDate(record.openDate)) {
    errors.push({
      field: 'openDate',
      message: '开单时间不是有效的日期',
      row: rowIndex,
    });
  }

  // 股票名称验证
  if (!record.stockName || !record.stockName.trim()) {
    errors.push({
      field: 'stockName',
      message: '股票名称不能为空',
      row: rowIndex,
    });
  }

  // 股票代码验证
  if (!record.stockCode || !record.stockCode.trim()) {
    errors.push({
      field: 'stockCode',
      message: '股票代码不能为空',
      row: rowIndex,
    });
  }

  // 交易类型验证
  if (!record.tradingType) {
    errors.push({
      field: 'tradingType',
      message: '交易类型不能为空',
      row: rowIndex,
    });
  } else if (!TRADING_TYPES.includes(record.tradingType)) {
    errors.push({
      field: 'tradingType',
      message: `交易类型无效，应为以下之一：${TRADING_TYPES.join('、')}`,
      row: rowIndex,
    });
  }

  // 系统符合验证
  if (!record.isSystem) {
    errors.push({
      field: 'isSystem',
      message: '是否符合系统不能为空',
      row: rowIndex,
    });
  } else if (!['是', '否'].includes(record.isSystem)) {
    errors.push({
      field: 'isSystem',
      message: '是否符合系统值无效',
      row: rowIndex,
    });
  }

  // 失误验证
  if (!record.hasMistake) {
    errors.push({
      field: 'hasMistake',
      message: '有无大的失误不能为空',
      row: rowIndex,
    });
  } else if (!['是', '否', '其他'].includes(record.hasMistake)) {
    errors.push({
      field: 'hasMistake',
      message: '有无大的失误值无效',
      row: rowIndex,
    });
  }

  // 盈亏情况验证
  if (record.profitPercent === undefined || record.profitPercent === null) {
    errors.push({
      field: 'profitPercent',
      message: '盈亏情况不能为空',
      row: rowIndex,
    });
  } else if (typeof record.profitPercent !== 'number' || isNaN(record.profitPercent)) {
    errors.push({
      field: 'profitPercent',
      message: '盈亏情况必须是数字',
      row: rowIndex,
    });
  } else if (record.profitPercent < -100) {
    errors.push({
      field: 'profitPercent',
      message: '盈亏情况不能小于-100%',
      row: rowIndex,
    });
  } else if (record.profitPercent > 1000) {
    errors.push({
      field: 'profitPercent',
      message: '盈亏情况不能大于1000%',
      row: rowIndex,
    });
  }

  // 持仓时间验证
  if (record.holdDays === undefined || record.holdDays === null) {
    errors.push({
      field: 'holdDays',
      message: '持仓时间不能为空',
      row: rowIndex,
    });
  } else if (
    typeof record.holdDays !== 'number' ||
    !Number.isInteger(record.holdDays) ||
    record.holdDays < 0
  ) {
    errors.push({
      field: 'holdDays',
      message: '持仓时间必须是非负整数',
      row: rowIndex,
    });
  } else if (record.holdDays > 3650) {
    errors.push({
      field: 'holdDays',
      message: '持仓时间不能超过3650天（10年）',
      row: rowIndex,
    });
  }

  // 盘前验证
  if (record.preMarket !== undefined && !['是', '否'].includes(record.preMarket)) {
    errors.push({
      field: 'preMarket',
      message: '盘前值无效',
      row: rowIndex,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateTradingRecords(records: Partial<TradingRecord>[]): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (let i = 0; i < records.length; i++) {
    const result = validateTradingRecord(records[i], i + 2);
    allErrors.push(...result.errors);
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

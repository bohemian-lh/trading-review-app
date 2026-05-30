import type { TradingRecord, ValidationResult, ValidationError } from '@/types';
import { parseDate } from './dateUtils';

const TRADING_TYPES = ['齐飞水底', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致'];

export function validateTradingRecord(
  record: Partial<TradingRecord>,
  rowIndex?: number
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!record.openDate) {
    errors.push({
      field: 'openDate',
      message: '开单时间不能为空',
      row: rowIndex,
    });
  } else if (!parseDate(record.openDate)) {
    errors.push({
      field: 'openDate',
      message: '开单时间格式错误，应为yyyymmdd',
      row: rowIndex,
    });
  }

  if (!record.stockName) {
    errors.push({
      field: 'stockName',
      message: '股票名称不能为空',
      row: rowIndex,
    });
  }

  if (!record.stockCode) {
    errors.push({
      field: 'stockCode',
      message: '股票代码不能为空',
      row: rowIndex,
    });
  }

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

  if (!record.hasMistake) {
    errors.push({
      field: 'hasMistake',
      message: '有无大的失误不能为空',
      row: rowIndex,
    });
  }

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
  }

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
      message: '持仓时间必须是正整数',
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

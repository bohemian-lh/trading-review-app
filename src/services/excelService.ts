import * as XLSX from 'xlsx';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';
import { generateId } from '@/utils';

const SHEET_NAME_1 = '表1-交易复盘数据';
const HEADERS_1 = [
  '开单时间',
  '股票名称',
  '股票代码',
  '交易类型',
  '是否符合系统',
  '有无大的失误',
  '盈亏情况',
  '持仓时间',
  '股票走势1',
  '股票走势2',
  '关键分时1',
  '关键分时2',
  '盘前是否',
];

const SHEET_NAME_2 = '表2-动态数据分析';
const HEADERS_2 = [
  '指标',
  '数值',
];

const SHEET_NAME_3 = '表3-月度统计';
const HEADERS_3 = [
  '月份',
  '系统盈利胜率',
  '系统无失误盈利胜率',
  '系统有失误盈利胜率',
  '非系统盈利胜率',
  '系统盈利平均持仓天数',
  '系统亏损平均持仓天数',
  '非系统盈利平均持仓天数',
  '非系统亏损平均持仓天数',
];

export interface ParseResult {
  records: TradingRecord[];
  errors: string[];
}

export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[SHEET_NAME_1];

        if (!worksheet) {
          resolve({
            records: [],
            errors: [`未找到工作表：${SHEET_NAME_1}`],
          });
          return;
        }

        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { defval: '' });
        const records: TradingRecord[] = [];
        const errors: string[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          try {
            const record = mapRowToRecord(row);
            if (record) {
              records.push(record);
            }
          } catch (err) {
            errors.push(`行 ${i + 1}: ${err instanceof Error ? err.message : '未知错误'}`);
          }
        }

        resolve({ records, errors });
      } catch (err) {
        reject(new Error(`解析Excel文件失败: ${err instanceof Error ? err.message : '未知错误'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}

function mapRowToRecord(row: any): TradingRecord | null {
  if (!row['开单时间'] && !row['股票名称']) {
    return null;
  }

  return {
    id: generateId(),
    openDate: String(row['开单时间'] || ''),
    stockName: String(row['股票名称'] || ''),
    stockCode: String(row['股票代码'] || ''),
    tradingType: row['交易类型'] || '齐飞水底',
    isSystem: row['是否符合系统'] === '是' ? '是' : '否',
    hasMistake: row['有无大的失误'] === '是' ? '是' : '否',
    profitPercent: Number(row['盈亏情况']) || 0,
    holdDays: Number(row['持仓时间']) || 0,
    chart1: row['股票走势1'] || '',
    chart2: row['股票走势2'] || '',
    keyChart1: row['关键分时1'] || '',
    keyChart2: row['关键分时2'] || '',
    preMarket: row['盘前是否'] === '是' ? '是' : '否',
  };
}

export function exportTable1ToExcel(records: TradingRecord[], filename: string): void {
  const workbook = XLSX.utils.book_new();

  const data = [
    HEADERS_1,
    ...records.map((record) => [
      record.openDate,
      record.stockName,
      record.stockCode,
      record.tradingType,
      record.isSystem,
      record.hasMistake,
      record.profitPercent,
      record.holdDays,
      record.chart1 || '',
      record.chart2 || '',
      record.keyChart1 || '',
      record.keyChart2 || '',
      record.preMarket,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);

  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_1);
  XLSX.writeFile(workbook, filename);
}

export function exportTable2ToExcel(analysis: AnalysisResult, filename: string): void {
  const workbook = XLSX.utils.book_new();

  const data = [
    HEADERS_2,
    ['系统盈利胜率', formatValue(analysis.systemProfitRatio)],
    ['系统无失误盈利胜率', formatValue(analysis.systemNoMistakeProfitRatio)],
    ['系统有失误盈利胜率', formatValue(analysis.systemWithMistakeProfitRatio)],
    ['非系统盈利胜率', formatValue(analysis.nonSystemProfitRatio)],
    ['系统盈利平均持仓天数', formatValue(analysis.systemProfitAvgHoldDays)],
    ['系统亏损平均持仓天数', formatValue(analysis.systemLossAvgHoldDays)],
    ['非系统盈利平均持仓天数', formatValue(analysis.nonSystemProfitAvgHoldDays)],
    ['非系统亏损平均持仓天数', formatValue(analysis.nonSystemLossAvgHoldDays)],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);

  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 15 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_2);
  XLSX.writeFile(workbook, filename);
}

export function exportTable3ToExcel(monthlyAnalysis: MonthlyAnalysis[], filename: string): void {
  const workbook = XLSX.utils.book_new();

  const data = [
    HEADERS_3,
    ...monthlyAnalysis.map((item) => [
      item.month,
      formatValue(item.systemProfitRatio),
      formatValue(item.systemNoMistakeProfitRatio),
      formatValue(item.systemWithMistakeProfitRatio),
      formatValue(item.nonSystemProfitRatio),
      formatValue(item.systemProfitAvgHoldDays),
      formatValue(item.systemLossAvgHoldDays),
      formatValue(item.nonSystemProfitAvgHoldDays),
      formatValue(item.nonSystemLossAvgHoldDays),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);

  worksheet['!cols'] = [
    { wch: 10 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_3);
  XLSX.writeFile(workbook, filename);
}

function formatValue(value: number | 'N/A'): string {
  if (value === 'N/A') return 'N/A';
  return `${value.toFixed(2)}%`;
}

export function exportToExcel(records: TradingRecord[], filename: string): void {
  exportTable1ToExcel(records, filename);
}

export function createEmptyWorkbook(): void {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS_1]);

  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_1);
  XLSX.writeFile(workbook, '交易复盘模板.xlsx');
}

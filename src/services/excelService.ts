import * as XLSX from 'xlsx';
import type { TradingRecord } from '@/types';
import { generateId } from '@/utils';

const SHEET_NAME = '表1-交易复盘数据';
const HEADERS = [
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
        const worksheet = workbook.Sheets[SHEET_NAME];

        if (!worksheet) {
          resolve({
            records: [],
            errors: [`未找到工作表：${SHEET_NAME}`],
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

export function exportToExcel(records: TradingRecord[], filename: string): void {
  const workbook = XLSX.utils.book_new();

  const data = [
    HEADERS,
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

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
  XLSX.writeFile(workbook, filename);
}

export function createEmptyWorkbook(): void {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS]);

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

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
  XLSX.writeFile(workbook, '交易复盘模板.xlsx');
}

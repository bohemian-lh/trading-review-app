import * as XLSX from 'xlsx';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, TradingType, CustomAnalysisData, CustomMonthlyData } from '@/types';
import { generateId } from '@/utils';

export const SHEET_NAME_1 = '表1-交易复盘数据';
export const SHEET_NAME_2 = '表2-动态数据分析';
export const SHEET_NAME_3 = '表3-月度统计';

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

const HEADERS_2 = [
  '指标',
  '数值',
];

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

export type ImportTableType = 'table1' | 'table2' | 'table3';

export type ImportMode = 'append' | 'overwrite';

export interface ParseResult {
  records?: TradingRecord[];
  analysis?: AnalysisResult;
  monthlyAnalysis?: MonthlyAnalysis[];
  errors: string[];
}

export interface ImportOptions {
  tables: ImportTableType[];
  mode: ImportMode;
}

export function parseExcelFile(
  file: File,
  options: ImportOptions
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('文件不存在'));
      return;
    }

    if (file.size === 0) {
      reject(new Error('文件为空'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        if (!e.target?.result) {
          reject(new Error('读取文件内容失败'));
          return;
        }

        const data = new Uint8Array(e.target.result as ArrayBuffer);
        if (data.length === 0) {
          reject(new Error('文件内容为空'));
          return;
        }

        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const result: ParseResult = {
          records: options.tables.includes('table1') ? [] : undefined,
          analysis: options.tables.includes('table2') ? undefined : undefined,
          monthlyAnalysis: options.tables.includes('table3') ? [] : undefined,
          errors: [],
        };

        if (options.tables.includes('table1')) {
          const worksheet = workbook.Sheets[SHEET_NAME_1];
          if (!worksheet) {
            result.errors.push(`未找到工作表：${SHEET_NAME_1}`);
          } else {
            const { records, errors } = parseTable1(worksheet);
            result.records = records;
            result.errors.push(...errors);
          }
        }

        if (options.tables.includes('table2')) {
          const worksheet = workbook.Sheets[SHEET_NAME_2];
          if (!worksheet) {
            result.errors.push(`未找到工作表：${SHEET_NAME_2}`);
          } else {
            result.analysis = parseTable2(worksheet);
          }
        }

        if (options.tables.includes('table3')) {
          const worksheet = workbook.Sheets[SHEET_NAME_3];
          if (!worksheet) {
            result.errors.push(`未找到工作表：${SHEET_NAME_3}`);
          } else {
            const { monthlyAnalysis, errors } = parseTable3(worksheet);
            result.monthlyAnalysis = monthlyAnalysis;
            result.errors.push(...errors);
          }
        }

        resolve(result);
      } catch (err) {
        reject(new Error(`解析Excel文件失败: ${err instanceof Error ? err.message : '未知错误'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('读取文件失败: ' + (reader.error?.message || '未知错误')));
    };

    reader.onabort = () => {
      reject(new Error('读取文件被取消'));
    };

    reader.onloadend = (e) => {
      if (!e.target?.result) {
        reject(new Error('读取文件结束但没有数据'));
      }
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch (err) {
      reject(new Error('启动读取文件失败: ' + (err instanceof Error ? err.message : '未知错误')));
    }

    setTimeout(() => {
      if (reader.readyState === 1) {
        reject(new Error('读取文件超时'));
      }
    }, 30000);
  });
}

function parseTable1(worksheet: XLSX.WorkSheet): {
  records: TradingRecord[];
  errors: string[];
} {
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  const records: TradingRecord[] = [];
  const errors: string[] = [];

  for (let i = 0; i < jsonData.length; i++) {
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

  return { records, errors };
}

function parseTable2(worksheet: XLSX.WorkSheet): AnalysisResult | undefined {
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  const analysisMap = new Map<string, number | 'N/A'>();

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    const key = String(row['指标'] || '');
    const value = row['数值'];
    
    if (key) {
      analysisMap.set(key, parseValue(value));
    }
  }

  return {
    systemProfitRatio: analysisMap.get('系统盈利胜率') || 'N/A',
    systemNoMistakeProfitRatio: analysisMap.get('系统无失误盈利胜率') || 'N/A',
    systemWithMistakeProfitRatio: analysisMap.get('系统有失误盈利胜率') || 'N/A',
    nonSystemProfitRatio: analysisMap.get('非系统盈利胜率') || 'N/A',
    systemProfitAvgHoldDays: analysisMap.get('系统盈利平均持仓天数') || 'N/A',
    systemLossAvgHoldDays: analysisMap.get('系统亏损平均持仓天数') || 'N/A',
    nonSystemProfitAvgHoldDays: analysisMap.get('非系统盈利平均持仓天数') || 'N/A',
    nonSystemLossAvgHoldDays: analysisMap.get('非系统亏损平均持仓天数') || 'N/A',
  };
}

function parseTable3(worksheet: XLSX.WorkSheet): {
  monthlyAnalysis: MonthlyAnalysis[];
  errors: string[];
} {
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  const monthlyAnalysis: MonthlyAnalysis[] = [];
  const errors: string[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    try {
      const month = String(row['月份'] || '');
      if (!month) continue;

      monthlyAnalysis.push({
        month,
        systemProfitRatio: parseValue(row['系统盈利胜率']),
        systemNoMistakeProfitRatio: parseValue(row['系统无失误盈利胜率']),
        systemWithMistakeProfitRatio: parseValue(row['系统有失误盈利胜率']),
        nonSystemProfitRatio: parseValue(row['非系统盈利胜率']),
        systemProfitAvgHoldDays: parseValue(row['系统盈利平均持仓天数']),
        systemLossAvgHoldDays: parseValue(row['系统亏损平均持仓天数']),
        nonSystemProfitAvgHoldDays: parseValue(row['非系统盈利平均持仓天数']),
        nonSystemLossAvgHoldDays: parseValue(row['非系统亏损平均持仓天数']),
      });
    } catch (err) {
      errors.push(`行 ${i + 1}: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }

  return { monthlyAnalysis, errors };
}

function parseValue(value: unknown): number | 'N/A' {
  if (value === 'N/A' || value === '' || value === undefined) {
    return 'N/A';
  }
  // 移除可能的百分号
  const strValue = String(value).trim().replace('%', '');
  const num = parseFloat(strValue);
  return isNaN(num) ? 'N/A' : num;
}

function mapRowToRecord(row: Record<string, unknown>): TradingRecord | null {
  if (!row['开单时间'] && !row['股票名称']) {
    return null;
  }

  const tradingType = row['交易类型'] as string;
  const validTradingTypes = ['齐飞水底', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致'] as const;
  const validTradingType = validTradingTypes.includes(tradingType as any) 
    ? tradingType as TradingType 
    : '齐飞水底';

  // 解析盈亏情况，可能带有 %
  const profitStr = String(row['盈亏情况'] || '').trim().replace('%', '');
  const profitPercent = parseFloat(profitStr) || 0;
  
  // 解析持仓时间
  const holdDays = parseInt(String(row['持仓时间'] || '').trim(), 10) || 0;

  return {
    id: generateId(),
    openDate: String(row['开单时间'] || ''),
    stockName: String(row['股票名称'] || ''),
    stockCode: String(row['股票代码'] || ''),
    tradingType: validTradingType,
    isSystem: row['是否符合系统'] === '是' ? '是' : '否',
    hasMistake: row['有无大的失误'] === '是' ? '是' : '否',
    profitPercent,
    holdDays,
    chart1: (row['股票走势1'] as string) || '',
    chart2: (row['股票走势2'] as string) || '',
    keyChart1: (row['关键分时1'] as string) || '',
    keyChart2: (row['关键分时2'] as string) || '',
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
    ['系统盈利胜率', formatValue(analysis.systemProfitRatio, true)],
    ['系统无失误盈利胜率', formatValue(analysis.systemNoMistakeProfitRatio, true)],
    ['系统有失误盈利胜率', formatValue(analysis.systemWithMistakeProfitRatio, true)],
    ['非系统盈利胜率', formatValue(analysis.nonSystemProfitRatio, true)],
    ['系统盈利平均持仓天数', formatValue(analysis.systemProfitAvgHoldDays, false)],
    ['系统亏损平均持仓天数', formatValue(analysis.systemLossAvgHoldDays, false)],
    ['非系统盈利平均持仓天数', formatValue(analysis.nonSystemProfitAvgHoldDays, false)],
    ['非系统亏损平均持仓天数', formatValue(analysis.nonSystemLossAvgHoldDays, false)],
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
      formatValue(item.systemProfitRatio, true),
      formatValue(item.systemNoMistakeProfitRatio, true),
      formatValue(item.systemWithMistakeProfitRatio, true),
      formatValue(item.nonSystemProfitRatio, true),
      formatValue(item.systemProfitAvgHoldDays, false),
      formatValue(item.systemLossAvgHoldDays, false),
      formatValue(item.nonSystemProfitAvgHoldDays, false),
      formatValue(item.nonSystemLossAvgHoldDays, false),
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

export function exportAllToExcel(
  records: TradingRecord[],
  analysis: AnalysisResult,
  monthlyAnalysis: MonthlyAnalysis[],
  filename: string,
  customAnalysis?: CustomAnalysisData,
  customMonthly?: CustomMonthlyData
): void {
  const workbook = XLSX.utils.book_new();

  // 决定使用自定义数据还是计算数据
  const finalAnalysis = customAnalysis?.useCustom ? customAnalysis.data : analysis;
  const finalMonthly = customMonthly?.useCustom ? customMonthly.data : monthlyAnalysis;

  const table1Data = [
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

  const table2Data = [
    HEADERS_2,
    ['系统盈利胜率', formatValue(finalAnalysis.systemProfitRatio, true)],
    ['系统无失误盈利胜率', formatValue(finalAnalysis.systemNoMistakeProfitRatio, true)],
    ['系统有失误盈利胜率', formatValue(finalAnalysis.systemWithMistakeProfitRatio, true)],
    ['非系统盈利胜率', formatValue(finalAnalysis.nonSystemProfitRatio, true)],
    ['系统盈利平均持仓天数', formatValue(finalAnalysis.systemProfitAvgHoldDays, false)],
    ['系统亏损平均持仓天数', formatValue(finalAnalysis.systemLossAvgHoldDays, false)],
    ['非系统盈利平均持仓天数', formatValue(finalAnalysis.nonSystemProfitAvgHoldDays, false)],
    ['非系统亏损平均持仓天数', formatValue(finalAnalysis.nonSystemLossAvgHoldDays, false)],
  ];

  const table3Data = [
    HEADERS_3,
    ...finalMonthly.map((item) => [
      item.month,
      formatValue(item.systemProfitRatio, true),
      formatValue(item.systemNoMistakeProfitRatio, true),
      formatValue(item.systemWithMistakeProfitRatio, true),
      formatValue(item.nonSystemProfitRatio, true),
      formatValue(item.systemProfitAvgHoldDays, false),
      formatValue(item.systemLossAvgHoldDays, false),
      formatValue(item.nonSystemProfitAvgHoldDays, false),
      formatValue(item.nonSystemLossAvgHoldDays, false),
    ]),
  ];

  const worksheet1 = XLSX.utils.aoa_to_sheet(table1Data);
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 },
  ];

  const worksheet2 = XLSX.utils.aoa_to_sheet(table2Data);
  worksheet2['!cols'] = [{ wch: 20 }, { wch: 15 }];

  const worksheet3 = XLSX.utils.aoa_to_sheet(table3Data);
  worksheet3['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  XLSX.writeFile(workbook, filename);
}

function formatValue(value: number | 'N/A', addPercent: boolean = true): string {
  if (value === 'N/A') return 'N/A';
  if (addPercent) {
    return `${value.toFixed(2)}%`;
  }
  return `${value.toFixed(0)}`;
}

export function exportToExcel(records: TradingRecord[], filename: string): void {
  exportTable1ToExcel(records, filename);
}

export function createEmptyWorkbook(): void {
  const workbook = XLSX.utils.book_new();
  
  const worksheet1 = XLSX.utils.aoa_to_sheet([HEADERS_1]);
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);

  const worksheet2 = XLSX.utils.aoa_to_sheet([HEADERS_2]);
  worksheet2['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);

  const worksheet3 = XLSX.utils.aoa_to_sheet([HEADERS_3]);
  worksheet3['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  XLSX.writeFile(workbook, '交易复盘模板.xlsx');
}

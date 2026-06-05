import * as XLSX from 'xlsx';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, TradingType, CustomAnalysisData, CustomMonthlyData, CycleStats, CycleStatType } from '@/types';
import { generateId } from '@/utils';
import { STAT_TYPES } from './cycleStatsService';

export const SHEET_NAME_1 = '表1-交易复盘数据';
export const SHEET_NAME_2 = '表2-动态数据分析';
export const SHEET_NAME_3 = '表3-月度统计';
export const SHEET_NAME_4 = '表4-周期统计';

const HEADERS_1 = [
  '开单时间',
  '股票名称',
  '股票代码',
  '交易类型',
  '是否符合系统',
  '有无大的失误',
  '盈亏情况',
  '持仓时间（天）',
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
  '系统盈亏比',
  '系统无失误盈亏比',
  '系统有失误盈亏比',
  '非系统盈亏比',
  '平均盈亏比',
  '总盈亏',
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
    systemProfitRatio: analysisMap.get('系统盈利率') || 'N/A',
    systemNoMistakeProfitRatio: analysisMap.get('系统无失误盈利率') || 'N/A',
    systemWithMistakeProfitRatio: analysisMap.get('系统有失误盈利率') || 'N/A',
    nonSystemProfitRatio: analysisMap.get('非系统盈利率') || 'N/A',
    systemProfitAvgHoldDays: analysisMap.get('系统盈利平均持仓天数') || 'N/A',
    systemLossAvgHoldDays: analysisMap.get('系统亏损平均持仓天数') || 'N/A',
    nonSystemProfitAvgHoldDays: analysisMap.get('非系统盈利平均持仓天数') || 'N/A',
    nonSystemLossAvgHoldDays: analysisMap.get('非系统亏损平均持仓天数') || 'N/A',
    typeQifeiShuidi: 0,
    typeQifeiShuidiSandengliang: 0,
    typeQifeiQianDuoCaiMA: 0,
    typeFengxianShifang: 0,
    typeShuangyang: 0,
    typeFeiXitong: 0,
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
        systemProfitRatio: parseValue(row['系统盈亏比']),
        systemNoMistakeProfitRatio: parseValue(row['系统无失误盈亏比']),
        systemWithMistakeProfitRatio: parseValue(row['系统有失误盈亏比']),
        nonSystemProfitRatio: parseValue(row['非系统盈亏比']),
        avgProfitRatio: parseValue(row['平均盈亏比']),
        totalProfit: parseValue(row['总盈亏']),
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
  const validTradingTypes = ['齐飞水底', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致', '非系统'] as const;
  const validTradingType = validTradingTypes.includes(tradingType as any) 
    ? tradingType as TradingType 
    : '齐飞水底';

  // 解析盈亏情况，可能带有 %
  const profitStr = String(row['盈亏情况'] || '').trim().replace('%', '');
  const profitPercent = parseFloat(profitStr) || 0;
  
  // 解析持仓时间
  const holdDays = parseInt(String(row['持仓时间（天）'] || '').trim(), 10) || 0;

  return {
    id: generateId(),
    openDate: String(row['开单时间'] || ''),
    stockName: String(row['股票名称'] || ''),
    stockCode: String(row['股票代码'] || ''),
    tradingType: validTradingType,
    isSystem: row['是否符合系统'] === '是' ? '是' : '否',
    hasMistake: row['有无大的失误'] === '是' ? '是' : row['有无大的失误'] === '其他' ? '其他' : '否',
    profitPercent,
    holdDays,
    chart1: (row['股票走势1'] as string) || '',
    chart2: (row['股票走势2'] as string) || '',
    keyChart1: (row['关键分时1'] as string) || '',
    keyChart2: (row['关键分时2'] as string) || '',
    preMarket: row['盘前是否'] === '是' ? '是' : '否',
    hasCycleStats: false,
    hasMonthlyStats: false,
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
    ['系统盈利率', formatValue(analysis.systemProfitRatio, true)],
    ['系统无失误盈利率', formatValue(analysis.systemNoMistakeProfitRatio, true)],
    ['系统有失误盈利率', formatValue(analysis.systemWithMistakeProfitRatio, true)],
    ['非系统盈利率', formatValue(analysis.nonSystemProfitRatio, true)],
    ['系统盈利平均持仓天数', formatValue(analysis.systemProfitAvgHoldDays, false)],
    ['系统亏损平均持仓天数', formatValue(analysis.systemLossAvgHoldDays, false)],
    ['非系统盈利平均持仓天数', formatValue(analysis.nonSystemProfitAvgHoldDays, false)],
    ['非系统亏损平均持仓天数', formatValue(analysis.nonSystemLossAvgHoldDays, false)],
    ['齐飞水底盈亏比', formatValue(analysis.typeQifeiShuidi, true)],
    ['齐飞水底三等量盈亏比', formatValue(analysis.typeQifeiShuidiSandengliang, true)],
    ['齐飞前多踩MA盈亏比', formatValue(analysis.typeQifeiQianDuoCaiMA, true)],
    ['风险释放平台转一致盈亏比', formatValue(analysis.typeFengxianShifang, true)],
    ['双阳平台转一致盈亏比', formatValue(analysis.typeShuangyang, true)],
    ['非系统盈亏比', formatValue(analysis.typeFeiXitong, true)],
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
      formatValue(item.avgProfitRatio, false),
      formatValue(item.totalProfit, true),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);

  worksheet['!cols'] = [
    { wch: 10 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_3);
  XLSX.writeFile(workbook, filename);
}

// 导出表4-周期统计
export function exportTable4ToExcel(
  cycleStats: Record<CycleStatType, CycleStats[]>,
  filename: string
): void {
  const workbook = XLSX.utils.book_new();

  // 将所有统计类型的周期数据展平
  const allStats: CycleStats[] = [];
  for (const statType of STAT_TYPES) {
    if (cycleStats[statType]) {
      allStats.push(...cycleStats[statType]);
    }
  }

  const table4Data = [
    HEADERS_4,
    ...allStats.map((stat) => [
      stat.statType,
      stat.cycleId,
      stat.startDate,
      stat.endDate,
      stat.recordCount,
      stat.isComplete ? '是' : '否',
      stat.profitSum,
      stat.lossSum,
      stat.profitRatio ?? 'N/A',
      new Date(stat.createdAt).toLocaleString(),
      new Date(stat.updatedAt).toLocaleString(),
    ]),
  ];

  const worksheet4 = XLSX.utils.aoa_to_sheet(table4Data);
  worksheet4['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet4, SHEET_NAME_4);
  XLSX.writeFile(workbook, filename);
}

export function exportAllToExcel(
  records: TradingRecord[],
  analysis: AnalysisResult,
  monthlyAnalysis: MonthlyAnalysis[],
  filename: string,
  customAnalysis?: CustomAnalysisData,
  customMonthly?: CustomMonthlyData,
  cycleStats?: Record<CycleStatType, CycleStats[]>
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
    ['系统盈利率', formatValue(finalAnalysis.systemProfitRatio, true)],
    ['系统无失误盈利率', formatValue(finalAnalysis.systemNoMistakeProfitRatio, true)],
    ['系统有失误盈利率', formatValue(finalAnalysis.systemWithMistakeProfitRatio, true)],
    ['非系统盈利率', formatValue(finalAnalysis.nonSystemProfitRatio, true)],
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
      formatValue(item.avgProfitRatio, false),
      formatValue(item.totalProfit, true),
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
    { wch: 12 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  // 添加 Sheet4 如果有周期统计数据
  if (cycleStats) {
    // 将所有统计类型的周期数据展平
    const allStats: CycleStats[] = [];
    for (const statType of STAT_TYPES) {
      if (cycleStats[statType]) {
        allStats.push(...cycleStats[statType]);
      }
    }

    if (allStats.length > 0) {
      const table4Data = [
        HEADERS_4,
        ...allStats.map((stat) => [
          stat.statType,
          stat.cycleId,
          stat.startDate,
          stat.endDate,
          stat.recordCount,
          stat.isComplete ? '是' : '否',
          stat.profitSum,
          stat.lossSum,
          stat.profitRatio ?? 'N/A',
          new Date(stat.createdAt).toLocaleString(),
          new Date(stat.updatedAt).toLocaleString(),
        ]),
      ];

      const worksheet4 = XLSX.utils.aoa_to_sheet(table4Data);
      worksheet4['!cols'] = [
        { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet4, SHEET_NAME_4);
    }
  }

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

// 表4的表头
const HEADERS_4 = [
  '统计类型',
  '周期ID',
  '开始日期',
  '结束日期',
  '记录数',
  '是否完整周期',
  '盈利总和',
  '亏损绝对值总和',
  '盈亏比',
  '创建时间',
  '更新时间'
];

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const STOCKS = [
  { name: '贵州茅台', code: '600519' },
  { name: '宁德时代', code: '300750' },
  { name: '比亚迪', code: '002594' },
  { name: '腾讯控股', code: '00700' },
  { name: '阿里巴巴', code: 'BABA' },
  { name: '美团', code: '03690' },
  { name: '京东', code: 'JD' },
  { name: '拼多多', code: 'PDD' },
  { name: '网易', code: 'NTES' },
  { name: '百度', code: 'BIDU' }
];
const TRADING_TYPES = [
  '齐飞水底',
  '齐飞前多踩MA',
  '风险释放平台转一致',
  '双阳平台转一致',
  '非系统'
];

function generateRandomProfit(): number {
  return Math.round((Math.random() * 80 - 30) * 100) / 100;
}

function generateRandomHoldDays(): number {
  return Math.floor(Math.random() * 15) + 1;
}

function createTestTable1Data(): any[][] {
  const tableData: any[][] = [HEADERS_1];
  for (const month of MONTHS) {
    const recordCount = Math.floor(Math.random() * 8) + 5;
    for (let i = 0; i < recordCount; i++) {
      const stock = STOCKS[Math.floor(Math.random() * STOCKS.length)];
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const openDate = `${month.replace('-', '')}${day}`;
      const tradingType = TRADING_TYPES[Math.floor(Math.random() * TRADING_TYPES.length)];
      const isSystem = Math.random() > 0.3 ? '是' : '否';
      const hasMistake = isSystem === '是' && Math.random() > 0.7 ? '是' : '否';
      const profitPercent = generateRandomProfit();
      const holdDays = generateRandomHoldDays();
      tableData.push([openDate, stock.name, stock.code, tradingType, isSystem, hasMistake, profitPercent, holdDays, '', '', '', '', '']);
    }
  }
  return tableData;
}

function createTestTable2Data(): any[][] {
  const tableData: any[][] = [HEADERS_2];
  tableData.push(['系统盈利率', 45.67]);
  tableData.push(['系统无失误盈利率', 52.30]);
  tableData.push(['系统有失误盈利率', 28.90]);
  tableData.push(['非系统盈利率', 38.20]);
  tableData.push(['系统盈利平均持仓天数', 8.5]);
  tableData.push(['系统亏损平均持仓天数', 5.3]);
  tableData.push(['非系统盈利平均持仓天数', 7.8]);
  tableData.push(['非系统亏损平均持仓天数', 4.9]);
  tableData.push(['齐飞水底盈亏比', 1.25]);
  tableData.push(['齐飞水底三等量盈亏比', 0.95]);
  tableData.push(['齐飞前多踩MA盈亏比', 1.83]);
  tableData.push(['风险释放平台转一致盈亏比', 1.56]);
  tableData.push(['双阳平台转一致盈亏比', 2.10]);
  tableData.push(['非系统盈亏比', 0.89]);
  return tableData;
}

function createTestTable3Data(): any[][] {
  const tableData: any[][] = [HEADERS_3];
  for (const month of MONTHS) {
    tableData.push([
      month,
      (Math.random() * 30 + 40).toFixed(2),
      (Math.random() * 25 + 45).toFixed(2),
      (Math.random() * 20 + 20).toFixed(2),
      (Math.random() * 25 + 35).toFixed(2),
      (Math.random() * 3 + 1).toFixed(1),
      (Math.random() * 50 - 10).toFixed(2)
    ]);
  }
  return tableData;
}

export function generateTestExcel(): void {
  const workbook = XLSX.utils.book_new();
  
  const worksheet1 = XLSX.utils.aoa_to_sheet(createTestTable1Data());
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);

  const worksheet2 = XLSX.utils.aoa_to_sheet(createTestTable2Data());
  worksheet2['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);

  const worksheet3 = XLSX.utils.aoa_to_sheet(createTestTable3Data());
  worksheet3['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  XLSX.writeFile(workbook, '交易复盘测试数据.xlsx');
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
    { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  XLSX.writeFile(workbook, '交易复盘模板.xlsx');
}

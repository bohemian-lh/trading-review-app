import * as XLSX from 'xlsx';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis, TradingType, CustomAnalysisData, CustomMonthlyData, CycleStats, CycleStatType, TheoreticalDimension } from '@/types';
import { generateId } from '@/utils';

export const SHEET_NAME_1 = '表1-交易复盘数据';
export const SHEET_NAME_2 = '表2-动态数据分析';
export const SHEET_NAME_3 = '表3-月度统计';
export const SHEET_NAME_4 = '表4-周期统计';

// 表1 基础列（不含理论盈亏比维度列）
const BASE_HEADERS_1 = [
  '开单时间',
  '股票名称',
  '股票代码',
  '交易类型',
  '趋势特征',
  '模式特征',
  '有无大的失误',
  '盈亏情况',
  '持仓时间（天）',
  '仓位',
  '图片',
  '盘前是否',
  '备注',
];

// 理论维度列名（名称去重；空名回退为「理论维度N」）
function buildTheoreticalColumns(dimensions: TheoreticalDimension[]): Array<{ id: string; header: string }> {
  const used = new Set<string>();
  return dimensions.map((d, i) => {
    const base = d.name?.trim() || `理论维度${i + 1}`;
    let header = base;
    let n = 2;
    while (used.has(header)) {
      header = `${base}${n}`;
      n++;
    }
    used.add(header);
    return { id: d.id, header };
  });
}

function buildHeaders1(dimensions: TheoreticalDimension[]): string[] {
  return [...BASE_HEADERS_1, ...buildTheoreticalColumns(dimensions).map(c => c.header)];
}

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
  options: ImportOptions,
  dimensions: TheoreticalDimension[] = []
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
            const { records, errors } = parseTable1(worksheet, dimensions);
            result.records = records;
            result.errors.push(...errors);
          }
        }

        if (options.tables.includes('table2')) {
          const worksheet = workbook.Sheets[SHEET_NAME_2];
          if (!worksheet) {
            result.errors.push(`未找到工作表：${SHEET_NAME_2}`);
          } else {
            result.analysis = parseTable2(worksheet, dimensions);
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

function parseTable1(worksheet: XLSX.WorkSheet, dimensions: TheoreticalDimension[]): {
  records: TradingRecord[];
  errors: string[];
} {
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  const records: TradingRecord[] = [];
  const errors: string[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    try {
      const record = mapRowToRecord(row, dimensions);
      if (record) {
        records.push(record);
      }
    } catch (err) {
      errors.push(`行 ${i + 1}: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }

  return { records, errors };
}

function parseTable2(worksheet: XLSX.WorkSheet, dimensions: TheoreticalDimension[]): AnalysisResult | undefined {
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

  const theoreticalProfitRatios: Record<string, number | 'N/A'> = {};
  for (const d of dimensions) {
    theoreticalProfitRatios[d.id] = analysisMap.get(`理论盈亏比·${d.name || '未命名维度'}`) || 'N/A';
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
    tradingTypeRatios: {},
    trendFeatureRatios: {},
    aggregateRatios: {},
    theoreticalProfitRatios,
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

function parseImagesColumn(raw: unknown): string[] {
  const str = String(raw || '').trim();
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function mapRowToRecord(row: Record<string, unknown>, dimensions: TheoreticalDimension[]): TradingRecord | null {
  if (!row['开单时间'] && !row['股票名称']) {
    return null;
  }

  const tradingType = (String(row['交易类型'] || '').trim() || '未知') as TradingType;

  // 解析趋势特征（逗号分隔多值）
  const rawTrendFeatures = String(row['趋势特征'] || '').trim();
  const trendFeatures = rawTrendFeatures
    ? rawTrendFeatures.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (trendFeatures.length === 0) trendFeatures.push('未知');

  // 解析模式特征（逗号分隔多值，兼容旧列「是否符合系统」）
  const rawPatternFeatures = String(row['模式特征'] || '').trim();
  let patternFeatures = rawPatternFeatures
    ? rawPatternFeatures.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (patternFeatures.length === 0 && row['是否符合系统'] !== undefined && row['是否符合系统'] !== '') {
    patternFeatures = row['是否符合系统'] === '是' ? ['系统'] : ['非系统'];
  }

  // 解析盈亏情况，可能带有 %
  const profitStr = String(row['盈亏情况'] || '').trim().replace('%', '');
  const profitPercent = parseFloat(profitStr) || 0;
  
  // 解析持仓时间
  const holdDays = parseInt(String(row['持仓时间（天）'] || '').trim(), 10) || 0;

  // 解析仓位（0-100，默认33）
  const positionSizeRaw = String(row['仓位'] ?? '').trim().replace('%', '');
  const positionSize = positionSizeRaw === ''
    ? 33
    : Math.min(100, Math.max(0, parseFloat(positionSizeRaw) || 33));

  // 解析理论盈亏比维度值（按列名匹配）
  const theoreticalProfitRatios: Record<string, number> = {};
  for (const col of buildTheoreticalColumns(dimensions)) {
    const raw = String(row[col.header] ?? '').trim().replace('%', '');
    if (raw === '' || raw === 'N/A') continue;
    const num = parseFloat(raw);
    if (!isNaN(num)) theoreticalProfitRatios[col.id] = num;
  }

  return {
    id: generateId(),
    openDate: String(row['开单时间'] || ''),
    stockName: String(row['股票名称'] || ''),
    stockCode: String(row['股票代码'] || ''),
    tradingType,
    trendFeatures,
    patternFeatures,
    hasMistake: row['有无大的失误'] === '是' ? '是' : row['有无大的失误'] === '其他' ? '其他' : '否',
    profitPercent,
    holdDays,
    positionSize,
    images: parseImagesColumn(row['图片']),
    imagePrefix: '',
    preMarket: row['盘前是否'] === '是' ? '是' : '否',
    hasCycleStats: false,
    hasMonthlyStats: false,
    remark: String(row['备注'] || '').slice(0, 1000),
    theoreticalProfitRatios,
  };
}

export function exportTable1ToExcel(records: TradingRecord[], filename: string, dimensions: TheoreticalDimension[] = []): void {
  const workbook = XLSX.utils.book_new();
  const theoCols = buildTheoreticalColumns(dimensions);

  const data = [
    buildHeaders1(dimensions),
    ...records.map((record) => [
      record.openDate,
      record.stockName,
      record.stockCode,
      record.tradingType,
      record.trendFeatures.join(','),
      record.patternFeatures.join(','),
      record.hasMistake,
      record.profitPercent,
      record.holdDays,
      record.positionSize ?? 33,
      record.images ? record.images.join(',') : '',
      record.preMarket,
      record.remark,
      ...theoCols.map(c => {
        const v = record.theoreticalProfitRatios[c.id];
        return v === undefined ? '' : v;
      }),
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
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    ...theoCols.map(() => ({ wch: 12 })),
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_1);
  XLSX.writeFile(workbook, filename);
}

export function exportTable2ToExcel(analysis: AnalysisResult, filename: string, dimensions: TheoreticalDimension[] = []): void {
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
    ...dimensions.map(d => [`理论盈亏比·${d.name || '未命名维度'}`, formatValue(analysis.theoreticalProfitRatios[d.id] ?? 'N/A', true)]),
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
  for (const statType of Object.keys(cycleStats)) {
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
  cycleStats?: Record<CycleStatType, CycleStats[]>,
  dimensions: TheoreticalDimension[] = []
): void {
  const workbook = XLSX.utils.book_new();

  // 决定使用自定义数据还是计算数据
  const finalAnalysis = customAnalysis?.useCustom ? customAnalysis.data : analysis;
  const finalMonthly = customMonthly?.useCustom ? customMonthly.data : monthlyAnalysis;

  const theoCols = buildTheoreticalColumns(dimensions);

  const table1Data = [
    buildHeaders1(dimensions),
    ...records.map((record) => [
      record.openDate,
      record.stockName,
      record.stockCode,
      record.tradingType,
      record.trendFeatures.join(','),
      record.patternFeatures.join(','),
      record.hasMistake,
      record.profitPercent,
      record.holdDays,
      record.positionSize ?? 33,
      record.images ? record.images.join(',') : '',
      record.preMarket,
      record.remark,
      ...theoCols.map(c => {
        const v = record.theoreticalProfitRatios[c.id];
        return v === undefined ? '' : v;
      }),
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
    ...dimensions.map(d => [`理论盈亏比·${d.name || '未命名维度'}`, formatValue(finalAnalysis.theoreticalProfitRatios[d.id] ?? 'N/A', true)]),
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
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, ...theoCols.map(() => ({ wch: 12 })),
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
    for (const statType of Object.keys(cycleStats)) {
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

export function exportToExcel(records: TradingRecord[], filename: string, dimensions: TheoreticalDimension[] = []): void {
  exportTable1ToExcel(records, filename, dimensions);
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

const TREND_FEATURES = ['p2前', 'p34', 'p4后', '未知'];
const PATTERN_FEATURES = ['系统', '非系统'];

function generateRandomProfit(): number {
  return Math.round((Math.random() * 80 - 30) * 100) / 100;
}

function generateRandomHoldDays(): number {
  return Math.floor(Math.random() * 15) + 1;
}

function createTestTable1Data(dimensions: TheoreticalDimension[] = []): any[][] {
  const theoCols = buildTheoreticalColumns(dimensions);
  const tableData: any[][] = [buildHeaders1(dimensions)];
  for (const month of MONTHS) {
    const recordCount = Math.floor(Math.random() * 8) + 5;
    for (let i = 0; i < recordCount; i++) {
      const stock = STOCKS[Math.floor(Math.random() * STOCKS.length)];
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const openDate = `${month.replace('-', '')}${day}`;
      const tradingType = TRADING_TYPES[Math.floor(Math.random() * TRADING_TYPES.length)];
      const patternFeature = PATTERN_FEATURES[Math.floor(Math.random() * PATTERN_FEATURES.length)];
      const hasMistake = patternFeature === '系统' && Math.random() > 0.7 ? '是' : '否';
      const profitPercent = generateRandomProfit();
      const holdDays = generateRandomHoldDays();
      const trendFeature = TREND_FEATURES[Math.floor(Math.random() * TREND_FEATURES.length)];
      tableData.push([openDate, stock.name, stock.code, tradingType, trendFeature, patternFeature, hasMistake, profitPercent, holdDays, 33, '', '', '', ...theoCols.map(() => '')]);
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

export function generateTestExcel(dimensions: TheoreticalDimension[] = []): void {
  const workbook = XLSX.utils.book_new();
  const theoCols = buildTheoreticalColumns(dimensions);
  
  const worksheet1 = XLSX.utils.aoa_to_sheet(createTestTable1Data(dimensions));
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, ...theoCols.map(() => ({ wch: 12 })),
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

export function createEmptyWorkbook(dimensions: TheoreticalDimension[] = []): void {
  const workbook = XLSX.utils.book_new();
  const theoCols = buildTheoreticalColumns(dimensions);
  
  const worksheet1 = XLSX.utils.aoa_to_sheet([buildHeaders1(dimensions)]);
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, ...theoCols.map(() => ({ wch: 12 })),
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

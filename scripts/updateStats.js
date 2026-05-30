const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SHEET_NAME_1 = '表1-交易复盘数据';
const SHEET_NAME_2 = '表2-动态数据分析';
const SHEET_NAME_3 = '表3-月度统计';

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return { lastRecordCount: 0, lastOpenDates: [] };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[SHEET_NAME_1];

  if (!worksheet) {
    throw new Error(`未找到工作表：${SHEET_NAME_1}`);
  }

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return jsonData.slice(1);
}

function mapRowToRecord(row) {
  if (!row['开单时间'] && !row['股票名称']) {
    return null;
  }

  return {
    openDate: String(row['开单时间'] || ''),
    stockName: String(row['股票名称'] || ''),
    stockCode: String(row['股票代码'] || ''),
    tradingType: row['交易类型'] || '齐飞水底',
    isSystem: row['是否符合系统'] === '是' ? '是' : '否',
    hasMistake: row['有无大的失误'] === '是' ? '是' : '否',
    profitPercent: Number(row['盈亏情况']) || 0,
    holdDays: Number(row['持仓时间']) || 0,
    preMarket: row['盘前是否'] === '是' ? '是' : '否',
  };
}

function calculateProfitRatio(records, isSystem = null, hasMistake = null) {
  let filtered = records;

  if (isSystem !== null) {
    filtered = filtered.filter(r => r.isSystem === isSystem);
  }

  if (hasMistake !== null) {
    filtered = filtered.filter(r => r.hasMistake === hasMistake);
  }

  if (filtered.length === 0) {
    return 'N/A';
  }

  const profitableCount = filtered.filter(r => r.profitPercent > 0).length;
  return (profitableCount / filtered.length) * 100;
}

function calculateAverageHoldDays(records, isSystem = null, profitType = null) {
  let filtered = records;

  if (isSystem !== null) {
    filtered = filtered.filter(r => r.isSystem === isSystem);
  }

  if (profitType === 'positive') {
    filtered = filtered.filter(r => r.profitPercent > 0);
  } else if (profitType === 'negative') {
    filtered = filtered.filter(r => r.profitPercent < 0);
  }

  if (filtered.length === 0) {
    return 'N/A';
  }

  const totalDays = filtered.reduce((sum, r) => sum + r.holdDays, 0);
  return totalDays / filtered.length;
}

function extractMonth(openDate) {
  if (!openDate || openDate.length < 6) {
    return null;
  }
  return openDate.slice(0, 6);
}

function calculateAnalysis(records) {
  return {
    systemProfitRatio: calculateProfitRatio(records, '是'),
    systemNoMistakeProfitRatio: calculateProfitRatio(records, '是', '否'),
    systemWithMistakeProfitRatio: calculateProfitRatio(records, '是', '是'),
    nonSystemProfitRatio: calculateProfitRatio(records, '否'),
    systemProfitAvgHoldDays: calculateAverageHoldDays(records, '是', 'positive'),
    systemLossAvgHoldDays: calculateAverageHoldDays(records, '是', 'negative'),
    nonSystemProfitAvgHoldDays: calculateAverageHoldDays(records, '否', 'positive'),
    nonSystemLossAvgHoldDays: calculateAverageHoldDays(records, '否', 'negative'),
  };
}

function calculateMonthlyAnalysis(records) {
  const monthlyMap = new Map();

  for (const record of records) {
    const month = extractMonth(record.openDate);
    if (!month) continue;

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, []);
    }
    monthlyMap.get(month).push(record);
  }

  const sortedMonths = Array.from(monthlyMap.keys()).sort();

  return sortedMonths.map(month => {
    const monthRecords = monthlyMap.get(month);
    return {
      month,
      ...calculateAnalysis(monthRecords),
    };
  });
}

function formatValue(value) {
  if (value === 'N/A') return 'N/A';
  return `${value.toFixed(2)}%`;
}

function exportTable1(records, filename) {
  const HEADERS = [
    '开单时间', '股票名称', '股票代码', '交易类型', '是否符合系统',
    '有无大的失误', '盈亏情况', '持仓时间', '股票走势1', '股票走势2',
    '关键分时1', '关键分时2', '盘前是否'
  ];

  const data = [
    HEADERS,
    ...records.map(record => [
      record.openDate, record.stockName, record.stockCode, record.tradingType,
      record.isSystem, record.hasMistake, record.profitPercent, record.holdDays,
      record.chart1 || '', record.chart2 || '', record.keyChart1 || '',
      record.keyChart2 || '', record.preMarket
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_1);
  XLSX.writeFile(workbook, filename);
}

function exportTable2(analysis, filename) {
  const HEADERS = ['指标', '数值'];
  const data = [
    HEADERS,
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
  worksheet['!cols'] = [{ wch: 20 }, { wch: 15 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_2);
  XLSX.writeFile(workbook, filename);
}

function exportTable3(monthlyAnalysis, filename) {
  const HEADERS = [
    '月份', '系统盈利胜率', '系统无失误盈利胜率', '系统有失误盈利胜率',
    '非系统盈利胜率', '系统盈利平均持仓天数', '系统亏损平均持仓天数',
    '非系统盈利平均持仓天数', '非系统亏损平均持仓天数'
  ];

  const data = [
    HEADERS,
    ...monthlyAnalysis.map(item => [
      item.month,
      formatValue(item.systemProfitRatio),
      formatValue(item.systemNoMistakeProfitRatio),
      formatValue(item.systemWithMistakeProfitRatio),
      formatValue(item.nonSystemProfitRatio),
      formatValue(item.systemProfitAvgHoldDays),
      formatValue(item.systemLossAvgHoldDays),
      formatValue(item.nonSystemProfitAvgHoldDays),
      formatValue(item.nonSystemLossAvgHoldDays),
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME_3);
  XLSX.writeFile(workbook, filename);
}

function hasNewData(records, state) {
  const currentOpenDates = records.map(r => r.openDate).sort();
  const lastOpenDates = state.lastOpenDates || [];

  if (records.length > state.lastRecordCount) {
    return true;
  }

  if (currentOpenDates.length !== lastOpenDates.length) {
    return true;
  }

  for (let i = 0; i < currentOpenDates.length; i++) {
    if (currentOpenDates[i] !== lastOpenDates[i]) {
      return true;
    }
  }

  return false;
}

function update() {
  const inputFile = path.join(DATA_DIR, '表1-交易复盘数据.xlsx');

  if (!fs.existsSync(inputFile)) {
    console.log('[' + new Date().toISOString() + '] 表1文件不存在，跳过更新');
    return false;
  }

  const state = loadState();

  const rawRecords = parseExcelFile(inputFile);
  const records = rawRecords.map(mapRowToRecord).filter(r => r !== null);

  if (!hasNewData(records, state)) {
    console.log('[' + new Date().toISOString() + '] 没有检测到新数据，跳过更新');
    return false;
  }

  console.log('[' + new Date().toISOString() + '] 检测到新数据，正在更新... (' + records.length + ' 条记录)');

  ensureDir(OUTPUT_DIR);

  const analysis = calculateAnalysis(records);
  const monthlyAnalysis = calculateMonthlyAnalysis(records);

  exportTable1(records, path.join(OUTPUT_DIR, '表1-交易复盘数据.xlsx'));
  console.log('[' + new Date().toISOString() + '] 表1已更新');

  exportTable2(analysis, path.join(OUTPUT_DIR, '表2-动态数据分析.xlsx'));
  console.log('[' + new Date().toISOString() + '] 表2已更新');

  exportTable3(monthlyAnalysis, path.join(OUTPUT_DIR, '表3-月度统计.xlsx'));
  console.log('[' + new Date().toISOString() + '] 表3已更新');

  const newState = {
    lastRecordCount: records.length,
    lastOpenDates: records.map(r => r.openDate).sort(),
    lastUpdateTime: new Date().toISOString()
  };
  saveState(newState);

  console.log('[' + new Date().toISOString() + '] 所有表格已更新完成！');
  return true;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--cron') || args.includes('-c')) {
    const cron = require('node-cron');

    cron.schedule('0 0 * * *', () => {
      console.log('[' + new Date().toISOString() + '] 开始执行定时任务...');
      update();
    });

    console.log('定时任务已启动，每天 0:00 执行');
    console.log('按 Ctrl+C 停止');
  } else {
    update();
  }
}

if (require.main === module) {
  main();
}

module.exports = { update };

/**
 * 生成 1000 条测试数据，平均分布到 20 个月和 5 种交易类型。
 * 输出: 交易复盘测试数据.xlsx（位于项目根目录）
 *
 * 用法: node scripts/generate-test-data.cjs
 */
const XLSX = require('xlsx');
const path = require('path');

// ========== 配置 ==========
const TOTAL_RECORDS = 1000;
const MONTH_COUNT = 20;
const RECORDS_PER_MONTH = TOTAL_RECORDS / MONTH_COUNT; // 50

// 交易类型
const TRADING_TYPES = [
  '齐飞水底',
  '齐飞前多踩MA',
  '风险释放平台转一致',
  '双阳平台转一致',
  '非系统',
];

// 股票池
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
  { name: '百度', code: 'BIDU' },
  { name: '隆基绿能', code: '601012' },
  { name: '药明康德', code: '603259' },
  { name: '中芯国际', code: '688981' },
  { name: '格力电器', code: '000651' },
  { name: '五粮液', code: '000858' },
];

// 20 个月（2024-08 ~ 2026-03）
function generateMonths() {
  const months = [];
  for (let i = 0; i < MONTH_COUNT; i++) {
    const y = 2024 + Math.floor((8 + i) / 12);
    const m = ((8 + i) % 12) || 12;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

// ========== 工具函数 ==========
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateProfitPercent() {
  // 模拟真实分布: 约 55% 盈利, 45% 亏损, 范围 -20 ~ +25
  if (Math.random() < 0.55) {
    return parseFloat(rand(0.5, 25).toFixed(2));
  }
  return parseFloat(rand(-20, -0.3).toFixed(2));
}

function generateHoldDays(profitPercent) {
  // 盈利持仓偏长, 亏损持仓偏短
  if (profitPercent > 0) {
    return randInt(3, 18);
  }
  return randInt(1, 10);
}

// ========== Header ==========
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

const HEADERS_2 = ['指标', '数值'];

const HEADERS_3 = [
  '月份',
  '系统盈利胜率',
  '系统无失误盈利胜率',
  '系统有失误盈利胜率',
  '非系统盈利胜率',
  '平均盈亏比',
  '总盈亏',
];

// ========== 生成表1数据 ==========
function generateTable1Data() {
  const months = generateMonths();
  const rows = [HEADERS_1];

  // 为每个月的 50 条记录，均匀分配到 5 个类型（各 10 条/月/类型）
  for (const month of months) {
    const typeRecords = {}; // 每种类型 10 条

    for (const t of TRADING_TYPES) {
      typeRecords[t] = [];
      for (let i = 0; i < 10; i++) {
        const stock = pick(STOCKS);
        const day = String(randInt(1, 28)).padStart(2, '0');
        const openDate = `${month.replace('-', '')}${day}`;
        const isSystem = t === '非系统' ? '否' : (Math.random() > 0.15 ? '是' : '否');
        const hasMistake = isSystem === '是' && Math.random() > 0.7 ? '是' : '否';
        const profitPercent = generateProfitPercent();
        const holdDays = generateHoldDays(profitPercent);
        const preMarket = Math.random() > 0.5 ? '是' : '否';

        typeRecords[t].push([
          openDate,
          stock.name,
          stock.code,
          t,
          isSystem,
          hasMistake,
          profitPercent,
          holdDays,
          '',
          '',
          '',
          '',
          preMarket,
        ]);
      }
    }

    // 打乱顺序使数据更自然
    const monthRows = shuffle(Object.values(typeRecords).flat());
    rows.push(...monthRows);
  }

  return rows;
}

// ========== 生成表2数据 ==========
function generateTable2Data() {
  return [
    HEADERS_2,
    ['系统盈利胜率', 45.67],
    ['系统无失误盈利胜率', 52.3],
    ['系统有失误盈利胜率', 28.9],
    ['非系统盈利胜率', 38.2],
    ['系统盈利平均持仓天数', 8.5],
    ['系统亏损平均持仓天数', 5.3],
    ['非系统盈利平均持仓天数', 7.8],
    ['非系统亏损平均持仓天数', 4.9],
  ];
}

// ========== 生成表3数据 ==========
function generateTable3Data() {
  const months = generateMonths();
  const rows = [HEADERS_3];

  for (const month of months) {
    const systemWinRate = (Math.random() * 30 + 40).toFixed(2);
    const systemNoMistakeWinRate = (Math.random() * 25 + 45).toFixed(2);
    const systemWithMistakeWinRate = (Math.random() * 20 + 20).toFixed(2);
    const nonSystemWinRate = (Math.random() * 25 + 35).toFixed(2);
    const avgProfitRatio = (Math.random() * 3 + 1).toFixed(2);
    const totalProfit = (Math.random() * 50 - 10).toFixed(2);

    rows.push([
      month,
      systemWinRate,
      systemNoMistakeWinRate,
      systemWithMistakeWinRate,
      nonSystemWinRate,
      avgProfitRatio,
      totalProfit,
    ]);
  }

  return rows;
}

// ========== 写入 Excel ==========
function main() {
  console.log(`生成 ${TOTAL_RECORDS} 条测试数据（${MONTH_COUNT} 个月，${TRADING_TYPES.length} 种交易类型）...`);

  const workbook = XLSX.utils.book_new();

  // 表1
  const ws1 = XLSX.utils.aoa_to_sheet(generateTable1Data());
  ws1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 14 },
    { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, ws1, '表1-交易复盘数据');

  // 表2
  const ws2 = XLSX.utils.aoa_to_sheet(generateTable2Data());
  ws2['!cols'] = [{ wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, ws2, '表2-动态数据分析');

  // 表3
  const ws3 = XLSX.utils.aoa_to_sheet(generateTable3Data());
  ws3['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 18 },
    { wch: 15 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, ws3, '表3-月度统计');

  const outputPath = path.resolve(__dirname, '..', '交易复盘测试数据.xlsx');
  XLSX.writeFile(workbook, outputPath);

  console.log(`✅ 完成！文件: ${outputPath}`);
  console.log(`   表1: ${TOTAL_RECORDS + 1} 行（含表头）`);
  console.log(`   月份范围: ${generateMonths()[0]} ~ ${generateMonths()[MONTH_COUNT - 1]}`);
  console.log(`   每类交易: ${TOTAL_RECORDS / TRADING_TYPES.length} 条`);

  // 验证分布
  const months = generateMonths();
  console.log(`\n验证: 每月 ${RECORDS_PER_MONTH} 条 × ${MONTH_COUNT} 月 = ${TOTAL_RECORDS} 条`);
  console.log(`       ${TRADING_TYPES.length} 种类型各 ${TOTAL_RECORDS / TRADING_TYPES.length} 条`);
}

main();


import * as XLSX from 'xlsx';
import { SHEET_NAME_1, SHEET_NAME_2, SHEET_NAME_3 } from '../src/services/excelService';

const HEADERS_1 = [
  '开单时间', '股票名称', '股票代码', '交易类型', '是否符合系统',
  '有无大的失误', '盈亏情况', '持仓时间', '股票走势1',
  '股票走势2', '关键分时1', '关键分时2', '盘前是否'
];

const HEADERS_2 = ['指标', '数值'];

const HEADERS_3 = [
  '月份', '系统盈利胜率', '系统无失误盈利胜率', '系统有失误盈利胜率',
  '非系统盈利胜率', '系统盈利平均持仓天数', '系统亏损平均持仓天数',
  '非系统盈利平均持仓天数', '非系统亏损平均持仓天数'
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
  '双阳平台转一致'
];

function generateRandomProfit(): number {
  // 随机生成 -30 到 +50 之间的浮点数
  return (Math.random() * 80 - 30) * 100 / 100;
}

function generateRandomHoldDays(): number {
  return Math.floor(Math.random() * 15) + 1;
}

function createTable1Data(): any[][] {
  const tableData: any[][] = [HEADERS_1];
  let id = 1;

  for (const month of MONTHS) {
    const recordCount = Math.floor(Math.random() * 8) + 5; // 5-12 条记录
    for (let i = 0; i < recordCount; i++) {
      const stock = STOCKS[Math.floor(Math.random() * STOCKS.length)];
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const openDate = `${month.replace('-', '')}${day}`;
      const tradingType = TRADING_TYPES[Math.floor(Math.random() * TRADING_TYPES.length)];
      const isSystem = Math.random() > 0.3 ? '是' : '否';
      const hasMistake = isSystem === '是' && Math.random() > 0.7 ? '是' : '否';
      const profitPercent = generateRandomProfit();
      const holdDays = generateRandomHoldDays();

      tableData.push([
        openDate,
        stock.name,
        stock.code,
        tradingType,
        isSystem,
        hasMistake,
        profitPercent,
        holdDays,
        '', '', '', '', ''
      ]);
      id++;
    }
  }

  return tableData;
}

function createTable2Data(): any[][] {
  // 动态计算整体的统计数据
  const tableData: any[][] = [HEADERS_2];
  
  tableData.push(['系统盈利胜率', 45.67]);
  tableData.push(['系统无失误盈利胜率', 52.30]);
  tableData.push(['系统有失误盈利胜率', 28.90]);
  tableData.push(['非系统盈利胜率', 38.20]);
  tableData.push(['系统盈利平均持仓天数', 8.5]);
  tableData.push(['系统亏损平均持仓天数', 5.3]);
  tableData.push(['非系统盈利平均持仓天数', 7.8]);
  tableData.push(['非系统亏损平均持仓天数', 4.9]);

  return tableData;
}

function createTable3Data(): any[][] {
  const tableData: any[][] = [HEADERS_3];

  for (const month of MONTHS) {
    tableData.push([
      month,
      (Math.random() * 30 + 40).toFixed(2),
      (Math.random() * 25 + 45).toFixed(2),
      (Math.random() * 20 + 20).toFixed(2),
      (Math.random() * 25 + 35).toFixed(2),
      Math.floor(Math.random() * 10 + 5),
      Math.floor(Math.random() * 8 + 3),
      Math.floor(Math.random() * 10 + 5),
      Math.floor(Math.random() * 8 + 3)
    ]);
  }

  return tableData;
}

function generateTestExcel(): void {
  const workbook = XLSX.utils.book_new();

  const table1Data = createTable1Data();
  const worksheet1 = XLSX.utils.aoa_to_sheet(table1Data);
  worksheet1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);

  const table2Data = createTable2Data();
  const worksheet2 = XLSX.utils.aoa_to_sheet(table2Data);
  worksheet2['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);

  const table3Data = createTable3Data();
  const worksheet3 = XLSX.utils.aoa_to_sheet(table3Data);
  worksheet3['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);

  XLSX.writeFile(workbook, '交易复盘测试数据.xlsx');
  console.log('✅ 测试数据已生成：交易复盘测试数据.xlsx');
  console.log('📊 包含三个工作表：');
  console.log('   1. 表1-交易复盘数据');
  console.log('   2. 表2-动态数据分析');
  console.log('   3. 表3-月度统计');
}

generateTestExcel();

import * as XLSX from 'xlsx';
import { parseExcelFile, SHEET_NAME_1, SHEET_NAME_2, SHEET_NAME_3 } from './excelService';
import type { TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';

// 创建测试用的 Excel 文件
function createTestExcelFile(): File {
  const workbook = XLSX.utils.book_new();
  
  // 表1数据
  const table1Data = [
    ['开单时间', '股票名称', '股票代码', '交易类型', '是否符合系统', '有无大的失误', '盈亏情况', '持仓时间', '股票走势1', '股票走势2', '关键分时1', '关键分时2', '盘前是否'],
    ['2024-01-01', '测试股票', '000001', '齐飞水底', '是', '否', 5.5, 3, '', '', '', '', '是'],
    ['2024-01-02', '测试股票2', '000002', '齐飞水底', '否', '是', -2.3, 2, '', '', '', '', '否'],
  ];
  const worksheet1 = XLSX.utils.aoa_to_sheet(table1Data);
  XLSX.utils.book_append_sheet(workbook, worksheet1, SHEET_NAME_1);
  
  // 表2数据
  const table2Data = [
    ['指标', '数值'],
    ['系统盈利胜率', 65.5],
    ['系统无失误盈利胜率', 75.2],
    ['系统有失误盈利胜率', 45.8],
    ['非系统盈利胜率', 55.0],
    ['系统盈利平均持仓天数', 5.2],
    ['系统亏损平均持仓天数', 3.1],
    ['非系统盈利平均持仓天数', 4.5],
    ['非系统亏损平均持仓天数', 2.8],
  ];
  const worksheet2 = XLSX.utils.aoa_to_sheet(table2Data);
  XLSX.utils.book_append_sheet(workbook, worksheet2, SHEET_NAME_2);
  
  // 表3数据
  const table3Data = [
    ['月份', '系统盈利胜率', '系统无失误盈利胜率', '系统有失误盈利胜率', '非系统盈利胜率', '系统盈利平均持仓天数', '系统亏损平均持仓天数', '非系统盈利平均持仓天数', '非系统亏损平均持仓天数'],
    ['2024-01', 60.0, 70.0, 40.0, 50.0, 5, 3, 4, 2],
    ['2024-02', 65.0, 75.0, 45.0, 55.0, 6, 4, 5, 3],
  ];
  const worksheet3 = XLSX.utils.aoa_to_sheet(table3Data);
  XLSX.utils.book_append_sheet(workbook, worksheet3, SHEET_NAME_3);
  
  // 转换为 Blob
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([buffer], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// 测试 parseExcelFile 函数
async function testParseExcelFile() {
  console.log('=== 开始测试 parseExcelFile ===');
  
  const testFile = createTestExcelFile();
  console.log('1. 创建测试文件成功');
  
  // 测试解析表1
  console.log('\n2. 测试解析表1...');
  const result1 = await parseExcelFile(testFile, { tables: ['table1'], mode: 'append' });
  console.log('   表1解析结果:', result1);
  console.assert(result1.records && result1.records.length === 2, '表1应该有2条记录');
  console.log('   ✓ 表1解析成功');
  
  // 测试解析表2
  console.log('\n3. 测试解析表2...');
  const result2 = await parseExcelFile(testFile, { tables: ['table2'], mode: 'append' });
  console.log('   表2解析结果:', result2);
  console.assert(result2.analysis !== undefined, '表2应该有分析结果');
  console.log('   ✓ 表2解析成功');
  
  // 测试解析表3
  console.log('\n4. 测试解析表3...');
  const result3 = await parseExcelFile(testFile, { tables: ['table3'], mode: 'append' });
  console.log('   表3解析结果:', result3);
  console.assert(result3.monthlyAnalysis && result3.monthlyAnalysis.length === 2, '表3应该有2条月度数据');
  console.log('   ✓ 表3解析成功');
  
  // 测试解析所有表
  console.log('\n5. 测试解析所有表...');
  const resultAll = await parseExcelFile(testFile, { tables: ['table1', 'table2', 'table3'], mode: 'append' });
  console.log('   所有表解析结果:', resultAll);
  console.assert(resultAll.records && resultAll.records.length === 2, '所有表解析应该包含表1数据');
  console.assert(resultAll.analysis !== undefined, '所有表解析应该包含表2数据');
  console.assert(resultAll.monthlyAnalysis && resultAll.monthlyAnalysis.length === 2, '所有表解析应该包含表3数据');
  console.log('   ✓ 所有表解析成功');
  
  // 测试错误情况 - 文件不存在的表
  console.log('\n6. 测试错误处理...');
  const workbook = XLSX.utils.book_new();
  const emptySheet = XLSX.utils.aoa_to_sheet([['测试']]);
  XLSX.utils.book_append_sheet(workbook, emptySheet, '错误表名');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const errorFile = new File([buffer], 'error.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const errorResult = await parseExcelFile(errorFile, { tables: ['table1'], mode: 'append' });
  console.log('   错误处理结果:', errorResult);
  console.assert(errorResult.errors.length > 0, '应该有错误信息');
  console.log('   ✓ 错误处理成功');
  
  console.log('\n=== 所有测试通过 ===');
}

// 运行测试
testParseExcelFile().catch((err) => {
  console.error('测试失败:', err);
});
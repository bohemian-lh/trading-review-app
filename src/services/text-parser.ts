/**
 * 交易记录文本解析器
 * 支持 CSV、制表符分隔的文本等格式
 * 使用表头关键字定位列，不依赖固定位置
 */

export interface ParsedTextResult {
  openDate: string;
  stockCode: string;
  stockName: string;
  holdDays: number | null;
  amountValues: number[];
  profitPercent: number | null;
}

// 表头关键字映射
const headerKeywords = {
  date: ['成交日期', '日期'],
  code: ['证券代码', '代码'],
  name: ['证券名称', '名称'],
  amount: ['发生金额', '金额']
} as const;

/**
 * 将一行文本按分隔符拆分为单元格
 */
function splitLineIntoCells(line: string, separator: string | RegExp): string[] {
  let cells: string[];
  if (typeof separator === 'string') {
    cells = line.split(separator).map(cell => cell.trim());
  } else {
    cells = line.split(separator).map(cell => cell.trim());
  }
  // 过滤空单元格
  return cells.filter(cell => cell.length > 0);
}

/**
 * 解析交易文本，提取所需字段
 */
export function parseTradeText(text: string): ParsedTextResult {
  console.log('开始解析文本:', text.substring(0, 200));
  
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) {
    throw new Error('文本为空');
  }
  
  // 尝试确定分隔符 - 可能是制表符、逗号、或多个空格
  let separator: string | RegExp = '\t';
  const firstLine = lines[0];
  
  if (firstLine.includes('\t')) {
    separator = '\t';
  } else if (firstLine.includes(',')) {
    separator = ',';
  } else {
    // 如果没有明显分隔符，尝试多个空格
    separator = /\s+/;
  }
  
  console.log('使用分隔符:', separator === '\t' ? '制表符' : separator === ',' ? '逗号' : '空格');
  
  const dateValues: string[] = [];
  const stockCodeValues: string[] = [];
  const stockNameValues: string[] = [];
  const amountValues: number[] = [];
  
  // 先解析表头行，确定每个字段的位置
  let headerRowIndex = -1;
  let columnPositions = {
    date: -1,
    code: -1,
    name: -1,
    amount: -1
  };
  
  // 先找出表头行并确定列位置
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cells = splitLineIntoCells(line, separator);
    
    if (cells.length === 0) continue;
    
    // 检查是否包含表头关键字
    let hasAnyHeader = false;
    
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      
      for (const [field, keywords] of Object.entries(headerKeywords)) {
        for (const keyword of keywords) {
          if (cell.includes(keyword)) {
            (columnPositions as any)[field] = j;
            hasAnyHeader = true;
            console.log(`找到表头 ${keyword} 在列 ${j}`);
            break;
          }
        }
      }
    }
    
    if (hasAnyHeader) {
      headerRowIndex = i;
      console.log('找到完整表头行，索引:', i, '列位置:', columnPositions);
      break;
    }
  }
  
  // 如果我们找到了至少一些表头，继续；否则，回退到固定位置
  const useFixedFallback = (columnPositions.date === -1 || columnPositions.amount === -1);
  if (useFixedFallback) {
    console.log('未找到足够的表头，回退到固定位置');
  }
  
  // 从表头之后开始解析数据
  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  
  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cells = splitLineIntoCells(line, separator);
    
    if (cells.length < 4) continue;
    
    // 根据是否找到表头，决定提取方式
    let date: string | null = null;
    let code: string | null = null;
    let name: string | null = null;
    let amount: number | null = null;
    
    if (useFixedFallback) {
      // 回退模式：固定列位置
      date = tryParseDate(cells[0]);
      code = tryParseStockCode(cells[1]);
      name = tryParseStockName(cells[2]);
      amount = tryParseAmount(cells[3]);
    } else {
      // 表头模式：根据找到的位置提取
      if (columnPositions.date >= 0 && columnPositions.date < cells.length) {
        date = tryParseDate(cells[columnPositions.date]);
      }
      if (columnPositions.code >= 0 && columnPositions.code < cells.length) {
        code = tryParseStockCode(cells[columnPositions.code]);
      }
      if (columnPositions.name >= 0 && columnPositions.name < cells.length) {
        name = tryParseStockName(cells[columnPositions.name]);
      }
      if (columnPositions.amount >= 0 && columnPositions.amount < cells.length) {
        amount = tryParseAmount(cells[columnPositions.amount]);
      }
    }
    
    console.log(`行 ${i}:`, { date, code, name, amount, cells: cells.slice(0, 4) });
    
    if (date) dateValues.push(date);
    if (code) stockCodeValues.push(code);
    if (name) stockNameValues.push(name);
    if (amount !== null) amountValues.push(amount);
  }
  
  console.log('提取结果:', {
    dateValues,
    stockCodeValues,
    stockNameValues,
    amountValues
  });
  
  // 计算最终数据
  let openDate: string = '';
  let holdDays: number | null = null;
  
  if (dateValues.length > 0) {
    const validDates = dateValues.filter(d => d && d.length >= 6);
    if (validDates.length > 0) {
      const dateNums = validDates.map(d => {
        if (d.length === 8) return parseInt(d, 10);
        if (d.length === 6) return parseInt('20' + d, 10);
        return null;
      }).filter((d): d is number => d !== null);
      
      if (dateNums.length > 0) {
        const minDate = Math.min(...dateNums);
        const maxDate = Math.max(...dateNums);
        openDate = minDate.toString();
        
        const minMonth = Math.floor(minDate / 100);
        const maxMonth = Math.floor(maxDate / 100);
        
        if (minMonth === maxMonth) {
          holdDays = (maxDate % 100) - (minDate % 100) + 1;
        } else {
          holdDays = (maxDate % 100) + 31 - (minDate % 100);
        }
      }
    }
  }
  
  const stockCode = stockCodeValues.length > 0 ? stockCodeValues[0] : '';
  const stockName = stockNameValues.length > 0 ? stockNameValues[0] : '';
  
  return {
    openDate,
    stockCode,
    stockName,
    holdDays,
    amountValues,
    profitPercent: null
  };
}

/**
 * 解析日期
 */
function tryParseDate(text: string): string | null {
  const cleaned = text.trim();
  
  // 8位数字
  const match8 = cleaned.match(/(\d{8})/);
  if (match8) return match8[1];
  
  // 6位数字
  const match6 = cleaned.match(/(\d{6})/);
  if (match6) return '20' + match6[1];
  
  // 带分隔符
  const matchSep = cleaned.match(/(\d{4})[-\/\.]?(\d{1,2})[-\/\.]?(\d{1,2})/);
  if (matchSep) {
    return matchSep[1] + matchSep[2].padStart(2, '0') + matchSep[3].padStart(2, '0');
  }
  
  return null;
}

/**
 * 解析股票代码（6位数字）
 */
function tryParseStockCode(text: string): string | null {
  const cleaned = text.trim();
  const match = cleaned.match(/(\d{6})/);
  if (match) return match[1];
  return null;
}

/**
 * 解析股票名称（中文字符）
 */
function tryParseStockName(text: string): string | null {
  const cleaned = text.trim();
  // 提取中文字符
  const chineseChars = cleaned.match(/[\u4e00-\u9fa5]+/g);
  if (chineseChars) {
    const combined = chineseChars.join('');
    if (combined.length >= 2 && combined.length <= 8) {
      return combined;
    }
  }
  return null;
}

/**
 * 解析金额
 */
function tryParseAmount(text: string): number | null {
  let cleaned = text.trim().replace(/[^\d\.\-]/g, '');
  
  if (cleaned === '') return null;
  
  const num = parseFloat(cleaned);
  
  if (!isNaN(num) && Math.abs(num) >= 0.001 && Math.abs(num) <= 10000000) {
    return num;
  }
  
  return null;
}

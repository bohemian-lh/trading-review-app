import { OcrStrategy, OcrStrategyHandler, OcrResult } from '../../../types';

// 表头关键词定义
const HEADER_KEYWORDS = {
  DATE: ['成交日期', '日期', 'date'],
  STOCK_CODE: ['证券代码', '代码', 'code'],
  STOCK_NAME: ['证券名称', '名称', 'name'],
  AMOUNT: ['发生金额', '金额', 'amount']
};

// 解析结果类型
interface ParsedTableRow {
  date: string | null;
  stockCode: string | null;
  stockName: string | null;
  amount: number | null;
}

// 动态导入 tesseract.js，避免首次使用时才加载
const loadTesseract = async () => {
  try {
    const Tesseract = await import('tesseract.js');
    return Tesseract;
  } catch (e) {
    console.warn('Tesseract.js not installed, falling back to mock');
    return null;
  }
};

export class TesseractOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.TESSERACT;

  async parseImage(imageFile: File): Promise<OcrResult> {
    try {
      const Tesseract = await loadTesseract();
      
      if (!Tesseract) {
        return {
          success: false,
          error: 'Tesseract.js 未安装，请先安装依赖'
        };
      }

      console.log('开始识别图像...');
      
      // 识别图像
      const result = await Tesseract.recognize(
        imageFile,
        'chi_sim+eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              console.log(`识别进度: ${(m.progress * 100).toFixed(0)}%`);
            }
          }
        }
      );

      const rawText = result.data.text;
      console.log('原始识别文本:\n', rawText);

      // 解析表格数据
      const structuredData = this.parseTableData(rawText);

      return {
        success: true,
        data: {
          rawText,
          structuredData,
        },
      };

    } catch (error) {
      console.error('Tesseract OCR error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR 识别失败'
      };
    }
  }

  private parseTableData(rawText: string): any {
    // 1. 清理和分割文本
    const lines = this.cleanAndSplitText(rawText);
    console.log('清理后的行数据:', lines);
    
    if (lines.length < 2) {
      console.warn('行数太少，无法识别表格');
      return this.getFallbackResult();
    }
    
    // 2. 定位表头行并识别列位置
    const headerInfo = this.findAndParseHeader(lines);
    console.log('表头识别结果:', headerInfo);
    
    if (!headerInfo.headerFound) {
      console.warn('未找到有效表头，尝试备用方案');
      // 备用方案：尝试解析所有行并找规律
      return this.getFallbackResult();
    }
    
    // 3. 提取数据行
    const dataRows = this.extractDataRows(lines, headerInfo);
    console.log('提取到的数据行:', dataRows);
    
    if (dataRows.length === 0) {
      console.warn('未找到数据行');
      return this.getFallbackResult();
    }
    
    // 4. 按照规则计算结果
    const result = this.calculateResult(dataRows);
    console.log('最终计算结果:', result);
    
    return result;
  }

  /**
   * 清理文本并按行分割
   */
  private cleanAndSplitText(rawText: string): string[] {
    return rawText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * 寻找并解析表头，确定各列位置
   */
  private findAndParseHeader(lines: string[]): {
    headerFound: boolean;
    headerLineIndex: number;
    colPositions: { [key: string]: number };
  } {
    for (let i = 0; i < Math.min(lines.length, 5); i++) { // 只在前5行找表头
      const line = lines[i];
      const colPositions = this.tryParseHeaderLine(line);
      
      if (colPositions) {
        return {
          headerFound: true,
          headerLineIndex: i,
          colPositions
        };
      }
    }
    
    return {
      headerFound: false,
      headerLineIndex: -1,
      colPositions: {}
    };
  }

  /**
   * 尝试解析单行表头文本
   */
  private tryParseHeaderLine(headerLine: string): { [key: string]: number } | null {
    // 按空白分割成可能的单元格
    const cells = this.splitIntoCells(headerLine);
    
    if (cells.length < 4) {
      return null;
    }
    
    const positions: { [key: string]: number } = {};
    
    // 尝试匹配各列
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].toLowerCase();
      
      if (!positions.date && this.matchKeywords(cellText, HEADER_KEYWORDS.DATE)) {
        positions.date = i;
        console.log(`找到日期列在位置 ${i}: ${cells[i]}`);
      } else if (!positions.stockCode && this.matchKeywords(cellText, HEADER_KEYWORDS.STOCK_CODE)) {
        positions.stockCode = i;
        console.log(`找到证券代码列在位置 ${i}: ${cells[i]}`);
      } else if (!positions.stockName && this.matchKeywords(cellText, HEADER_KEYWORDS.STOCK_NAME)) {
        positions.stockName = i;
        console.log(`找到证券名称列在位置 ${i}: ${cells[i]}`);
      } else if (!positions.amount && this.matchKeywords(cellText, HEADER_KEYWORDS.AMOUNT)) {
        positions.amount = i;
        console.log(`找到发生金额列在位置 ${i}: ${cells[i]}`);
      }
    }
    
    // 至少需要找到日期和金额才能继续
    const requiredFields = ['date', 'amount'];
    const foundRequired = requiredFields.every(field => positions[field] !== undefined);
    
    if (foundRequired) {
      return positions;
    }
    
    return null;
  }

  /**
   * 检查文本是否匹配任意关键词
   */
  private matchKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  /**
   * 将行文本分割成单元格（考虑各种空白字符）
   */
  private splitIntoCells(line: string): string[] {
    return line
      .split(/[\s\t]+/)
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
  }

  /**
   * 提取数据行
   */
  private extractDataRows(lines: string[], headerInfo: any): ParsedTableRow[] {
    const rows: ParsedTableRow[] = [];
    const { headerLineIndex, colPositions } = headerInfo;
    
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = this.splitIntoCells(line);
      
      if (cells.length < 4) continue; // 跳过单元格太少的行
      
      const row: ParsedTableRow = {
        date: this.extractDate(cells, colPositions.date),
        stockCode: this.extractStockCode(cells, colPositions.stockCode),
        stockName: this.extractStockName(cells, colPositions.stockName),
        amount: this.extractAmount(cells, colPositions.amount)
      };
      
      if (row.date) { // 只有找到日期才算有效行
        rows.push(row);
      }
    }
    
    return rows;
  }

  /**
   * 提取日期
   */
  private extractDate(cells: string[], position: number | undefined): string | null {
    if (position === undefined || position >= cells.length) {
      // 尝试从第一个有效单元格找日期
      for (const cell of cells) {
        const date = this.tryParseDate(cell);
        if (date) return date;
      }
      return null;
    }
    
    return this.tryParseDate(cells[position]);
  }

  /**
   * 尝试解析日期字符串
   */
  private tryParseDate(text: string): string | null {
    // 尝试匹配 8位数字日期 (20260525)
    const match8Digit = text.match(/(\d{8})/);
    if (match8Digit) {
      return match8Digit[1];
    }
    
    // 尝试匹配带时间的格式 (20260525 09:30:00)
    const matchDateTime = text.match(/(\d{8})\s+\d{2}:\d{2}/);
    if (matchDateTime) {
      return matchDateTime[1];
    }
    
    // 尝试匹配带分隔符的格式 (2026-05-25 或 2026/05/25)
    const matchWithSeparators = text.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
    if (matchWithSeparators) {
      return `${matchWithSeparators[1]}${matchWithSeparators[2]}${matchWithSeparators[3]}`;
    }
    
    return null;
  }

  /**
   * 提取证券代码
   */
  private extractStockCode(cells: string[], position: number | undefined): string | null {
    if (position !== undefined && position < cells.length) {
      return cells[position].replace(/[^\d]/g, '').slice(0, 6);
    }
    
    // 备用：找6位纯数字
    for (const cell of cells) {
      const match = cell.match(/(\d{6})/);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * 提取证券名称
   */
  private extractStockName(cells: string[], position: number | undefined): string | null {
    if (position !== undefined && position < cells.length) {
      // 移除纯数字和符号
      const name = cells[position].replace(/[\d\.\-]+/g, '').trim();
      if (name.length > 0) {
        return name;
      }
    }
    
    // 备用：找包含中文字符的单元格
    for (const cell of cells) {
      if (/[\u4e00-\u9fa5]/.test(cell) && cell.length <= 8) {
        return cell.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '').trim();
      }
    }
    
    return null;
  }

  /**
   * 提取发生金额
   */
  private extractAmount(cells: string[], position: number | undefined): number | null {
    if (position !== undefined && position < cells.length) {
      return this.tryParseNumber(cells[position]);
    }
    
    // 备用：找带小数点的数字（优先找负数或带负号的）
    for (const cell of cells) {
      const num = this.tryParseNumber(cell);
      if (num !== null) {
        return num;
      }
    }
    
    return null;
  }

  /**
   * 尝试解析数字
   */
  private tryParseNumber(text: string): number | null {
    // 清理文本
    const cleaned = text.replace(/[^0-9\.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * 根据规则计算最终结果
   */
  private calculateResult(rows: ParsedTableRow[]): any {
    if (rows.length === 0) {
      return this.getFallbackResult();
    }

    // 1. 提取所有日期
    const validDates = rows
      .map(r => r.date)
      .filter((d): d is string => d !== null && d.length === 8);
    
    // 2. 计算开单日期（最小值）
    const openDate = validDates.length > 0 ? Math.min(...validDates.map(d => parseInt(d, 10))) : null;
    
    // 3. 计算持仓天数
    let holdDays: number | null = null;
    if (validDates.length >= 2) {
      const dateNums = validDates.map(d => parseInt(d, 10));
      const minDate = Math.min(...dateNums);
      const maxDate = Math.max(...dateNums);
      
      const minMonth = Math.floor(minDate / 100);
      const maxMonth = Math.floor(maxDate / 100);
      
      if (minMonth === maxMonth) {
        // 同月份
        holdDays = (maxDate % 100) - (minDate % 100) + 1;
      } else {
        // 跨月份
        const maxDay = maxDate % 100;
        const minDay = minDate % 100;
        holdDays = maxDay + 31 - minDay;
      }
    } else if (validDates.length === 1) {
      // 只有一天
      holdDays = 1;
    }
    
    // 4. 提取股票代码和名称（用第一条有效数据）
    const firstValidRow = rows.find(r => r.stockCode || r.stockName);
    const stockCode = firstValidRow?.stockCode || null;
    const stockName = firstValidRow?.stockName || null;
    
    // 5. 计算盈亏百分比
    let profitPercent: number | null = null;
    const validAmounts = rows
      .map(r => r.amount)
      .filter((a): a is number => a !== null);
    
    if (validAmounts.length > 0) {
      const totalSum = validAmounts.reduce((a, b) => a + b, 0);
      const negativeSum = validAmounts
        .filter(a => a < 0)
        .reduce((a, b) => a + b, 0);
      
      if (negativeSum !== 0) {
        // 总和 / 负数绝对值总和
        profitPercent = totalSum / Math.abs(negativeSum);
        // 保留2位小数
        profitPercent = Math.round(profitPercent * 100) / 100;
      }
    }
    
    return {
      openDate: openDate ? openDate.toString() : null,
      stockCode,
      stockName,
      profitPercent,
      holdDays
    };
  }

  /**
   * 返回备用结果（目前为空，后续可以改进）
   */
  private getFallbackResult(): any {
    return {
      openDate: null,
      stockCode: null,
      stockName: null,
      profitPercent: null,
      holdDays: null
    };
  }
}

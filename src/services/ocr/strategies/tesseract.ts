import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

// 解析后的表格行
interface ParsedTableRow {
  date: string | null;
  stockCode: string | null;
  stockName: string | null;
  amount: number | null;
}

export class TesseractOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.TESSERACT;

  async parseImage(imageFile: File): Promise<OcrResult> {
    try {
      const Tesseract = await this.loadTesseract();
      
      if (!Tesseract) {
        return {
          success: false,
          error: 'Tesseract.js 未安装，请先安装依赖'
        };
      }

      console.log('=== 开始识别图像 ===');
      
      // 使用 Tesseract 识别
      const result = await Tesseract.recognize(
        imageFile,
        'chi_sim+eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              console.log(`识别进度: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      console.log('识别完成，开始解析...');
      console.log('原始文本长度:', result.data.text?.length || 0);
      console.log('原始文本预览:', (result.data.text || '').substring(0, 500));
      
      // 解析表格数据
      const { structuredData, calculation } = this.parseTableData(result.data.text || '');
      
      return {
        success: true,
        data: {
          rawText: result.data.text,
          structuredData,
          calculation
        }
      };

    } catch (error) {
      console.error('Tesseract OCR error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR 识别失败'
      };
    }
  }

  private async loadTesseract() {
    try {
      const Tesseract = await import('tesseract.js');
      return Tesseract;
    } catch (e) {
      console.warn('Tesseract.js not installed, falling back to mock');
      return null;
    }
  }

  /**
   * 解析表格数据
   */
  private parseTableData(text: string): { structuredData: any; calculation?: ProfitCalculation } {
    console.log('=== 开始解析表格数据 ===');
    
    // 清理和分割文本
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log('清理后的行数:', lines.length);
    console.log('前10行:', lines.slice(0, 10));
    
    if (lines.length < 2) {
      console.warn('行数太少，无法识别表格');
      return { structuredData: this.getFallbackResult() };
    }
    
    // 解析每一行
    const dataRows: ParsedTableRow[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const row = this.parseLine(line);
      
      // 如果这一行至少有日期或者金额，就认为是有效数据行
      if (row.date || row.amount) {
        dataRows.push(row);
        console.log(`行 ${i} 解析成功:`, row);
      }
    }
    
    console.log('共解析到有效数据行:', dataRows.length);
    
    if (dataRows.length === 0) {
      console.warn('未找到有效数据行');
      return { structuredData: this.getFallbackResult() };
    }
    
    // 计算最终结果
    return this.calculateResult(dataRows);
  }

  /**
   * 解析单行文本
   */
  private parseLine(line: string): ParsedTableRow {
    const result: ParsedTableRow = {
      date: null,
      stockCode: null,
      stockName: null,
      amount: null
    };
    
    // 分割成单元格
    const cells = line.split(/\s+|，|,/).filter(cell => cell.trim().length > 0);
    console.log('行分割结果:', cells);
    
    // 在所有单元格中寻找各种数据
    for (const cell of cells) {
      const cleanedCell = cell.trim();
      
      // 尝试解析日期
      if (!result.date) {
        result.date = this.tryParseDate(cleanedCell);
      }
      
      // 尝试解析股票代码
      if (!result.stockCode) {
        result.stockCode = this.tryParseStockCode(cleanedCell);
      }
      
      // 尝试解析股票名称
      if (!result.stockName) {
        result.stockName = this.tryParseStockName(cleanedCell);
      }
      
      // 尝试解析金额
      if (!result.amount) {
        result.amount = this.tryParseAmount(cleanedCell);
      }
    }
    
    return result;
  }

  /**
   * 解析日期
   */
  private tryParseDate(text: string): string | null {
    // 尝试匹配 8位数字日期 (20260303)
    const match8Digit = text.match(/(\d{8})/);
    if (match8Digit) {
      return match8Digit[1];
    }
    
    // 尝试匹配带分隔符的格式 (2026-03-03, 2026/03/03, 2026.03.03)
    const matchWithSeparators = text.match(/(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (matchWithSeparators) {
      const year = matchWithSeparators[1];
      const month = matchWithSeparators[2].padStart(2, '0');
      const day = matchWithSeparators[3].padStart(2, '0');
      return `${year}${month}${day}`;
    }
    
    // 尝试匹配 6位数字日期 (260303)
    const match6Digit = text.match(/(\d{6})/);
    if (match6Digit) {
      const year = '20' + match6Digit[1].substring(0, 2);
      const monthDay = match6Digit[1].substring(2);
      return year + monthDay;
    }
    
    return null;
  }

  /**
   * 解析股票代码
   */
  private tryParseStockCode(text: string): string | null {
    // 6位纯数字
    const match = text.match(/^(\d{6})$/);
    if (match) {
      return match[1];
    }
    
    // 包含6位数字
    const match2 = text.match(/(\d{6})/);
    if (match2) {
      return match2[1];
    }
    
    return null;
  }

  /**
   * 解析股票名称
   */
  private tryParseStockName(text: string): string | null {
    // 只包含中文，长度在2-8之间
    const chineseOnly = text.match(/^[\u4e00-\u9fa5]+$/);
    if (chineseOnly && text.length >= 2 && text.length <= 8) {
      return text;
    }
    
    // 提取中文字符
    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
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
  private tryParseAmount(text: string): number | null {
    // 清理文本，只保留数字、小数点、负号
    const cleaned = text.replace(/[^\d\.\-]/g, '');
    
    // 必须包含数字
    if (!/\d/.test(cleaned)) {
      return null;
    }
    
    const num = parseFloat(cleaned);
    
    // 金额通常不会太小（至少几块钱），也不会太大
    if (!isNaN(num) && Math.abs(num) >= 0.01 && Math.abs(num) <= 10000000) {
      return num;
    }
    
    return null;
  }

  /**
   * 计算最终结果
   */
  private calculateResult(dataRows: ParsedTableRow[]): { 
    structuredData: any; 
    calculation?: ProfitCalculation 
  } {
    console.log('=== 计算最终结果 ===');
    
    // 提取所有有效日期
    const validDates = dataRows
      .map(r => r.date)
      .filter((d): d is string => d !== null && d.length === 8);
    
    console.log('有效日期:', validDates);
    
    // 计算开单日期和持仓天数
    let openDate: string | null = null;
    let holdDays: number | null = null;
    
    if (validDates.length > 0) {
      const dateNums = validDates.map(d => parseInt(d, 10));
      const minDate = Math.min(...dateNums);
      const maxDate = Math.max(...dateNums);
      
      openDate = minDate.toString();
      
      const minMonth = Math.floor(minDate / 100);
      const maxMonth = Math.floor(maxDate / 100);
      
      if (minMonth === maxMonth) {
        holdDays = (maxDate % 100) - (minDate % 100) + 1;
      } else {
        const maxDay = maxDate % 100;
        const minDay = minDate % 100;
        holdDays = maxDay + 31 - minDay;
      }
      
      console.log('开单日期:', openDate, '持仓天数:', holdDays);
    }
    
    // 提取股票代码和名称（用第一个有效数据）
    const firstValidRow = dataRows.find(r => r.stockCode || r.stockName);
    const stockCode = firstValidRow?.stockCode || null;
    const stockName = firstValidRow?.stockName || null;
    
    console.log('股票代码:', stockCode, '股票名称:', stockName);
    
    // 计算盈亏
    let profitPercent: number | null = null;
    let calculation: ProfitCalculation | undefined;
    
    const validAmounts = dataRows
      .map(r => r.amount)
      .filter((a): a is number => a !== null);
    
    console.log('有效金额:', validAmounts);
    
    if (validAmounts.length > 0) {
      const totalSum = validAmounts.reduce((a, b) => a + b, 0);
      const negativeAmounts = validAmounts.filter(a => a < 0);
      const negativeAbsSum = Math.abs(negativeAmounts.reduce((a, b) => a + b, 0));
      
      console.log('总金额:', totalSum, '负数绝对值和:', negativeAbsSum);
      
      if (negativeAbsSum !== 0) {
        profitPercent = totalSum / negativeAbsSum;
        profitPercent = Math.round(profitPercent * 10000) / 10000; // 保留4位小数
      }
      
      calculation = {
        allAmounts: validAmounts,
        totalSum,
        negativeAmounts,
        negativeAbsSum,
        profitPercent
      };
      
      console.log('盈亏百分比:', profitPercent);
    }
    
    return {
      structuredData: {
        openDate,
        stockCode,
        stockName,
        profitPercent,
        holdDays
      },
      calculation
    };
  }

  /**
   * 返回备用结果
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

import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

// 表头关键词定义
const HEADER_KEYWORDS = {
  DATE: ['成交日期', '日期', 'date', '发生日期'],
  STOCK_CODE: ['证券代码', '代码', 'code', '股票代码'],
  STOCK_NAME: ['证券名称', '名称', 'name', '股票名称'],
  AMOUNT: ['发生金额', '金额', 'amount', '发生']
};

// 文字块坐标信息
interface WordBox {
  text: string;
  x: number;      // 左上角 x 坐标
  y: number;      // 左上角 y 坐标
  width: number;  // 宽度
  height: number; // 高度
}

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

      console.log('=== 开始识别图像（坐标模式）===');
      
      // 使用详细的识别模式获取坐标信息
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

      console.log('识别完成，开始解析...');
      
      // 获取详细的文字块信息
      const words = this.extractWordBoxes(result);
      console.log(`提取到 ${words.length} 个文字块`);
      
      if (words.length === 0) {
        return {
          success: false,
          error: '未识别到任何文字'
        };
      }

      // 解析表格数据
      const { structuredData, calculation } = this.parseTableWithCoordinates(words);
      
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
   * 从 Tesseract 结果中提取文字块和坐标
   */
  private extractWordBoxes(result: any): WordBox[] {
    const words: WordBox[] = [];
    
    // 尝试从不同层级提取文字块
    if (result.data.words && result.data.words.length > 0) {
      // 使用 words 数组
      for (const word of result.data.words) {
        if (word.text && word.bbox) {
          words.push({
            text: word.text.trim(),
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0
          });
        }
      }
    } else if (result.data.lines && result.data.lines.length > 0) {
      // 使用 lines 数组
      for (const line of result.data.lines) {
        if (line.words && line.words.length > 0) {
          for (const word of line.words) {
            if (word.text && word.bbox) {
              words.push({
                text: word.text.trim(),
                x: word.bbox.x0,
                y: word.bbox.y0,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0
              });
            }
          }
        } else if (line.text && line.bbox) {
          words.push({
            text: line.text.trim(),
            x: line.bbox.x0,
            y: line.bbox.y0,
            width: line.bbox.x1 - line.bbox.x0,
            height: line.bbox.y1 - line.bbox.y0
          });
        }
      }
    }
    
    // 过滤空文字
    return words.filter(w => w.text.length > 0);
  }

  /**
   * 使用坐标信息解析表格
   */
  private parseTableWithCoordinates(words: WordBox[]): { 
    structuredData: any; 
    calculation?: ProfitCalculation 
  } {
    console.log('=== 使用坐标解析表格 ===');
    
    // 1. 按 y 坐标聚类，确定行
    const rows = this.groupWordsByRow(words);
    console.log(`识别到 ${rows.length} 行`);
    
    if (rows.length < 2) {
      console.warn('行数太少，无法识别表格');
      return { structuredData: this.getFallbackResult() };
    }
    
    // 2. 确定表头行
    const headerRowIndex = this.findHeaderRow(rows);
    if (headerRowIndex === -1) {
      console.warn('未找到表头，尝试直接从数据中提取');
      return this.parseWithoutHeader(rows);
    }
    
    console.log(`找到表头在第 ${headerRowIndex + 1} 行`);
    
    // 3. 根据表头确定每列的含义
    const headerRow = rows[headerRowIndex];
    const columnMapping = this.mapColumns(headerRow);
    console.log('列映射:', columnMapping);
    
    // 4. 提取数据行
    const dataRows: ParsedTableRow[] = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = this.parseDataRow(rows[i], columnMapping);
      if (row.date || row.amount) {
        dataRows.push(row);
        console.log('解析到数据行:', row);
      }
    }
    
    if (dataRows.length === 0) {
      console.warn('未找到有效数据行');
      return { structuredData: this.getFallbackResult() };
    }
    
    // 5. 计算最终结果
    return this.calculateResult(dataRows);
  }

  /**
   * 按 y 坐标将文字块分组为行
   */
  private groupWordsByRow(words: WordBox[]): WordBox[][] {
    if (words.length === 0) return [];
    
    // 先按 y 坐标排序
    const sortedByY = [...words].sort((a, b) => a.y - b.y);
    
    const rows: WordBox[][] = [];
    let currentRow: WordBox[] = [sortedByY[0]];
    
    // 估算行高
    const avgHeight = words.reduce((sum, w) => sum + w.height, 0) / words.length;
    const threshold = avgHeight * 0.8; // 80% 的高度作为阈值
    
    for (let i = 1; i < sortedByY.length; i++) {
      const word = sortedByY[i];
      const lastWord = currentRow[currentRow.length - 1];
      
      if (word.y - lastWord.y < threshold) {
        // 同一行
        currentRow.push(word);
      } else {
        // 新的一行，先对当前行按 x 坐标排序
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
        currentRow = [word];
      }
    }
    
    // 处理最后一行
    currentRow.sort((a, b) => a.x - b.x);
    rows.push(currentRow);
    
    return rows;
  }

  /**
   * 找到表头行
   */
  private findHeaderRow(rows: WordBox[][]): number {
    // 在前3行中找表头
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const row = rows[i];
      const hasKeywords = this.checkRowForKeywords(row);
      if (hasKeywords) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 检查一行是否包含表头关键词
   */
  private checkRowForKeywords(row: WordBox[]): boolean {
    const text = row.map(w => w.text).join(' ').toLowerCase();
    let foundCount = 0;
    
    for (const category of Object.values(HEADER_KEYWORDS)) {
      for (const keyword of category) {
        if (text.includes(keyword.toLowerCase())) {
          foundCount++;
          break;
        }
      }
    }
    
    return foundCount >= 2; // 至少找到2个关键词
  }

  /**
   * 映射每列的含义
   */
  private mapColumns(headerRow: WordBox[]): { 
    date?: number; 
    stockCode?: number; 
    stockName?: number; 
    amount?: number; 
  } {
    const mapping: any = {};
    
    for (let i = 0; i < headerRow.length; i++) {
      const word = headerRow[i].text.toLowerCase();
      
      if (!mapping.date && HEADER_KEYWORDS.DATE.some(k => word.includes(k.toLowerCase()))) {
        mapping.date = i;
      } else if (!mapping.stockCode && HEADER_KEYWORDS.STOCK_CODE.some(k => word.includes(k.toLowerCase()))) {
        mapping.stockCode = i;
      } else if (!mapping.stockName && HEADER_KEYWORDS.STOCK_NAME.some(k => word.includes(k.toLowerCase()))) {
        mapping.stockName = i;
      } else if (!mapping.amount && HEADER_KEYWORDS.AMOUNT.some(k => word.includes(k.toLowerCase()))) {
        mapping.amount = i;
      }
    }
    
    return mapping;
  }

  /**
   * 解析单行数据
   */
  private parseDataRow(row: WordBox[], columnMapping: any): ParsedTableRow {
    return {
      date: columnMapping.date !== undefined && columnMapping.date < row.length 
        ? this.tryParseDate(row[columnMapping.date].text) 
        : this.tryFindDateInRow(row),
      stockCode: columnMapping.stockCode !== undefined && columnMapping.stockCode < row.length 
        ? this.tryParseStockCode(row[columnMapping.stockCode].text) 
        : this.tryFindStockCodeInRow(row),
      stockName: columnMapping.stockName !== undefined && columnMapping.stockName < row.length 
        ? this.tryParseStockName(row[columnMapping.stockName].text) 
        : this.tryFindStockNameInRow(row),
      amount: columnMapping.amount !== undefined && columnMapping.amount < row.length 
        ? this.tryParseAmount(row[columnMapping.amount].text) 
        : this.tryFindAmountInRow(row)
    };
  }

  /**
   * 不从表头，直接从所有行中提取数据
   */
  private parseWithoutHeader(rows: WordBox[][]): { 
    structuredData: any; 
    calculation?: ProfitCalculation 
  } {
    console.log('尝试无表头解析...');
    const dataRows: ParsedTableRow[] = [];
    
    for (const row of rows) {
      const parsedRow: ParsedTableRow = {
        date: this.tryFindDateInRow(row),
        stockCode: this.tryFindStockCodeInRow(row),
        stockName: this.tryFindStockNameInRow(row),
        amount: this.tryFindAmountInRow(row)
      };
      
      if (parsedRow.date || parsedRow.amount) {
        dataRows.push(parsedRow);
        console.log('无表头解析到数据行:', parsedRow);
      }
    }
    
    if (dataRows.length === 0) {
      console.warn('无表头解析也未找到数据');
      return { structuredData: this.getFallbackResult() };
    }
    
    return this.calculateResult(dataRows);
  }

  /**
   * 在一行中尝试找日期
   */
  private tryFindDateInRow(row: WordBox[]): string | null {
    for (const word of row) {
      const date = this.tryParseDate(word.text);
      if (date) return date;
    }
    return null;
  }

  /**
   * 在一行中尝试找股票代码
   */
  private tryFindStockCodeInRow(row: WordBox[]): string | null {
    for (const word of row) {
      const code = this.tryParseStockCode(word.text);
      if (code) return code;
    }
    return null;
  }

  /**
   * 在一行中尝试找股票名称
   */
  private tryFindStockNameInRow(row: WordBox[]): string | null {
    for (const word of row) {
      const name = this.tryParseStockName(word.text);
      if (name) return name;
    }
    return null;
  }

  /**
   * 在一行中尝试找金额
   */
  private tryFindAmountInRow(row: WordBox[]): number | null {
    for (const word of row) {
      const amount = this.tryParseAmount(word.text);
      if (amount !== null) return amount;
    }
    return null;
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
    
    // 尝试匹配带分隔符的格式
    const matchWithSeparators = text.match(/(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (matchWithSeparators) {
      const year = matchWithSeparators[1];
      const month = matchWithSeparators[2].padStart(2, '0');
      const day = matchWithSeparators[3].padStart(2, '0');
      return `${year}${month}${day}`;
    }
    
    return null;
  }

  /**
   * 解析股票代码
   */
  private tryParseStockCode(text: string): string | null {
    // 6位纯数字
    const match = text.match(/(\d{6})/);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * 解析股票名称
   */
  private tryParseStockName(text: string): string | null {
    // 至少包含2个中文字符
    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
    if (chineseChars) {
      const combined = chineseChars.join('');
      if (combined.length >= 2) {
        return combined;
      }
    }
    return null;
  }

  /**
   * 解析金额
   */
  private tryParseAmount(text: string): number | null {
    // 清理文本，保留数字、小数点、负号
    const cleaned = text.replace(/[^\d\.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * 计算最终结果
   */
  private calculateResult(dataRows: ParsedTableRow[]): { 
    structuredData: any; 
    calculation?: ProfitCalculation 
  } {
    // 提取所有有效日期
    const validDates = dataRows
      .map(r => r.date)
      .filter((d): d is string => d !== null && d.length === 8);
    
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
    }
    
    // 提取股票代码和名称
    const firstValidRow = dataRows.find(r => r.stockCode || r.stockName);
    const stockCode = firstValidRow?.stockCode || null;
    const stockName = firstValidRow?.stockName || null;
    
    // 计算盈亏
    let profitPercent: number | null = null;
    let calculation: ProfitCalculation | undefined;
    
    const validAmounts = dataRows
      .map(r => r.amount)
      .filter((a): a is number => a !== null);
    
    if (validAmounts.length > 0) {
      const totalSum = validAmounts.reduce((a, b) => a + b, 0);
      const negativeAmounts = validAmounts.filter(a => a < 0);
      const negativeAbsSum = Math.abs(negativeAmounts.reduce((a, b) => a + b, 0));
      
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
      
      console.log('金额计算:', {
        allAmounts: validAmounts,
        totalSum,
        negativeAmounts,
        negativeAbsSum,
        profitPercent
      });
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
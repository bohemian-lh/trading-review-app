import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

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
      
      let tesseractResult: any = null;
      
      // 识别图像，获取详细结果
      await Tesseract.recognize(
        imageFile,
        'chi_sim+eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              console.log(`识别进度: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      ).then((result: any) => {
        tesseractResult = result;
      });

      if (!tesseractResult) {
        return { success: false, error: 'Tesseract 识别失败，没有返回结果' };
      }

      console.log('=== 调试 Tesseract 结果结构 ===');
      console.log('完整 keys:', Object.keys(tesseractResult));
      
      if (tesseractResult.data) {
        console.log('data keys:', Object.keys(tesseractResult.data));
      }

      // 尝试多种方式获取文字块
      let words: any[] = [];
      
      // 方法1: words
      if (tesseractResult.data?.words?.length > 0) {
        words = tesseractResult.data.words;
        console.log('使用 words 字段，数量:', words.length);
      } 
      // 方法2: lines
      else if (tesseractResult.data?.lines?.length > 0) {
        words = tesseractResult.data.lines;
        console.log('使用 lines 字段，数量:', words.length);
      } 
      // 方法3: symbols
      else if (tesseractResult.data?.symbols?.length > 0) {
        words = tesseractResult.data.symbols;
        console.log('使用 symbols 字段，数量:', words.length);
      } 
      // 方法4: blocks
      else if (tesseractResult.data?.blocks?.length > 0) {
        words = tesseractResult.data.blocks;
        console.log('使用 blocks 字段，数量:', words.length);
      }
      // 方法5: 回退到纯文本解析
      else {
        console.log('没有找到坐标信息，使用纯文本解析');
        return this.parseWithPureText(tesseractResult.data?.text || '');
      }

      // 打印前10个文字块的信息
      console.log('前10个文字块:');
      words.slice(0, 10).forEach((w, i) => {
        console.log(`${i}:`, JSON.stringify({
          text: w.text,
          bbox: w.bbox || { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }
        }));
      });

      // 使用坐标信息解析表格
      const result = this.parseWithCoordinates(words);
      
      return {
        success: true,
        data: {
          rawText: tesseractResult.data?.text || '',
          structuredData: result.structuredData,
          calculation: result.calculation
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
   * 使用坐标信息按列固定规则解析表格
   * 固定规则：
   * - 第一列：日期
   * - 第二列：股票代码
   * - 第三列：股票名称
   * - 第四列：发生金额
   */
  private parseWithCoordinates(words: any[]): { 
    structuredData: any; 
    calculation?: ProfitCalculation 
  } {
    console.log('=== 使用坐标模式解析 ===');
    
    // 1. 提取所有文字块并标准化坐标
    const textBlocks = words.map((word, index) => {
      let text = word.text;
      let x0 = word.bbox?.x0 ?? word.x0 ?? 0;
      let y0 = word.bbox?.y0 ?? word.y0 ?? 0;
      let x1 = word.bbox?.x1 ?? word.x1 ?? 0;
      let y1 = word.bbox?.y1 ?? word.y1 ?? 0;
      
      return { text, x0, y0, x1, y1, index };
    });
    
    console.log('提取文字块数量:', textBlocks.length);

    if (textBlocks.length === 0) {
      console.warn('没有找到任何文字块');
      return { structuredData: this.getFallbackResult() };
    }

    // 2. 按 y 坐标聚类（分出行）
    // 排序所有文字块的 y0 坐标
    const sortedY = textBlocks.map(b => b.y0).sort((a, b) => a - b);
    
    // 找到 y 坐标的自然分组（聚类）
    const yGroups: number[][] = [];
    let currentGroup: number[] = [];
    const yThreshold = 15; // 同一行内的 y 坐标差异阈值
    
    for (let i = 0; i < sortedY.length; i++) {
      if (i === 0) {
        currentGroup.push(sortedY[i]);
      } else {
        if (sortedY[i] - sortedY[i - 1] < yThreshold) {
          currentGroup.push(sortedY[i]);
        } else {
          yGroups.push([...currentGroup]);
          currentGroup = [sortedY[i]];
        }
      }
    }
    if (currentGroup.length > 0) {
      yGroups.push(currentGroup);
    }
    
    console.log('找到行数量:', yGroups.length);
    
    // 计算每行的中心 y 坐标
    const rowCenters = yGroups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
    console.log('行中心:', rowCenters);

    // 3. 将文字块分配到行
    const rows: any[][] = rowCenters.map(() => []);
    
    for (const block of textBlocks) {
      // 找到最近的行中心
      let minDist = Infinity;
      let bestRowIndex = 0;
      
      for (let i = 0; i < rowCenters.length; i++) {
        const dist = Math.abs(block.y0 - rowCenters[i]);
        if (dist < minDist) {
          minDist = dist;
          bestRowIndex = i;
        }
      }
      
      rows[bestRowIndex].push(block);
    }
    
    // 排序每行内的文字块按 x 坐标
    for (let i = 0; i < rows.length; i++) {
      rows[i].sort((a, b) => a.x0 - b.x0);
    }
    
    console.log('解析到的行:');
    rows.forEach((row, i) => {
      const rowText = row.map(r => r.text).join(' | ');
      console.log(`行 ${i}: ${rowText}`);
    });

    // 4. 按列固定规则解析数据
    const dateValues: string[] = [];
    const stockCodeValues: string[] = [];
    const stockNameValues: string[] = [];
    const amountValues: number[] = [];

    for (const row of rows) {
      if (row.length < 4) continue; // 至少需要4列数据
      
      // 按 x0 排序
      const sortedRow = [...row].sort((a, b) => a.x0 - b.x0);
      
      // 第一列：日期
      const dateText = sortedRow[0].text;
      const parsedDate = this.tryParseDate(dateText);
      if (parsedDate) {
        dateValues.push(parsedDate);
      }
      
      // 第二列：股票代码
      const codeText = sortedRow[1].text;
      const parsedCode = this.tryParseStockCode(codeText);
      if (parsedCode) {
        stockCodeValues.push(parsedCode);
      }
      
      // 第三列：股票名称
      const nameText = sortedRow[2].text;
      const parsedName = this.tryParseStockName(nameText);
      if (parsedName) {
        stockNameValues.push(parsedName);
      }
      
      // 第四列：发生金额
      const amountText = sortedRow[3].text;
      const parsedAmount = this.tryParseAmount(amountText);
      if (parsedAmount !== null) {
        amountValues.push(parsedAmount);
      }
    }
    
    console.log('提取结果:');
    console.log('日期:', dateValues);
    console.log('股票代码:', stockCodeValues);
    console.log('股票名称:', stockNameValues);
    console.log('发生金额:', amountValues);

    // 5. 计算最终结果
    return this.calculateResult(dateValues, stockCodeValues, stockNameValues, amountValues);
  }

  /**
   * 纯文本回退解析方法
   */
  private parseWithPureText(text: string): OcrResult {
    console.log('=== 纯文本回退解析 ===');
    
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const dateValues: string[] = [];
    const stockCodeValues: string[] = [];
    const stockNameValues: string[] = [];
    const amountValues: number[] = [];

    for (const line of lines) {
      const cells = line.split(/\s+|\t|,/).filter(c => c.trim().length > 0);
      if (cells.length < 4) continue;
      
      const date = this.tryParseDate(cells[0]);
      const code = this.tryParseStockCode(cells[1]);
      const name = this.tryParseStockName(cells[2]);
      const amount = this.tryParseAmount(cells[3]);
      
      if (date) dateValues.push(date);
      if (code) stockCodeValues.push(code);
      if (name) stockNameValues.push(name);
      if (amount !== null) amountValues.push(amount);
    }
    
    const result = this.calculateResult(dateValues, stockCodeValues, stockNameValues, amountValues);
    
    return {
      success: true,
      data: {
        rawText: text,
        structuredData: result.structuredData,
        calculation: result.calculation
      }
    };
  }

  /**
   * 计算最终结果
   */
  private calculateResult(
    dateValues: string[], 
    stockCodeValues: string[], 
    stockNameValues: string[], 
    amountValues: number[]
  ): { structuredData: any; calculation?: ProfitCalculation } {
    
    let openDate: string | null = null;
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
    
    const stockCode = stockCodeValues.length > 0 ? stockCodeValues[0] : null;
    const stockName = stockNameValues.length > 0 ? stockNameValues[0] : null;
    
    let profitPercent: number | null = null;
    let calculation: ProfitCalculation | undefined;
    
    if (amountValues.length > 0) {
      const totalSum = amountValues.reduce((a, b) => a + b, 0);
      const negativeAmounts = amountValues.filter(a => a < 0);
      const negativeAbsSum = Math.abs(negativeAmounts.reduce((a, b) => a + b, 0));
      
      if (negativeAbsSum !== 0) {
        profitPercent = totalSum / negativeAbsSum;
        profitPercent = Math.round(profitPercent * 10000) / 10000;
      }
      
      calculation = {
        allAmounts: amountValues,
        totalSum,
        negativeAmounts,
        negativeAbsSum,
        profitPercent
      };
    }
    
    return {
      structuredData: { openDate, stockCode, stockName, profitPercent, holdDays },
      calculation
    };
  }

  /**
   * 解析日期
   */
  private tryParseDate(text: string): string | null {
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
  private tryParseStockCode(text: string): string | null {
    const cleaned = text.trim();
    const match = cleaned.match(/(\d{6})/);
    if (match) return match[1];
    return null;
  }

  /**
   * 解析股票名称（中文字符）
   */
  private tryParseStockName(text: string): string | null {
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
  private tryParseAmount(text: string): number | null {
    let cleaned = text.trim().replace(/[^\d\.\-]/g, '');
    
    if (cleaned === '') return null;
    
    const num = parseFloat(cleaned);
    
    if (!isNaN(num) && Math.abs(num) >= 0.01 && Math.abs(num) <= 10000000) {
      return num;
    }
    
    return null;
  }

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
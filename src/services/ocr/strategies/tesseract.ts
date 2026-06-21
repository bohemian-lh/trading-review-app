import { OcrStrategy, OcrStrategyHandler, OcrResult } from '../../../types';
import { calculateHoldDays } from '@/utils/holdDays';

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

      console.log('=== 开始识别图像（固定表头模式）===');
      
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

      // 标准化文字块坐标
      const textBlocks = words.map((word, index) => {
        let text = word.text || '';
        let x0 = word.bbox?.x0 ?? word.x0 ?? 0;
        let y0 = word.bbox?.y0 ?? word.y0 ?? 0;
        let x1 = word.bbox?.x1 ?? word.x1 ?? 0;
        let y1 = word.bbox?.y1 ?? word.y1 ?? 0;
        
        return { text, x0, y0, x1, y1, index };
      });

      // 打印前20个文字块用于调试
      console.log('前20个文字块:');
      textBlocks.slice(0, 20).forEach((block, i) => {
        console.log(`${i}: "${block.text}" at x:${Math.round(block.x0)}, y:${Math.round(block.y0)}`);
      });

      // 使用固定表头模式解析
      const result = this.parseWithFixedHeader(textBlocks);
      
      return {
        success: true,
        data: {
          rawText: tesseractResult.data?.text || '',
          structuredData: result.structuredData
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
   * 固定表头解析模式：
   * 1. 先找包含表头关键词的文字块确定列位置
   * 2. 按确定的列位置提取数据
   */
  private parseWithFixedHeader(blocks: Array<{ text: string; x0: number; y0: number; x1: number; y1: number; index: number }>): { 
    structuredData: any; 
  } {
    console.log('=== 固定表头解析模式 ===');
    
    // 表头关键词
    const headerKeywords = ['成交日期', '证券代码', '证券名称', '发生金额'];
    
    // 1. 找表头位置
    let headerBlocks: Array<{ text: string; x0: number; y0: number; keyword: string }> = [];
    
    for (const block of blocks) {
      for (const keyword of headerKeywords) {
        if (block.text.includes(keyword)) {
          headerBlocks.push({
            text: block.text,
            x0: block.x0,
            y0: block.y0,
            keyword
          });
          console.log(`找到表头: "${keyword}" at x:${Math.round(block.x0)}, y:${Math.round(block.y0)}`);
        }
      }
    }

    let dateValues: string[] = [];
    let stockCodeValues: string[] = [];
    let stockNameValues: string[] = [];
    let amountValues: number[] = [];

    // 如果找到了表头，按列提取数据
    if (headerBlocks.length >= 2) {
      console.log('使用表头定位列');
      
      // 按关键词分组
      const dateHeader = headerBlocks.find(h => h.keyword === '成交日期');
      const codeHeader = headerBlocks.find(h => h.keyword === '证券代码');
      const nameHeader = headerBlocks.find(h => h.keyword === '证券名称');
      const amountHeader = headerBlocks.find(h => h.keyword === '发生金额');
      
      // 找到表头的平均y坐标
      const headerYValues = headerBlocks.map(h => h.y0);
      const avgHeaderY = headerYValues.reduce((a, b) => a + b, 0) / headerYValues.length;
      console.log(`表头平均 y: ${Math.round(avgHeaderY)}`);
      
      // 确定四个列的分界点
      const xCoordinates: number[] = [];
      if (dateHeader) xCoordinates.push(dateHeader.x0);
      if (codeHeader) xCoordinates.push(codeHeader.x0);
      if (nameHeader) xCoordinates.push(nameHeader.x0);
      if (amountHeader) xCoordinates.push(amountHeader.x0);
      
      // 排序x坐标
      xCoordinates.sort((a, b) => a - b);
      console.log('列分界点 x:', xCoordinates.map(x => Math.round(x)));
      
      // 2. 按y坐标聚类分出行（排除表头行）
      const rows = this.groupIntoRows(blocks);
      console.log(`找到 ${rows.length} 行数据`);
      
      // 3. 对每一行，根据x坐标确定列归属
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const rowY = row.reduce((a, b) => a + b.y0, 0) / row.length;
        
        // 跳过表头行（y接近表头）
        if (Math.abs(rowY - avgHeaderY) < 30) {
          console.log(`跳过第 ${rowIndex} 行，可能是表头`);
          continue;
        }
        
        // 对这一行的每个块，根据x分配到对应列
        let dateText: string | null = null;
        let codeText: string | null = null;
        let nameText: string | null = null;
        let amountText: string | null = null;
        
        for (const block of row) {
          const colIndex = this.getColumnIndex(block.x0, xCoordinates);
          
          if (colIndex === 0 && !dateText) {
            dateText = block.text;
          } else if (colIndex === 1 && !codeText) {
            codeText = block.text;
          } else if (colIndex === 2 && !nameText) {
            nameText = block.text;
          } else if (colIndex === 3 && !amountText) {
            amountText = block.text;
          } else if (colIndex >= 0 && colIndex < 4) {
            // 如果是同一列有多个块，拼接到一起
            if (colIndex === 0) dateText = (dateText || '') + block.text;
            if (colIndex === 1) codeText = (codeText || '') + block.text;
            if (colIndex === 2) nameText = (nameText || '') + block.text;
            if (colIndex === 3) amountText = (amountText || '') + block.text;
          }
        }
        
        console.log(`行 ${rowIndex}：[日期=${dateText}, 代码=${codeText}, 名称=${nameText}, 金额=${amountText}]`);
        
        // 解析数据
        if (dateText) {
          const parsedDate = this.tryParseDate(dateText);
          if (parsedDate) dateValues.push(parsedDate);
        }
        
        if (codeText) {
          const parsedCode = this.tryParseStockCode(codeText);
          if (parsedCode) stockCodeValues.push(parsedCode);
        }
        
        if (nameText) {
          const parsedName = this.tryParseStockName(nameText);
          if (parsedName) stockNameValues.push(parsedName);
        }
        
        if (amountText) {
          const parsedAmount = this.tryParseAmount(amountText);
          if (parsedAmount !== null) amountValues.push(parsedAmount);
        }
      }
    } 
    // 如果没找到表头，回退到坐标+文本混合模式
    else {
      console.log('未找到明确表头，使用坐标聚类模式');
      
      const rows = this.groupIntoRows(blocks);
      
      for (const row of rows) {
        if (row.length < 4) continue;
        
        const sortedRow = [...row].sort((a, b) => a.x0 - b.x0);
        
        const dateText = sortedRow[0].text;
        const codeText = sortedRow[1].text;
        const nameText = sortedRow[2].text;
        const amountText = sortedRow[3].text;
        
        const date = this.tryParseDate(dateText);
        const code = this.tryParseStockCode(codeText);
        const name = this.tryParseStockName(nameText);
        const amount = this.tryParseAmount(amountText);
        
        if (date) dateValues.push(date);
        if (code) stockCodeValues.push(code);
        if (name) stockNameValues.push(name);
        if (amount !== null) amountValues.push(amount);
      }
    }
    
    console.log('提取结果：');
    console.log('日期:', dateValues);
    console.log('股票代码:', stockCodeValues);
    console.log('股票名称:', stockNameValues);
    console.log('发生金额:', amountValues);
    
    return this.calculateResult(dateValues, stockCodeValues, stockNameValues, amountValues);
  }

  /**
   * 根据x坐标和列分界点确定属于哪一列
   */
  private getColumnIndex(x: number, boundaries: number[]): number {
    if (boundaries.length === 0) return -1;
    
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (x >= boundaries[i] && x < boundaries[i + 1]) {
        return i;
      }
    }
    
    return boundaries.length - 1;
  }

  /**
   * 按y坐标聚类分出行
   */
  private groupIntoRows(blocks: Array<{ x0: number; y0: number }>): Array<Array<{ x0: number; y0: number; text: string }>> {
    const yThreshold = 15;
    const sortedBlocks = [...blocks].sort((a, b) => a.y0 - b.y0);
    
    const rows: Array<Array<{ x0: number; y0: number; text: string }>> = [];
    let currentRow: Array<{ x0: number; y0: number; text: string }> = [];
    let lastY = -Infinity;
    
    for (const block of sortedBlocks) {
      if (lastY === -Infinity || block.y0 - lastY < yThreshold) {
        currentRow.push(block as any);
      } else {
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
        }
        currentRow = [block as any];
      }
      lastY = block.y0;
    }
    
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
    
    return rows;
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
        structuredData: result.structuredData
      }
    };
  }

  /**
   * 计算最终结果：只做识别，不做复杂计算
   */
  private calculateResult(
    dateValues: string[], 
    stockCodeValues: string[], 
    stockNameValues: string[], 
    amountValues: number[]
  ): { structuredData: any; } {
    
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
          holdDays = calculateHoldDays(minDate.toString(), maxDate.toString());
        }
      }
    }
    
    const stockCode = stockCodeValues.length > 0 ? stockCodeValues[0] : null;
    const stockName = stockNameValues.length > 0 ? stockNameValues[0] : null;
    
    return {
      structuredData: { 
        openDate, 
        stockCode, 
        stockName, 
        holdDays,
        amountValues // 直接返回原始金额数组，前端来计算
      }
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
}
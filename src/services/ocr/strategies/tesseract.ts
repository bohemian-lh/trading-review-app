import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

const HEADER_KEYWORDS = {
  DATE: ['成交日期', '日期', '发生日期'],
  STOCK_CODE: ['证券代码', '代码', '股票代码'],
  STOCK_NAME: ['证券名称', '名称', '股票名称'],
  AMOUNT: ['发生金额', '金额'],
};

interface WordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParsedTableRow {
  date: string | null;
  stockCode: string | null;
  stockName: string | null;
  amount: number | null;
}

interface ColumnPosition {
  date: number | null;
  stockCode: number | null;
  stockName: number | null;
  amount: number | null;
}

export class TesseractOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.TESSERACT;

  async parseImage(imageFile: File): Promise<OcrResult> {
    try {
      const Tesseract = await this.loadTesseract();
      if (!Tesseract) {
        return { success: false, error: 'Tesseract.js 未安装，请先安装依赖' };
      }

      console.log('=== 开始识别图像 ===');

      const preprocessedBlob = await this.preprocessImage(imageFile);

      const result = await Tesseract.recognize(preprocessedBlob, 'chi_sim+eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`识别进度: ${(m.progress * 100).toFixed(0)}%`);
          }
        }
      });

      console.log('识别完成，开始解析...');

      const words = this.extractWordBoxes(result);
      console.log(`提取到 ${words.length} 个文字块`);

      if (words.length === 0) {
        return { success: false, error: '未识别到任何文字' };
      }

      const { structuredData, calculation } = this.parseTable(words);

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
      return { success: false, error: error instanceof Error ? error.message : 'OCR 识别失败' };
    }
  }

  private async loadTesseract() {
    try {
      return await import('tesseract.js');
    } catch (e) {
      console.warn('Tesseract.js not installed');
      return null;
    }
  }

  private preprocessImage(imageFile: File): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const contrast = ((gray - 128) * 1.5) + 128;
          const clamped = Math.max(0, Math.min(255, contrast));
          const binary = clamped > 140 ? 255 : 0;

          data[i] = binary;
          data[i + 1] = binary;
          data[i + 2] = binary;
        }

        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          resolve(blob || imageFile);
        }, 'image/png');
      };
      img.src = URL.createObjectURL(imageFile);
    });
  }

  private extractWordBoxes(result: any): WordBox[] {
    const words: WordBox[] = [];

    if (result.data.words && result.data.words.length > 0) {
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

    return words.filter(w => w.text.length > 0);
  }

  private parseTable(words: WordBox[]): {
    structuredData: any;
    calculation?: ProfitCalculation;
  } {
    const rows = this.groupWordsByRow(words);
    console.log(`识别到 ${rows.length} 行`);

    if (rows.length < 2) {
      return { structuredData: this.getEmptyResult() };
    }

    const headerRowIndex = this.findHeaderRow(rows);
    if (headerRowIndex === -1) {
      console.warn('未找到表头');
      return { structuredData: this.getEmptyResult() };
    }

    console.log(`找到表头在第 ${headerRowIndex + 1} 行`);

    const headerRow = rows[headerRowIndex];
    const colPositions = this.getColumnPositions(headerRow);
    console.log('列位置:', colPositions);

    if (colPositions.date === null || colPositions.amount === null) {
      console.warn('未能定位关键列（成交日期/发生金额）');
      return { structuredData: this.getEmptyResult() };
    }

    const dataRows = this.extractDataRows(rows, headerRowIndex, colPositions);
    console.log(`提取到 ${dataRows.length} 行数据`);

    if (dataRows.length === 0) {
      return { structuredData: this.getEmptyResult() };
    }

    return this.calculateByRules(dataRows);
  }

  private groupWordsByRow(words: WordBox[]): WordBox[][] {
    if (words.length === 0) return [];

    const sortedByY = [...words].sort((a, b) => a.y - b.y);
    const rows: WordBox[][] = [];
    let currentRow: WordBox[] = [sortedByY[0]];

    const avgHeight = words.reduce((sum, w) => sum + w.height, 0) / words.length;
    const threshold = avgHeight * 0.6;

    for (let i = 1; i < sortedByY.length; i++) {
      const word = sortedByY[i];
      const lastWord = currentRow[currentRow.length - 1];

      if (word.y - lastWord.y < threshold) {
        currentRow.push(word);
      } else {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
        currentRow = [word];
      }
    }

    currentRow.sort((a, b) => a.x - b.x);
    rows.push(currentRow);

    return rows;
  }

  private findHeaderRow(rows: WordBox[][]): number {
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const text = rows[i].map(w => w.text).join(' ');
      let matchCount = 0;

      for (const keywords of Object.values(HEADER_KEYWORDS)) {
        if (keywords.some(k => text.includes(k))) {
          matchCount++;
        }
      }

      if (matchCount >= 2) return i;
    }
    return -1;
  }

  private getColumnPositions(headerRow: WordBox[]): ColumnPosition {
    const positions: ColumnPosition = {
      date: null,
      stockCode: null,
      stockName: null,
      amount: null,
    };

    for (const word of headerRow) {
      const text = word.text;

      if (positions.date === null && HEADER_KEYWORDS.DATE.some(k => text.includes(k))) {
        positions.date = word.x + word.width / 2;
      } else if (positions.stockCode === null && HEADER_KEYWORDS.STOCK_CODE.some(k => text.includes(k))) {
        positions.stockCode = word.x + word.width / 2;
      } else if (positions.stockName === null && HEADER_KEYWORDS.STOCK_NAME.some(k => text.includes(k))) {
        positions.stockName = word.x + word.width / 2;
      } else if (positions.amount === null && HEADER_KEYWORDS.AMOUNT.some(k => text.includes(k))) {
        positions.amount = word.x + word.width / 2;
      }
    }

    return positions;
  }

  private extractDataRows(
    rows: WordBox[][],
    headerRowIndex: number,
    colPositions: ColumnPosition
  ): ParsedTableRow[] {
    const dataRows: ParsedTableRow[] = [];
    const colGap = this.estimateColumnGap(colPositions);

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const parsed: ParsedTableRow = {
        date: null,
        stockCode: null,
        stockName: null,
        amount: null,
      };

      for (const word of row) {
        const wordCenter = word.x + word.width / 2;

        if (colPositions.date !== null && Math.abs(wordCenter - colPositions.date) < colGap) {
          const d = this.tryParseDate(word.text);
          if (d) parsed.date = d;
        }

        if (colPositions.stockCode !== null && Math.abs(wordCenter - colPositions.stockCode) < colGap) {
          const c = this.tryParseStockCode(word.text);
          if (c) parsed.stockCode = c;
        }

        if (colPositions.stockName !== null && Math.abs(wordCenter - colPositions.stockName) < colGap) {
          const n = this.tryParseStockName(word.text);
          if (n) parsed.stockName = n;
        }

        if (colPositions.amount !== null && Math.abs(wordCenter - colPositions.amount) < colGap) {
          const a = this.tryParseAmount(word.text);
          if (a !== null) parsed.amount = a;
        }
      }

      if (parsed.date || parsed.amount !== null) {
        dataRows.push(parsed);
        console.log('数据行:', parsed);
      }
    }

    return dataRows;
  }

  private estimateColumnGap(colPositions: ColumnPosition): number {
    const positions = [
      colPositions.date,
      colPositions.stockCode,
      colPositions.stockName,
      colPositions.amount,
    ].filter((p): p is number => p !== null);

    if (positions.length < 2) return 100;

    const sorted = positions.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i] - sorted[i - 1]);
    }

    return Math.min(...gaps) * 0.45;
  }

  private tryParseDate(text: string): string | null {
    const match8 = text.match(/(\d{8})/);
    if (match8) return match8[1];

    const matchSep = text.match(/(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (matchSep) {
      return `${matchSep[1]}${matchSep[2].padStart(2, '0')}${matchSep[3].padStart(2, '0')}`;
    }

    return null;
  }

  private tryParseStockCode(text: string): string | null {
    const match = text.match(/(\d{6})/);
    return match ? match[1] : null;
  }

  private tryParseStockName(text: string): string | null {
    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
    if (chineseChars) {
      const combined = chineseChars.join('');
      if (combined.length >= 2) return combined;
    }
    return null;
  }

  private tryParseAmount(text: string): number | null {
    const cleaned = text.replace(/[^\d\.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private calculateByRules(dataRows: ParsedTableRow[]): {
    structuredData: any;
    calculation?: ProfitCalculation;
  } {
    const validDates = dataRows
      .map(r => r.date)
      .filter((d): d is string => d !== null && d.length === 8);

    let openDate: string | null = null;
    let holdDays: number | null = null;

    if (validDates.length > 0) {
      const dateNums = validDates.map(d => parseInt(d, 10));
      const minDate = Math.min(...dateNums);
      const maxDate = Math.max(...dateNums);

      openDate = minDate.toString();

      const minYearMonth = Math.floor(minDate / 100);
      const maxYearMonth = Math.floor(maxDate / 100);
      const minDay = minDate % 100;
      const maxDay = maxDate % 100;

      if (minYearMonth === maxYearMonth) {
        holdDays = maxDay - minDay + 1;
      } else {
        holdDays = maxDay + 31 - minDay;
      }
    }

    const firstValidRow = dataRows.find(r => r.stockCode || r.stockName);
    const stockCode = firstValidRow?.stockCode || null;
    const stockName = firstValidRow?.stockName || null;

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
        profitPercent = Math.round(profitPercent * 10000) / 10000;
      }

      calculation = {
        allAmounts: validAmounts,
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

  private getEmptyResult(): any {
    return {
      openDate: null,
      stockCode: null,
      stockName: null,
      profitPercent: null,
      holdDays: null
    };
  }
}

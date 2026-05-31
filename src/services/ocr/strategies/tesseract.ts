import { OcrStrategy, OcrStrategyHandler, OcrResult } from '../../../types';

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

      // 识别图像
      const result = await Tesseract.recognize(
        imageFile,
        'chi_sim+eng',
        {
          logger: (m: any) => console.log(m)
        }
      );

      const rawText = result.data.text;

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

  private parseTableData(_rawText: string): any {
    // TODO: 实现真正的表格解析逻辑
    // 根据之前讨论的规则：
    // 1. 解析表头确定列位置
    // 2. 提取数据行
    // 3. 计算开单时间（最小值）
    // 4. 计算盈亏（第四列总和 / 第四列负数绝对值总和）
    // 5. 计算持仓天数
    
    // 这里先返回一个模拟结构，后续完善
    return {
      openDate: '20260525',
      stockCode: '603999',
      stockName: '读者传媒',
      profitPercent: null,
      holdDays: null,
    };
  }
}

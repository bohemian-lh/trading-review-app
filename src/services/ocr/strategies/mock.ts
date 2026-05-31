import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

export class MockOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.MOCK;

  async parseImage(_imageFile: File): Promise<OcrResult> {
    // 模拟识别延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟金额数据 - 使用更明显的模拟值
    const allAmounts = [999999.99, -888888.88, 777777.77];
    const negativeAmounts = allAmounts.filter(a => a < 0);
    const totalSum = allAmounts.reduce((a, b) => a + b, 0);
    const negativeAbsSum = Math.abs(negativeAmounts.reduce((a, b) => a + b, 0));
    const profitPercent = negativeAbsSum !== 0 ? Math.round((totalSum / negativeAbsSum) * 100) / 100 : null;
    
    const calculation: ProfitCalculation = {
      allAmounts,
      totalSum,
      negativeAmounts,
      negativeAbsSum,
      profitPercent
    };

    // 返回模拟数据 - 加上非常明显的警告标记
    return {
      success: true,
      data: {
        rawText: '[⚠️ MOCK MODE ⚠️] 这是模拟数据，不是真实识别结果！！！',
        structuredData: {
          openDate: '00000000', // 明显的假日期
          stockCode: '000000', // 明显的假代码
          stockName: '【⚠️ 模拟数据 ⚠️】请切换到 Tesseract',
          profitPercent,
          holdDays: 999, // 明显的假天数
        },
        calculation
      },
    };
  }
}

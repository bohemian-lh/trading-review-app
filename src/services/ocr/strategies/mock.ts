import { OcrStrategy, OcrStrategyHandler, OcrResult, ProfitCalculation } from '../../../types';

export class MockOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.MOCK;

  async parseImage(_imageFile: File): Promise<OcrResult> {
    // 模拟识别延迟
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 模拟金额数据
    const allAmounts = [18639.09, -9786.83, 9850.23];
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

    // 返回模拟数据 - 加上明显的警告
    return {
      success: true,
      data: {
        rawText: '[MOCK MODE] 这是模拟数据，不是真实识别结果！',
        structuredData: {
          openDate: '20260518',
          stockCode: '603999',
          stockName: '[模拟数据] 读者传媒',
          profitPercent,
          holdDays: 8,
        },
        calculation
      },
    };
  }
}

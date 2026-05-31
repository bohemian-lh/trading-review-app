import { OcrStrategy, OcrStrategyHandler, OcrResult } from '../../../types';

export class MockOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.MOCK;

  async parseImage(_imageFile: File): Promise<OcrResult> {
    // 模拟识别延迟
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 返回模拟数据
    return {
      success: true,
      data: {
        rawText: '模拟识别的原始文本',
        structuredData: {
          openDate: '20260525',
          stockCode: '603999',
          stockName: '读者传媒',
          profitPercent: 18702.49,
          holdDays: 2,
        },
      },
    };
  }
}

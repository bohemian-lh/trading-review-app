export enum OcrStrategy {
  TESSERACT = 'tesseract',
  CLOUDFLARE_AI = 'cloudflare-ai',
  MOCK = 'mock',
}

export interface OcrConfig {
  strategy: OcrStrategy;
  tesseract?: {
    language: string;
  };
  cloudflareAi?: {
    ocrModel: string;
    extractModel: string;
  };
}

// 计算过程数据
export interface ProfitCalculation {
  allAmounts: number[];  // 所有发生金额
  totalSum: number;      // 所有金额总和
  negativeAmounts: number[];  // 负数金额
  negativeAbsSum: number;     // 负数绝对值总和
  profitPercent: number | null;
}

// 扩展的 OCR 结果
export interface OcrResult {
  success: boolean;
  data?: {
    rawText: string;
    structuredData?: any;
    calculation?: ProfitCalculation;
  };
  error?: string;
}

export interface OcrStrategyHandler {
  name: OcrStrategy;
  parseImage(imageFile: File): Promise<OcrResult>;
}

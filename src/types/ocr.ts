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

export interface OcrResult {
  success: boolean;
  data?: {
    rawText: string;
    structuredData?: any;
  };
  error?: string;
}

export interface OcrStrategyHandler {
  name: OcrStrategy;
  parseImage(imageFile: File): Promise<OcrResult>;
}

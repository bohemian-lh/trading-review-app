export * from './trading';
export * from './analysis';
export * from './storage';
export * from './ocr';
export * from './cycleStats';
export * from './fieldConfig';
export * from './journal';
export * from './mindset';
export * from './decision';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  row?: number;
}

export interface AppError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

// OCR 图像识别相关类型
export interface ParsedTradeData {
  openDate: string;
  stockCode: string;
  stockName: string;
  profitPercent: number | null;
  holdDays: number | null;
}

export interface ParseImageResponse {
  success: boolean;
  data?: ParsedTradeData;
  error?: string;
}

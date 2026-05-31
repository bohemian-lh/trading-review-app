import { OcrConfig, OcrStrategy } from '../types';

const STORAGE_KEY = 'ocr-strategy';

export const DEFAULT_OCR_CONFIG: OcrConfig = {
  strategy: OcrStrategy.TESSERACT, // 默认使用 Tesseract
  tesseract: {
    language: 'chi_sim+eng', // 中文简体 + 英文
  },
  cloudflareAi: {
    ocrModel: '@cf/unum/uform-gen2-qwen-500m',
    extractModel: '@cf/qwen/qwen2.5-7b-instruct-awq',
  },
};

// 获取策略，优先从 localStorage 读取，然后是环境变量，最后是默认值
export function getOcrConfig(): OcrConfig {
  let strategy = DEFAULT_OCR_CONFIG.strategy;
  
  // 从 localStorage 读取
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Object.values(OcrStrategy).includes(stored as OcrStrategy)) {
      strategy = stored as OcrStrategy;
    }
  }
  
  // 从环境变量读取（优先级更高）
  if (import.meta.env.VITE_OCR_STRATEGY) {
    strategy = import.meta.env.VITE_OCR_STRATEGY as OcrStrategy;
  }
  
  return {
    ...DEFAULT_OCR_CONFIG,
    strategy,
  };
}

// 保存策略到 localStorage
export function saveOcrStrategy(strategy: OcrStrategy) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, strategy);
  }
}

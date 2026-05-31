import { OcrConfig, OcrStrategy } from '../types';

export const DEFAULT_OCR_CONFIG: OcrConfig = {
  strategy: OcrStrategy.MOCK, // 默认使用 mock，方便开发
  tesseract: {
    language: 'chi_sim+eng', // 中文简体 + 英文
  },
  cloudflareAi: {
    ocrModel: '@cf/unum/uform-gen2-qwen-500m',
    extractModel: '@cf/qwen/qwen2.5-7b-instruct-awq',
  },
};

// 从环境变量获取配置
export function getOcrConfig(): OcrConfig {
  const strategy = (import.meta.env.VITE_OCR_STRATEGY as OcrStrategy) || DEFAULT_OCR_CONFIG.strategy;
  
  return {
    ...DEFAULT_OCR_CONFIG,
    strategy,
  };
}

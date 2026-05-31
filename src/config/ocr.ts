import { OcrConfig, OcrStrategy } from '../types';

const STORAGE_KEY = 'ocr-strategy';
const STORAGE_VERSION_KEY = 'ocr-strategy-version';
const CURRENT_VERSION = 2; // 版本号，用于强制更新策略

export const DEFAULT_OCR_CONFIG: OcrConfig = {
  strategy: OcrStrategy.CLOUDFLARE_AI,
  tesseract: {
    language: 'chi_sim+eng', // 中文简体 + 英文
  },
  cloudflareAi: {
    ocrModel: '@cf/meta/llama-3.2-11b-vision-instruct',
    extractModel: '@cf/meta/llama-3.2-11b-vision-instruct',
  },
};

// 获取策略，优先从 localStorage 读取，然后是环境变量，最后是默认值
export function getOcrConfig(): OcrConfig {
  let strategy = DEFAULT_OCR_CONFIG.strategy;
  
  // 从 localStorage 读取
  if (typeof window !== 'undefined') {
    // 检查版本号
    const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    const needsReset = storedVersion !== CURRENT_VERSION.toString();
    
    if (needsReset) {
      // 版本不匹配，重置为默认策略
      localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION.toString());
      localStorage.setItem(STORAGE_KEY, DEFAULT_OCR_CONFIG.strategy);
      console.log('OCR 策略已重置为默认值（Tesseract）');
    } else {
      // 版本匹配，读取保存的策略
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Object.values(OcrStrategy).includes(stored as OcrStrategy)) {
        strategy = stored as OcrStrategy;
      }
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
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION.toString());
  }
}

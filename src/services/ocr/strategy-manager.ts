import { OcrStrategy, OcrConfig, OcrResult, OcrStrategyHandler } from '../../types';
import { getOcrConfig, saveOcrStrategy } from '../../config/ocr';
import { MockOcrStrategy } from './strategies/mock';
import { TesseractOcrStrategy } from './strategies/tesseract';
import { CloudflareAiOcrStrategy } from './strategies/cloudflare-ai';

export class OcrStrategyManager {
  private static instance: OcrStrategyManager;
  private strategies: Map<OcrStrategy, OcrStrategyHandler>;
  private currentConfig: OcrConfig;

  private constructor(config?: OcrConfig) {
    this.currentConfig = config || getOcrConfig();
    this.strategies = new Map();

    // 注册所有策略
    this.registerStrategy(new MockOcrStrategy());
    this.registerStrategy(new TesseractOcrStrategy());
    this.registerStrategy(new CloudflareAiOcrStrategy());
  }

  static getInstance(config?: OcrConfig): OcrStrategyManager {
    if (!OcrStrategyManager.instance) {
      OcrStrategyManager.instance = new OcrStrategyManager(config);
    }
    return OcrStrategyManager.instance;
  }

  registerStrategy(strategy: OcrStrategyHandler): void {
    this.strategies.set(strategy.name, strategy);
  }

  setConfig(config: Partial<OcrConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
    // 如果修改了策略，保存到 localStorage
    if (config.strategy) {
      saveOcrStrategy(config.strategy);
    }
  }

  getConfig(): OcrConfig {
    return this.currentConfig;
  }

  getCurrentStrategy(): OcrStrategyHandler {
    const strategyName = this.currentConfig.strategy;
    const strategy = this.strategies.get(strategyName);
    
    if (!strategy) {
      console.warn(`Strategy ${strategyName} not found, falling back to Tesseract`);
      return this.strategies.get(OcrStrategy.TESSERACT)!;
    }
    
    return strategy;
  }

  async parseImage(imageFile: File): Promise<OcrResult> {
    const strategy = this.getCurrentStrategy();
    return strategy.parseImage(imageFile);
  }

  getAvailableStrategies(): OcrStrategy[] {
    return Array.from(this.strategies.keys());
  }
}

// 导出单例
export const ocrManager = OcrStrategyManager.getInstance();

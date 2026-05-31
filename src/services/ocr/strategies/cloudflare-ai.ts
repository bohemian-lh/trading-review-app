import { OcrStrategy, OcrStrategyHandler, OcrResult } from '../../../types';

export class CloudflareAiOcrStrategy implements OcrStrategyHandler {
  readonly name = OcrStrategy.CLOUDFLARE_AI;

  async parseImage(_imageFile: File): Promise<OcrResult> {
    // 预留 Cloudflare AI 实现接口
    // 注意：Cloudflare AI 只能在 Cloudflare Workers 后端运行
    // 此策略主要用于后端，前端需要通过 API 调用
    return {
      success: false,
      error: 'Cloudflare AI 策略需要通过后端 API 调用'
    };
  }
}

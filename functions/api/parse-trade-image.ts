// OCR 策略枚举
enum OcrStrategy {
  TESSERACT = 'tesseract',
  CLOUDFLARE_AI = 'cloudflare-ai',
  MOCK = 'mock',
}

// OCR 结果类型
interface OcrResult {
  success: boolean;
  data?: {
    rawText: string;
    structuredData?: any;
  };
  error?: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const formData = await context.request.formData();
    const imageFile = formData.get('image') as File;
    const strategy = (formData.get('strategy') as OcrStrategy) || OcrStrategy.MOCK;

    if (!imageFile) {
      return new Response(JSON.stringify({
        success: false,
        error: '未上传图片'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    let result;

    switch (strategy) {
      case OcrStrategy.CLOUDFLARE_AI:
        result = await handleCloudflareAi(imageFile, context);
        break;
      case OcrStrategy.TESSERACT:
        // Worker 中不建议运行 Tesseract.js，让前端处理
        result = {
          success: false,
          error: 'Tesseract.js 请在前端使用'
        };
        break;
      case OcrStrategy.MOCK:
      default:
        result = await handleMock();
        break;
    }

    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: result.error
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: result.data?.structuredData
    }), {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('解析图片失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '解析图片失败，请重试'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

// Cloudflare AI 处理
async function handleCloudflareAi(imageFile: File, context: any): Promise<OcrResult> {
  try {
    // 检查是否有 AI 绑定
    if (!context.env?.AI) {
      return {
        success: false,
        error: 'Cloudflare AI 未配置，请先配置 AI 绑定'
      };
    }

    // TODO: 实现 Cloudflare AI 识别
    // 目前先用 mock
    return await handleMock();

  } catch (error) {
    console.error('Cloudflare AI 识别失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudflare AI 识别失败'
    };
  }
}

// Mock 处理
async function handleMock(): Promise<OcrResult> {
  // 模拟识别延迟
  await new Promise(resolve => setTimeout(resolve, 1000));

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

interface Env {
  AI: any;
}

enum OcrStrategy {
  TESSERACT = 'tesseract',
  CLOUDFLARE_AI = 'cloudflare-ai',
  MOCK = 'mock',
}

interface OcrResult {
  success: boolean;
  data?: {
    rawText: string;
    structuredData?: any;
  };
  error?: string;
}

const EXTRACT_PROMPT = `你是一个专业的表格数据提取助手。用户会给你一张券商交易截图，你需要从中提取交易数据。

截图中的表格有4列，表头分别是：
- 第1列：成交日期
- 第2列：证券代码
- 第3列：证券名称
- 第4列：发生金额

请严格按照以下规则提取数据：

1. 开单时间：提取第1列「成交日期」中的最小值（格式为8位数字，如20260303）
2. 股票代码：提取第2列「证券代码」的第一行数据（6位数字）
3. 股票名称：提取第3列「证券名称」的第一行数据
4. 盈亏%：第4列「发生金额」所有数据相加的总和 ÷ 第4列「发生金额」中所有负数相加的绝对值
5. 持仓天数：
   - 如果第1列中最大值和最小值的前6位（年月）相同：最大值的后两位 - 最小值的后两位 + 1
   - 如果前6位不同（跨月）：最大值的后两位 + 31 - 最小值的后两位

请只返回JSON，不要返回任何其他文字。JSON格式如下：
{
  "openDate": "20260303",
  "stockCode": "603999",
  "stockName": "读者传媒",
  "profitPercent": 0.0523,
  "holdDays": 3,
  "calculation": {
    "allAmounts": [100, -200, 300],
    "totalSum": 200,
    "negativeAmounts": [-200],
    "negativeAbsSum": 200,
    "profitPercent": 1.0
  }
}

注意：
- profitPercent 是小数形式，如 0.0523 表示 5.23%
- 日期必须是8位纯数字
- 股票代码必须是6位纯数字
- 金额必须保留原始正负号`;

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
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

async function handleCloudflareAi(imageFile: File, context: { env: Env }): Promise<OcrResult> {
  try {
    if (!context.env?.AI) {
      return {
        success: false,
        error: 'Cloudflare AI 未配置，请在 Dashboard 中添加 AI 绑定'
      };
    }

    const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

    try {
      await context.env.AI.run(MODEL, {
        messages: [{ role: 'user', content: 'agree' }],
        max_tokens: 1,
      });
    } catch (e: any) {
      if (!e?.message?.includes('agree')) {
        console.log('License agreement accepted or already accepted');
      }
    }

    const imageBuffer = await imageFile.arrayBuffer();

    const aiResponse = await context.env.AI.run(
      MODEL,
      {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${imageFile.type};base64,${arrayBufferToBase64(imageBuffer)}` } },
              { type: 'text', text: EXTRACT_PROMPT }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }
    );

    console.log('AI raw response:', JSON.stringify(aiResponse));

    let responseText = '';
    if (typeof aiResponse === 'object' && aiResponse.response) {
      responseText = aiResponse.response;
    } else if (typeof aiResponse === 'string') {
      responseText = aiResponse;
    } else if (aiResponse.result?.response) {
      responseText = aiResponse.result.response;
    }

    if (!responseText) {
      return {
        success: false,
        error: 'AI 未返回有效响应'
      };
    }

    const structuredData = parseAiResponse(responseText);

    if (!structuredData) {
      return {
        success: false,
        error: 'AI 返回的数据格式无法解析，原始响应：' + responseText.substring(0, 200)
      };
    }

    return {
      success: true,
      data: {
        rawText: responseText,
        structuredData
      }
    };
  } catch (error) {
    console.error('Cloudflare AI 识别失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudflare AI 识别失败'
    };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function parseAiResponse(responseText: string): any | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const structuredData: any = {
      openDate: parsed.openDate || null,
      stockCode: parsed.stockCode || null,
      stockName: parsed.stockName || null,
      profitPercent: null,
      holdDays: null,
    };

    if (parsed.profitPercent !== undefined && parsed.profitPercent !== null) {
      structuredData.profitPercent = typeof parsed.profitPercent === 'number'
        ? parsed.profitPercent
        : parseFloat(String(parsed.profitPercent));
    }

    if (parsed.holdDays !== undefined && parsed.holdDays !== null) {
      structuredData.holdDays = typeof parsed.holdDays === 'number'
        ? parsed.holdDays
        : parseInt(String(parsed.holdDays), 10);
    }

    if (parsed.calculation) {
      structuredData.calculation = parsed.calculation;
    }

    return structuredData;
  } catch (e) {
    console.error('解析 AI 响应失败:', e);
    return null;
  }
}

async function handleMock(): Promise<OcrResult> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    success: true,
    data: {
      rawText: '模拟识别的原始文本',
      structuredData: {
        openDate: '20260525',
        stockCode: '603999',
        stockName: '读者传媒',
        profitPercent: 0.187,
        holdDays: 2,
        calculation: {
          allAmounts: [999999.99, -888888.88, 777777.77],
          totalSum: 888888.88,
          negativeAmounts: [-888888.88],
          negativeAbsSum: 888888.88,
          profitPercent: 1.0
        }
      },
    },
  };
}

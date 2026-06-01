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

const EXTRACT_PROMPT = `你是一个专业的券商交易截图提取助手。用户会给你一张券商交易截图，你需要严格按照固定的4列格式提取数据。

【重要！截图格式说明】
截图中的表格有固定的4列，从左到右依次是：
1. 第1列：成交日期（8位数字日期，如 20260303）
2. 第2列：证券代码（6位数字，如 603999）
3. 第3列：证券名称（中文股票名称，如 读者传媒）
4. 第4列：发生金额（正数或负数，如 9774.28）

【任务要求】
你只需要从截图中识别和提取数据，不要做任何计算！
请从截图中提取以下信息：
1. openDate（开单时间）：提取第1列「成交日期」中的最小值
2. stockCode（股票代码）：提取第2列「证券代码」的第一行数据
3. stockName（股票名称）：提取第3列「证券名称」的第一行数据
4. holdDays（持仓天数）：根据日期计算（简单计算）
5. amountValues（发生金额数组）：提取第4列「发生金额」的所有数据，按顺序放入数组

【示例】
假设你从表格中识别到以下原始表格数据：
成交日期 | 证券代码 | 证券名称 | 发生金额
20260303 | 000560 | 我爱我家 | 9774.28
20260302 | 000560 | 我爱我家 | -6460.55
20260302 | 000560 | 我爱我家 | -3310.28

提取结果应该是：
{
  "openDate": "20260302",
  "stockCode": "000560",
  "stockName": "我爱我家",
  "holdDays": 2,
  "amountValues": [9774.28, -6460.55, -3310.28]
}

【返回格式要求】
请严格只返回最终的JSON，不要返回任何其他文字！

JSON格式如下：
{
  "openDate": "20260303",
  "stockCode": "603999",
  "stockName": "读者传媒",
  "holdDays": 3,
  "amountValues": [9774.28, -6460.55, -3310.28, -9870.84]
}

【注意事项】
- openDate 必须是8位纯数字日期
- stockCode 必须是6位纯数字
- stockName 是中文股票名称
- holdDays 简单计算：日期相减+1（如果跨月可以用简单估算）
- amountValues 是提取到的所有发生金额的原始数组，顺序和表格一致
- 只需要JSON，不要任何其他文字！`;

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

    // 安全地获取响应文本
    let responseText = '';
    if (typeof aiResponse === 'string') {
      responseText = aiResponse;
    } else if (typeof aiResponse === 'object' && aiResponse !== null) {
      // 尝试多种可能的响应格式
      if (typeof aiResponse.response === 'string') {
        responseText = aiResponse.response;
      } else if (typeof aiResponse.result?.response === 'string') {
        responseText = aiResponse.result.response;
      } else if (Array.isArray(aiResponse) && aiResponse.length > 0 && typeof aiResponse[0] === 'string') {
        responseText = aiResponse[0];
      } else {
        // 如果找不到，直接字符串化整个对象用于调试
        responseText = JSON.stringify(aiResponse);
      }
    }

    console.log('Final responseText:', responseText);

    if (!responseText || typeof responseText !== 'string') {
      return {
        success: false,
        error: 'AI 未返回有效响应，原始响应: ' + JSON.stringify(aiResponse)
      };
    }

    const structuredData = parseAiResponse(responseText);

    if (!structuredData) {
      // 安全地截断字符串
      const displayText = responseText && typeof responseText.substring === 'function' 
        ? responseText.substring(0, 200) 
        : JSON.stringify(responseText).substring(0, 200);
      
      return {
        success: false,
        error: 'AI 返回的数据格式无法解析，原始响应：' + displayText
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
      holdDays: null,
      amountValues: parsed.amountValues || []
    };

    if (parsed.holdDays !== undefined && parsed.holdDays !== null) {
      structuredData.holdDays = typeof parsed.holdDays === 'number'
        ? parsed.holdDays
        : parseInt(String(parsed.holdDays), 10);
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
        holdDays: 2,
        amountValues: [9774.28, -6460.55, -3310.28, -9870.84]
      },
    },
  };
}
export const onRequestPost: PagesFunction = async (context) => {
  try {
    const formData = await context.request.formData();
    const imageFile = formData.get('image') as File;

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

    // TODO: 这里集成真正的 OCR 服务
    // 为了演示，先返回模拟数据
    const mockData = await simulateOCR();

    return new Response(JSON.stringify({
      success: true,
      data: mockData
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

// 模拟 OCR 函数（后期替换为真实 OCR）
async function simulateOCR() {
  // 模拟识别延迟
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 返回模拟数据
  return {
    openDate: '20260525',
    stockCode: '603999',
    stockName: '读者传媒',
    profitPercent: 18702.49,
    holdDays: 2
  };
}

import { R2Bucket } from '@cloudflare/workers-types';

interface TradingRecord {
  id: string;
  openDate: string;
  stockName: string;
  stockCode: string;
  tradingType: string;
  isSystem: '是' | '否';
  hasMistake: '是' | '否' | '其他';
  profitPercent: number;
  holdDays: number;
  preMarket: '是' | '否';
}

interface AnalysisResult {
  systemProfitRatio: number | 'N/A';
  systemNoMistakeProfitRatio: number | 'N/A';
  systemWithMistakeProfitRatio: number | 'N/A';
  nonSystemProfitRatio: number | 'N/A';
  systemProfitAvgHoldDays: number | 'N/A';
  systemLossAvgHoldDays: number | 'N/A';
  nonSystemProfitAvgHoldDays: number | 'N/A';
  nonSystemLossAvgHoldDays: number | 'N/A';
}

interface MonthlyAnalysis extends AnalysisResult {
  month: string;
}

interface Env {
  R2_BUCKET: R2Bucket;
  API_TOKEN: string;
}

function calculateProfitRatio(records: TradingRecord[], isSystem: string, hasMistake?: string): number | 'N/A' {
  let filtered = records.filter(r => r.isSystem === isSystem);
  
  if (hasMistake !== undefined) {
    filtered = filtered.filter(r => r.hasMistake === hasMistake);
  }
  
  if (filtered.length === 0) return 'N/A';
  
  const profitable = filtered.filter(r => r.profitPercent > 0).length;
  return (profitable / filtered.length) * 100;
}

function calculateAverageHoldDays(records: TradingRecord[], isSystem: string, profitType: 'positive' | 'negative'): number | 'N/A' {
  let filtered = records.filter(r => r.isSystem === isSystem);
  
  if (profitType === 'positive') {
    filtered = filtered.filter(r => r.profitPercent > 0);
  } else {
    filtered = filtered.filter(r => r.profitPercent < 0);
  }
  
  if (filtered.length === 0) return 'N/A';
  
  const totalDays = filtered.reduce((sum, r) => sum + r.holdDays, 0);
  return totalDays / filtered.length;
}

function calculateAnalysis(records: TradingRecord[]): AnalysisResult {
  return {
    systemProfitRatio: calculateProfitRatio(records, '是'),
    systemNoMistakeProfitRatio: calculateProfitRatio(records, '是', '否'),
    systemWithMistakeProfitRatio: calculateProfitRatio(records, '是', '是'),
    nonSystemProfitRatio: calculateProfitRatio(records, '否'),
    systemProfitAvgHoldDays: calculateAverageHoldDays(records, '是', 'positive'),
    systemLossAvgHoldDays: calculateAverageHoldDays(records, '是', 'negative'),
    nonSystemProfitAvgHoldDays: calculateAverageHoldDays(records, '否', 'positive'),
    nonSystemLossAvgHoldDays: calculateAverageHoldDays(records, '否', 'negative'),
  };
}

function calculateMonthlyAnalysis(records: TradingRecord[]): MonthlyAnalysis[] {
  const monthlyMap = new Map<string, TradingRecord[]>();
  
  for (const record of records) {
    const month = record.openDate.slice(0, 6);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, []);
    }
    monthlyMap.get(month)!.push(record);
  }
  
  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  
  return sortedMonths.map(month => ({
    month,
    ...calculateAnalysis(monthlyMap.get(month)!),
  }));
}

function formatValue(value: number | 'N/A'): string {
  if (value === 'N/A') return 'N/A';
  return value.toFixed(2);
}

function generateTable2Content(analysis: AnalysisResult): string {
  const headers = ['指标', '数值'];
  const rows = [
    ['系统盈利胜率', formatValue(analysis.systemProfitRatio) + '%'],
    ['系统无失误盈利胜率', formatValue(analysis.systemNoMistakeProfitRatio) + '%'],
    ['系统有失误盈利胜率', formatValue(analysis.systemWithMistakeProfitRatio) + '%'],
    ['非系统盈利胜率', formatValue(analysis.nonSystemProfitRatio) + '%'],
    ['系统盈利平均持仓天数', formatValue(analysis.systemProfitAvgHoldDays)],
    ['系统亏损平均持仓天数', formatValue(analysis.systemLossAvgHoldDays)],
    ['非系统盈利平均持仓天数', formatValue(analysis.nonSystemProfitAvgHoldDays)],
    ['非系统亏损平均持仓天数', formatValue(analysis.nonSystemLossAvgHoldDays)],
  ];
  
  return [headers, ...rows].map(row => row.join('\t')).join('\n');
}

function generateTable3Content(monthlyAnalysis: MonthlyAnalysis[]): string {
  const headers = ['月份', '系统盈利胜率', '系统无失误盈利胜率', '系统有失误盈利胜率', '非系统盈利胜率', '系统盈利平均持仓天数', '系统亏损平均持仓天数', '非系统盈利平均持仓天数', '非系统亏损平均持仓天数'];
  const rows = monthlyAnalysis.map(item => [
    item.month,
    formatValue(item.systemProfitRatio) + '%',
    formatValue(item.systemNoMistakeProfitRatio) + '%',
    formatValue(item.systemWithMistakeProfitRatio) + '%',
    formatValue(item.nonSystemProfitRatio) + '%',
    formatValue(item.systemProfitAvgHoldDays),
    formatValue(item.systemLossAvgHoldDays),
    formatValue(item.nonSystemProfitAvgHoldDays),
    formatValue(item.nonSystemLossAvgHoldDays),
  ]);
  
  return [headers, ...rows].map(row => row.join('\t')).join('\n');
}

async function handleGetRecords(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('方法不支持', { status: 405 });
  }
  
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.API_TOKEN}`) {
    return new Response('未授权', { status: 401 });
  }
  
  try {
    const object = await env.R2_BUCKET.get('stats/records.json');
    
    if (!object) {
      return new Response(JSON.stringify({ success: true, records: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const records = await object.json() as TradingRecord[];
    
    return new Response(JSON.stringify({ success: true, records }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取记录失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `获取失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

async function handleSaveRecords(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('方法不支持', { status: 405 });
  }
  
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.API_TOKEN}`) {
    return new Response('未授权', { status: 401 });
  }
  
  try {
    const { records } = await request.json() as { records: TradingRecord[] };
    
    if (!Array.isArray(records)) {
      return new Response(JSON.stringify({ success: false, message: '数据格式错误' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    await env.R2_BUCKET.put('stats/records.json', JSON.stringify(records, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
      },
    });
    
    return new Response(JSON.stringify({ success: true, message: '保存成功' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('保存记录失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

async function handleUpdateStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('方法不支持', { status: 405 });
  }
  
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.API_TOKEN}`) {
    return new Response('未授权', { status: 401 });
  }
  
  try {
    const { records } = await request.json() as { records: TradingRecord[] };
    
    if (!Array.isArray(records) || records.length === 0) {
      return new Response(JSON.stringify({ success: false, message: '没有数据需要处理' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const analysis = calculateAnalysis(records);
    const monthlyAnalysis = calculateMonthlyAnalysis(records);
    
    const table2Content = generateTable2Content(analysis);
    const table3Content = generateTable3Content(monthlyAnalysis);
    
    await env.R2_BUCKET.put('stats/表2-动态数据分析.tsv', table2Content, {
      httpMetadata: {
        contentType: 'text/tab-separated-values',
      },
    });
    
    await env.R2_BUCKET.put('stats/表3-月度统计.tsv', table3Content, {
      httpMetadata: {
        contentType: 'text/tab-separated-values',
      },
    });
    
    await env.R2_BUCKET.put('stats/records.json', JSON.stringify(records, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
      },
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: '统计数据更新成功',
      analysis,
      monthlyAnalysis,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('更新统计数据失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `更新失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/records') {
      if (request.method === 'GET') {
        return handleGetRecords(request, env);
      } else if (request.method === 'POST') {
        return handleSaveRecords(request, env);
      }
      return new Response('方法不支持', { status: 405 });
    }
    
    if (url.pathname === '/api/update-stats') {
      return handleUpdateStats(request, env);
    }
    
    return new Response('未找到该端点', { status: 404 });
  },
};

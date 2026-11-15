// 同源 CORS：只对与请求同源的页面回 Access-Control-Allow-Origin。
// 原先统一返回 `*`，等于允许任意第三方网页跨站读写数据集；
// 本项目是单页应用与 Functions 同域部署，收紧到同源即可。
// 需要额外放行时在环境变量 CORS_ALLOW_ORIGINS 里用逗号列出（例如自定义域名）。

function allowedOrigins(env: any): string[] {
  const raw = typeof env?.CORS_ALLOW_ORIGINS === 'string' ? env.CORS_ALLOW_ORIGINS : '';
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}

export function corsHeaders(request: Request, env?: any): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };

  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  const extra = allowedOrigins(env);

  // 同源页面或无 Origin（同源导航、服务端调用、curl）放行；跨站来源不回 ACAO，由浏览器拦截读取
  if (!origin || origin === self || extra.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin ?? self;
  }
  return headers;
}

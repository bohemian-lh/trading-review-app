/// <reference types="@cloudflare/workers-types" />

export interface Env {
  R2_BUCKET: R2Bucket;
  API_TOKEN: string;
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = ['https://trading-review.pages.dev', 'http://localhost:5173'];

  if (!allowedOrigins.includes(origin) && !origin.startsWith('http://localhost')) {
    return new Response('Forbidden', { status: 403 });
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token !== env.API_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/records') {
    if (request.method === 'GET') {
      return handleGetRecords(env);
    }
    if (request.method === 'POST') {
      return handleSaveRecords(request, env);
    }
  }

  return new Response('Not Found', { status: 404 });
}

async function handleGetRecords(env: Env): Promise<Response> {
  try {
    const key = 'trading-data/records.json';
    const object = await env.R2_BUCKET.get(key);

    if (!object) {
      return new Response(JSON.stringify({ success: true, records: [] }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const records = await object.json() as any[];
    return new Response(JSON.stringify({ success: true, records }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Failed to get records', { status: 500 });
  }
}

async function handleSaveRecords(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { records?: any };
    const { records } = body;

    if (!Array.isArray(records)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid records format' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const key = 'trading-data/records.json';
    await env.R2_BUCKET.put(key, JSON.stringify(records));

    return new Response(JSON.stringify({ success: true, message: 'Records saved' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Failed to save records', { status: 500 });
  }
}
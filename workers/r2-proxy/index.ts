export interface Env {
  R2_BUCKET: R2Bucket;
  API_TOKEN: string;
}

const ALLOWED_ORIGINS = ['https://trading-review.pages.dev', 'http://localhost:5173'];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';

    if (!ALLOWED_ORIGINS.includes(origin) && !origin.startsWith('http://localhost')) {
      return new Response('Forbidden', { status: 403 });
    }

    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token !== env.API_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/files' && request.method === 'GET') {
      return handleListFiles(env);
    }

    if (path.startsWith('/api/r2-token')) {
      const action = url.searchParams.get('action');
      const filename = url.searchParams.get('filename');

      if (!filename) {
        return new Response('Missing filename', { status: 400 });
      }

      if (action === 'upload') {
        return handleUploadToken(env, filename);
      }

      if (action === 'download') {
        return handleDownloadToken(env, filename);
      }

      return new Response('Invalid action', { status: 400 });
    }

    if (path.startsWith('/api/files/') && request.method === 'DELETE') {
      const filename = decodeURIComponent(path.split('/').pop() || '');
      return handleDeleteFile(env, filename);
    }

    if (path === '/api/records') {
      if (request.method === 'GET') {
        return handleGetRecords(env);
      }
      if (request.method === 'POST') {
        return handleSaveRecords(request, env);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleListFiles(env: Env): Promise<Response> {
  try {
    const objects = await env.R2_BUCKET.list();
    const files = objects.objects.map((obj) => ({
      key: obj.key,
      filename: obj.key,
      lastModified: obj.uploaded,
      size: obj.size,
    }));

    return new Response(JSON.stringify({ files }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Failed to list files', { status: 500 });
  }
}

async function handleUploadToken(env: Env, filename: string): Promise<Response> {
  try {
    const key = `trading-data/${filename}`;
    const presignedUploadUrl = await env.R2_BUCKET.createSignedUploadUrl(key, {
      expiresIn: 3600,
    });

    return new Response(
      JSON.stringify({
        uploadUrl: presignedUploadUrl,
        key,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    return new Response('Failed to create upload URL', { status: 500 });
  }
}

async function handleDownloadToken(env: Env, filename: string): Promise<Response> {
  try {
    const key = `trading-data/${filename}`;
    const presignedDownloadUrl = await env.R2_BUCKET.createSignedDownloadUrl(key, {
      expiresIn: 3600,
    });

    return new Response(
      JSON.stringify({
        downloadUrl: presignedDownloadUrl,
        key,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    return new Response('Failed to create download URL', { status: 500 });
  }
}

async function handleDeleteFile(env: Env, filename: string): Promise<Response> {
  try {
    const key = `trading-data/${filename}`;
    await env.R2_BUCKET.delete(key);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Failed to delete file', { status: 500 });
  }
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

    const records = await object.json();
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
    const body = await request.json();
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

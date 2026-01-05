import { extname, join } from 'node:path';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function guessContentType(filePath: string): string {
  return contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await Bun.file(filePath).exists();
  } catch {
    return false;
  }
}

type StaticHandler = (req: Request) => Promise<Response | null>;

export function createStaticHandler(params: {
  publicDir: string;
  devFrontendEntrypoint?: string;
}): StaticHandler {
  const publicDir = params.publicDir;
  const devEntrypoint = params.devFrontendEntrypoint;

  let lastDevBuildAt = 0;
  let lastDevBuild: { code: string; headers: Headers } | null = null;
  let devBuildInFlight: Promise<{ code: string; headers: Headers }> | null = null;

  async function buildFrontendForDev(): Promise<{ code: string; headers: Headers }> {
    if (!devEntrypoint) throw new Error('未配置 devFrontendEntrypoint');

    const now = Date.now();
    if (lastDevBuild && now - lastDevBuildAt < 250) return lastDevBuild;
    if (devBuildInFlight) return await devBuildInFlight;

    devBuildInFlight = (async () => {
      const result = await Bun.build({
        entrypoints: [devEntrypoint],
        target: 'browser',
        format: 'esm',
        sourcemap: 'inline',
        minify: false,
      });

      if (!result.success) {
        throw new Error(result.logs.map((l) => l.message).join('\n') || '前端构建失败');
      }

      const js = await result.outputs[0]!.text();
      const headers = new Headers();
      headers.set('Content-Type', 'text/javascript; charset=utf-8');
      headers.set('Cache-Control', 'no-store');

      lastDevBuildAt = Date.now();
      lastDevBuild = { code: js, headers };
      return lastDevBuild;
    })();

    try {
      return await devBuildInFlight;
    } finally {
      devBuildInFlight = null;
    }
  }

  return async (req: Request): Promise<Response | null> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null;

    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('..')) return new Response('Not Found', { status: 404 });

    if (devEntrypoint && pathname === '/assets/app.js') {
      const built = await buildFrontendForDev();
      return new Response(built.code, { headers: built.headers });
    }

    const filePath = join(publicDir, pathname.replace(/^\//, ''));
    if (!(await fileExists(filePath))) return null;

    const headers = new Headers();
    headers.set('Content-Type', guessContentType(filePath));
    if (pathname.startsWith('/assets/')) headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(Bun.file(filePath), { headers });
  };
}


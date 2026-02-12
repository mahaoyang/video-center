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
  devFrontendEntrypoints?: Record<string, string>;
}): StaticHandler {
  const publicDir = params.publicDir;
  const devEntrypointMap: Record<string, string> = {
    ...(params.devFrontendEntrypoints || {}),
  };
  if (params.devFrontendEntrypoint && !devEntrypointMap['/assets/app.js']) {
    devEntrypointMap['/assets/app.js'] = params.devFrontendEntrypoint;
  }

  const lastDevBuildAt = new Map<string, number>();
  const lastDevBuild = new Map<string, { code: string; headers: Headers }>();
  const devBuildInFlight = new Map<string, Promise<{ code: string; headers: Headers }>>();

  async function buildFrontendForDev(assetPath: string): Promise<{ code: string; headers: Headers }> {
    const entry = devEntrypointMap[assetPath];
    if (!entry) throw new Error(`未配置 devFrontendEntrypoint: ${assetPath}`);

    const now = Date.now();
    const cached = lastDevBuild.get(assetPath);
    const cachedAt = lastDevBuildAt.get(assetPath) || 0;
    if (cached && now - cachedAt < 250) return cached;

    const inFlight = devBuildInFlight.get(assetPath);
    if (inFlight) return await inFlight;

    const nextBuild = (async () => {
      const result = await Bun.build({
        entrypoints: [entry],
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

      const built = { code: js, headers };
      lastDevBuildAt.set(assetPath, Date.now());
      lastDevBuild.set(assetPath, built);
      return built;
    })();
    devBuildInFlight.set(assetPath, nextBuild);

    try {
      return await nextBuild;
    } finally {
      devBuildInFlight.delete(assetPath);
    }
  }

  return async (req: Request): Promise<Response | null> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null;

    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/ai' || pathname === '/ai/') pathname = '/ai.html';
    if (pathname.includes('..')) return new Response('Not Found', { status: 404 });

    if (devEntrypointMap[pathname]) {
      const built = await buildFrontendForDev(pathname);
      return new Response(built.code, { headers: built.headers });
    }

    const filePath = join(publicDir, pathname.replace(/^\//, ''));
    if (!(await fileExists(filePath))) return null;

    const headers = new Headers();
    headers.set('Content-Type', guessContentType(filePath));
    if (pathname.startsWith('/assets/')) headers.set('Cache-Control', 'no-store');

    return new Response(Bun.file(filePath), { headers });
  };
}

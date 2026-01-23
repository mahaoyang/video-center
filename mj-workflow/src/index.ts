import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { MJApi } from './lib/mj-api';
import { YunwuChatApi } from './lib/yunwu-chat';
import { createGeminiVisionClient } from './lib/gemini-vision';
import { createApiRouter } from './api/router';
import { createStaticHandler } from './server/static';
import { loadConfig } from './config/load-config';
import { ImageProxyClient } from './lib/imageproxy';
import { VideoApi } from './lib/video-api';
import { createGeminiVideoClient } from './lib/gemini-video';

const moduleDir = dirname(fileURLToPath(import.meta.url));
if (moduleDir.endsWith('/dist') && process.cwd() !== moduleDir) {
  process.chdir(moduleDir);
}

const projectDir = dirname(moduleDir);
const config = loadConfig(process.env, { projectDir });
const isDistRuntime = moduleDir.endsWith('/dist');
const publicDir = isDistRuntime ? 'public' : 'src/public';
const uploadsDir = join(projectDir, '.data', 'uploads');

const mjApi = new MJApi({ apiUrl: config.mj.apiUrl, token: config.mj.token });
const chatApi = new YunwuChatApi({
  apiUrl: config.llm.apiUrl,
  token: config.llm.token,
  defaultModel: config.llm.visionModel,
});
const gemini = createGeminiVisionClient({ apiKey: config.gemini.apiKey });
const geminiVideo = createGeminiVideoClient({ apiKey: config.gemini.apiKey });
const imageproxy = new ImageProxyClient({ apiUrl: config.imageproxy.apiUrl, token: config.imageproxy.token });
const videoApi = new VideoApi({ apiUrl: config.llm.apiUrl, token: config.llm.token });

const handleApi = createApiRouter({
  mjApi,
  chatApi,
  gemini,
  geminiVideo,
  imageproxy,
  videoApi,
  uploads: { dir: uploadsDir, publicPath: '/uploads' },
  auth: {
    mjTokenConfigured: Boolean(config.mj.token),
    llmTokenConfigured: Boolean(config.llm.token),
    geminiConfigured: Boolean(config.gemini.apiKey),
    imageproxyConfigured: Boolean(config.imageproxy.token),
  },
  meta: {
    mjApiUrl: config.mj.apiUrl,
    llmApiUrl: config.llm.apiUrl,
    visionModel: config.llm.visionModel,
    runtime: isDistRuntime ? 'dist' : 'dev',
    tokenSources: config.diagnostics,
  },
});
const handleStatic = createStaticHandler({
  publicDir,
  devFrontendEntrypoint: isDistRuntime ? undefined : `${publicDir}/app.ts`,
});

const serveOptions = {
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
      const key = basename(url.pathname);
      if (!key || key.includes('..')) return new Response('Bad Request', { status: 400 });
      const filePath = join(uploadsDir, key);
      if (!existsSync(filePath)) return new Response('Not Found', { status: 404 });
      return new Response(Bun.file(filePath));
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req);
    }

    const staticResp = await handleStatic(req);
    if (staticResp) return staticResp;

    return new Response('Not Found', { status: 404 });
  },
  development: isDistRuntime
    ? undefined
    : {
        hmr: true,
        console: true,
      },
} satisfies Omit<Bun.ServeOptions, 'port'>;

function isAddrInUse(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'EADDRINUSE');
}

const bindHostRaw = process.env.BIND_HOST?.trim();
const bindHost = bindHostRaw ? bindHostRaw : undefined;

const idleTimeoutSecondsRaw = process.env.HTTP_IDLE_TIMEOUT_SECONDS?.trim();
const idleTimeoutSeconds = (() => {
  const parsed = idleTimeoutSecondsRaw ? Number(idleTimeoutSecondsRaw) : NaN;
  const v = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 255;
  return Math.max(1, Math.min(255, v));
})();

let port = config.port;
let server: ReturnType<typeof Bun.serve> | undefined;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    server = Bun.serve({ port, hostname: bindHost, idleTimeout: idleTimeoutSeconds, ...serveOptions });
    break;
  } catch (err) {
    if (isAddrInUse(err) && config.diagnostics.portSource === 'default') {
      port += 1;
      continue;
    }
    throw err;
  }
}

if (!server) {
  throw new Error(`Failed to start server after trying ports ${config.port}..${port}`);
}

if (server.port !== config.port) {
  console.log(`[mj-workflow] Port ${config.port} is in use, switched to ${server.port}`);
}
console.log(`🚀 MJ Workflow server running at http://localhost:${server.port}`);
console.log(`
环境变量配置：
  MJ_API_URL: ${config.mj.apiUrl}
  YUNWU_MJ_KEY: ${config.mj.token ? '已配置 ✓' : '未配置 ✗'}
  LLM_API_URL: ${config.llm.apiUrl}
  YUNWU_ALL_KEY: ${config.llm.token ? '已配置 ✓' : '未配置 ✗'}
  VISION_MODEL: ${config.llm.visionModel}
  Gemini_KEY: ${config.gemini.apiKey ? '已配置 ✓' : '未配置 ✗'}
  IMAGEPROXY_API_URL: ${config.imageproxy.apiUrl}
  IMAGEPROXY_TOKEN: ${config.imageproxy.token ? '已配置 ✓' : '未配置 ✗'}
  PUBLIC_DIR: ${publicDir} ${isDistRuntime ? '(dist)' : '(dev)'}

访问 http://localhost:${server.port} 开始使用
`);

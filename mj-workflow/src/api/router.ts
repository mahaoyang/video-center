import type { MJApi } from '../lib/mj-api';
import type { YunwuChatApi } from '../lib/yunwu-chat';
import type { GeminiVisionClient } from '../lib/gemini-vision';
import type { GeminiVideoClient } from '../lib/gemini-video';
import type { ImageProxyClient } from '../lib/imageproxy';
import type { VideoApi } from '../lib/video-api';
import type { VisionDescribeRequest } from '../types';
import { json, jsonError, readJson } from '../http/json';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

function extractAssistantText(raw: any): string {
  try {
    const choice = raw?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n');
    }
  } catch {
    // ignore
  }
  return '';
}

function normalizeInputImageUrl(req: Request, value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return new URL(raw, req.url).toString();
}

function sniffImageExt(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    // PNG
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return '.png';
    }
  }

  if (bytes.length >= 3) {
    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return '.jpg';
    }
  }

  if (bytes.length >= 12) {
    // WEBP: RIFF....WEBP
    const riff =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const webp =
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (riff && webp) return '.webp';
  }

  if (bytes.length >= 6) {
    // GIF
    const gif87a =
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x37 && bytes[5] === 0x61;
    const gif89a =
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x39 && bytes[5] === 0x61;
    if (gif87a || gif89a) return '.gif';
  }

  return null;
}

function normalizeImageExt(ext: string): string {
  const lower = String(ext || '').toLowerCase();
  if (lower === '.jpeg') return '.jpg';
  return lower;
}

function mimeFromImageExt(ext: string): string {
  const e = normalizeImageExt(ext);
  if (e === '.png') return 'image/png';
  if (e === '.jpg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '::1') return true;
  if (isPrivateIpv4(h)) return true;
  return false;
}

function cacheKeyFromSrc(src: string): string {
  return createHash('sha256').update(String(src || ''), 'utf8').digest('hex');
}

async function readExternalImageCache(cacheDir: string, key: string): Promise<Uint8Array | null> {
  const filePath = join(cacheDir, key);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  return bytes.length ? bytes : null;
}

async function writeExternalImageCache(cacheDir: string, key: string, bytes: Uint8Array): Promise<void> {
  if (!bytes.length) return;
  await mkdir(cacheDir, { recursive: true });
  try {
    await writeFile(join(cacheDir, key), bytes, { flag: 'wx' });
  } catch (error: any) {
    if (error?.code === 'EEXIST') return;
    throw error;
  }
}

async function fetchExternalImageBytes(req: Request, absolute: URL): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const headers: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; MJ-Workflow/1.0; +https://localhost)',
  };
  const referer = req.headers.get('referer');
  if (referer) headers.Referer = referer;

  const timeouts = [15000, 25000];
  let lastError: unknown;
  for (const ms of timeouts) {
    try {
      const resp = await fetch(absolute.toString(), { headers, signal: AbortSignal.timeout(ms) });
      if (!resp.ok) throw new Error(`拉取图片失败: ${resp.status}`);
      const contentType = resp.headers.get('content-type');
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      if (bytes.length > 25 * 1024 * 1024) throw new Error('图片过大（>25MB）');
      return { bytes, contentType };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('拉取图片失败');
}

export function createApiRouter(deps: {
  mjApi: MJApi;
  chatApi: YunwuChatApi;
  gemini: GeminiVisionClient;
  geminiVideo: GeminiVideoClient;
  imageproxy: ImageProxyClient;
  videoApi: VideoApi;
  uploads: { dir: string; publicPath: string };
  auth: {
    mjTokenConfigured: boolean;
    llmTokenConfigured: boolean;
    geminiConfigured: boolean;
    imageproxyConfigured: boolean;
  };
  meta?: {
    mjApiUrl: string;
    llmApiUrl: string;
    visionModel: string;
    runtime: 'dev' | 'dist';
    tokenSources?: unknown;
  };
	}): (req: Request) => Promise<Response> {
	  return async (req: Request): Promise<Response> => {
	    const url = new URL(req.url);
	    const { pathname } = url;
      const externalCacheDir = join(deps.uploads.dir, '_external_cache');

	    if (pathname === '/api/health' && req.method === 'GET') {
	      return json({ ok: true, auth: deps.auth, meta: deps.meta });
	    }

	    if (pathname === '/api/image' && req.method === 'GET') {
	      try {
	        const src = String(url.searchParams.get('src') || '').trim();
	        if (!src) return jsonError({ status: 400, description: '缺少 src' });

	        let bytes: Uint8Array;
	        let contentType: string | null = null;

	        if (src.startsWith('/uploads/')) {
	          const key = basename(src);
	          if (!key || key.includes('..')) return jsonError({ status: 400, description: 'src 非法' });
	          const filePath = join(deps.uploads.dir, key);
	          const file = Bun.file(filePath);
	          if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });
	          const ab = await file.arrayBuffer();
	          bytes = new Uint8Array(ab);

	          const ext = normalizeImageExt(extname(key));
	          contentType =
	            ext === '.png'
	              ? 'image/png'
	              : ext === '.jpg'
	                ? 'image/jpeg'
	                : ext === '.webp'
	                  ? 'image/webp'
	                  : ext === '.gif'
	                    ? 'image/gif'
	                    : null;
	        } else {
	          let absolute: URL;
	          try {
	            absolute = new URL(src);
	          } catch {
	            absolute = new URL(src, req.url);
	          }
	          if (!['http:', 'https:'].includes(absolute.protocol)) {
	            return jsonError({ status: 400, description: '仅支持 http/https 图片' });
	          }
	          if (isUnsafeHost(absolute.hostname)) {
	            return jsonError({ status: 400, description: '禁止访问内网地址' });
	          }
            const key = cacheKeyFromSrc(absolute.toString());
            const cached = await readExternalImageCache(externalCacheDir, key);
            if (cached) {
              bytes = cached;
            } else {
              const fetched = await fetchExternalImageBytes(req, absolute);
              bytes = fetched.bytes;
              contentType = fetched.contentType;
              const sniffed = sniffImageExt(bytes);
              const isImageType = Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
              if (!isImageType && !sniffed) {
                return jsonError({ status: 502, description: `拉取图片失败: non-image content-type ${contentType || 'unknown'}` });
              }
              await writeExternalImageCache(externalCacheDir, key, bytes);
            }
	        }

	        const sniffed = sniffImageExt(bytes);
	        const sniffedMime =
	          sniffed === '.png'
	            ? 'image/png'
	            : sniffed === '.jpg'
	              ? 'image/jpeg'
	              : sniffed === '.webp'
	                ? 'image/webp'
	                : sniffed === '.gif'
	                  ? 'image/gif'
	                  : null;

	        if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
	          contentType = sniffedMime || 'application/octet-stream';
	        } else if (sniffedMime && contentType.toLowerCase() !== sniffedMime) {
	          // Some CDNs lie about Content-Type (e.g. image/jpeg for a PNG). Prefer sniffed mime
	          // so client-side file extensions match bytes and won't fail our upload validator.
	          contentType = sniffedMime;
	        }

	        return new Response(bytes, {
	          headers: {
	            'Content-Type': contentType,
	            'Cache-Control': 'public, max-age=604800',
	          },
	        });
	      } catch (error) {
	        console.error('Image proxy error:', error);
	        return jsonError({ status: 500, description: '拉取图片失败', error });
	      }
	    }

      if (pathname === '/api/video' && req.method === 'GET') {
        try {
          const src = String(url.searchParams.get('src') || '').trim();
          if (!src) return jsonError({ status: 400, description: '缺少 src' });

          let absolute: URL;
          try {
            absolute = new URL(src);
          } catch {
            absolute = new URL(src, req.url);
          }
          if (!['http:', 'https:'].includes(absolute.protocol)) {
            return jsonError({ status: 400, description: '仅支持 http/https 视频' });
          }
          if (isUnsafeHost(absolute.hostname)) {
            return jsonError({ status: 400, description: '禁止访问内网地址' });
          }

          const upstream = await fetch(absolute.toString(), {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MJ-Workflow/1.0; +https://localhost)',
            },
          });
          if (!upstream.ok) return jsonError({ status: 502, description: `拉取视频失败: ${upstream.status}` });

          const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
          return new Response(upstream.body, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        } catch (error) {
          console.error('Video proxy error:', error);
          return jsonError({ status: 500, description: '拉取视频失败', error });
        }
      }

	    if (pathname === '/api/slice' && req.method === 'GET') {
	      try {
	        const url = new URL(req.url);
	        const src = String(url.searchParams.get('src') || '').trim();
	        const indexRaw = String(url.searchParams.get('index') || '').trim();
        const index = Number(indexRaw);
        if (!src) return jsonError({ status: 400, description: '缺少 src' });
        if (![1, 2, 3, 4].includes(index)) return jsonError({ status: 400, description: 'index 必须为 1-4' });

        let bytes: Uint8Array;
        if (src.startsWith('/uploads/')) {
          const key = basename(src);
          if (!key || key.includes('..')) return jsonError({ status: 400, description: 'src 非法' });
          const filePath = join(deps.uploads.dir, key);
          const file = Bun.file(filePath);
          if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });
          const ab = await file.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else {
          let absolute: URL;
          try {
            absolute = new URL(src);
          } catch {
            absolute = new URL(src, req.url);
          }
          if (!['http:', 'https:'].includes(absolute.protocol)) {
            return jsonError({ status: 400, description: '仅支持 http/https 图片' });
          }
          if (isUnsafeHost(absolute.hostname)) {
            return jsonError({ status: 400, description: '禁止访问内网地址' });
          }
          const key = cacheKeyFromSrc(absolute.toString());
          const cached = await readExternalImageCache(externalCacheDir, key);
          if (cached) {
            bytes = cached;
          } else {
            const fetched = await fetchExternalImageBytes(req, absolute);
            bytes = fetched.bytes;
            const sniffed = sniffImageExt(bytes);
            const isImageType = Boolean(fetched.contentType && fetched.contentType.toLowerCase().startsWith('image/'));
            if (!isImageType && !sniffed) {
              return jsonError({
                status: 502,
                description: `拉取图片失败: non-image content-type ${fetched.contentType || 'unknown'}`,
              });
            }
            await writeExternalImageCache(externalCacheDir, key, bytes);
          }
        }

        if (!sniffImageExt(bytes)) {
          return jsonError({ status: 400, description: '源不是有效图片' });
        }

        const img = sharp(bytes);
        const meta = await img.metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        if (!w || !h) return jsonError({ status: 400, description: '无法解析图片尺寸' });

        // Avoid sharp extract errors on tiny images (e.g. 1x1 test fixtures).
        if (w < 2 || h < 2) {
          const out = await img.png().toBuffer();
          return new Response(out, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }

        const halfW = Math.floor(w / 2);
        const halfH = Math.floor(h / 2);
        const leftW = halfW;
        const rightW = w - halfW;
        const topH = halfH;
        const bottomH = h - halfH;

        const region =
          index === 1
            ? { left: 0, top: 0, width: leftW, height: topH }
            : index === 2
              ? { left: halfW, top: 0, width: rightW, height: topH }
              : index === 3
                ? { left: 0, top: halfH, width: leftW, height: bottomH }
                : { left: halfW, top: halfH, width: rightW, height: bottomH };

        const out = await img.extract(region).png().toBuffer();
        return new Response(out, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=2592000',
          },
        });
      } catch (error) {
        console.error('Slice error:', error);
        return jsonError({ status: 500, description: '切图失败', error });
      }
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return jsonError({ status: 400, description: '缺少 file 字段（multipart/form-data）' });
        }
        if (file.type && !file.type.startsWith('image/')) {
          return jsonError({ status: 400, description: `仅支持图片文件（当前: ${file.type}）` });
        }

        await mkdir(deps.uploads.dir, { recursive: true });
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const sniffedExt = sniffImageExt(bytes);
        const extFromName = extname(file.name || '');
        if (!sniffedExt) {
          return jsonError({ status: 400, description: '图片格式不支持或文件已损坏（仅支持 PNG/JPG/WEBP/GIF）' });
        }
        const normalizedSniff = normalizeImageExt(sniffedExt);
        const normalizedNameExt = normalizeImageExt(extFromName);
        const ext = normalizeImageExt(extFromName || sniffedExt);
        if (extFromName && normalizedSniff !== normalizedNameExt) {
          return jsonError({ status: 400, description: '图片文件扩展名与内容不匹配，请重新上传' });
        }

        const localKey = `${randomUUID()}${ext}`;
        const safeKey = basename(localKey);
        const localPath = join(deps.uploads.dir, safeKey);
        const localUrl = `${deps.uploads.publicPath}/${safeKey}`;

        await writeFile(localPath, bytes);

        // NOTE: Do not eagerly upload to 3rd-party CDN. CDN promotion is done lazily (see /api/upload/promote)
        // only when generating MJ prompts that require a public URL.
        const cdnUrl: string | undefined = undefined;
        const url = localUrl;
        return json({
          code: 0,
          description: '成功',
          result: { url, cdnUrl, localUrl, localPath, localKey },
        });
      } catch (error) {
        console.error('Upload error:', error);
        return jsonError({ status: 500, description: '上传失败', error });
      }
    }

    if (pathname === '/api/upload/promote' && req.method === 'POST') {
      try {
        if (!deps.auth.imageproxyConfigured) {
          return jsonError({ status: 500, description: '未配置 IMAGEPROXY_TOKEN，无法上传到 CDN（promote）' });
        }
        const body = await readJson<{ localKey?: string }>(req);
        const localKey = String(body.localKey || '').trim();
        if (!localKey) return jsonError({ status: 400, description: 'localKey 不能为空' });
        if (basename(localKey) !== localKey) return jsonError({ status: 400, description: 'localKey 非法' });
        if (!/^[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]+)?$/.test(localKey)) {
          return jsonError({ status: 400, description: 'localKey 格式不正确' });
        }

        const filePath = join(deps.uploads.dir, localKey);
        const file = Bun.file(filePath);
        if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });

        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const sniffedExt = sniffImageExt(bytes);
        if (!sniffedExt) return jsonError({ status: 400, description: '图片格式不支持或文件已损坏（仅支持 PNG/JPG/WEBP/GIF）' });

        const ext = normalizeImageExt(extname(localKey) || sniffedExt);
        const mime = mimeFromImageExt(ext);
        const uploadFile = new File([bytes], localKey, { type: mime });

        const uploaded = await deps.imageproxy.upload(uploadFile);
        const cdnUrl = uploaded?.url ? String(uploaded.url) : '';
        if (!cdnUrl) return jsonError({ status: 502, description: 'CDN 上传失败：缺少 url' });

        return json({
          code: 0,
          description: '成功',
          result: {
            cdnUrl,
            url: cdnUrl,
            localKey,
            localUrl: `${deps.uploads.publicPath}/${localKey}`,
          },
        });
      } catch (error) {
        console.error('Upload promote error:', error);
        return jsonError({ status: 500, description: '上传到 CDN 失败', error });
      }
    }

    if (pathname === '/api/upload/delete' && req.method === 'POST') {
      try {
        const body = await readJson<{ localKey?: string }>(req);
        const localKey = String(body.localKey || '').trim();
        if (!localKey) return jsonError({ status: 400, description: 'localKey 不能为空' });
        if (basename(localKey) !== localKey) return jsonError({ status: 400, description: 'localKey 非法' });
        if (!/^[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]+)?$/.test(localKey)) {
          return jsonError({ status: 400, description: 'localKey 格式不正确' });
        }

        const filePath = join(deps.uploads.dir, localKey);
        try {
          await unlink(filePath);
        } catch {
          // already deleted
        }

        return json({ code: 0, description: '已删除', result: { ok: true } });
      } catch (error) {
        console.error('Delete upload error:', error);
        return jsonError({ status: 500, description: '删除失败', error });
      }
    }

    if (pathname === '/api/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ base64?: string; imageUrl?: string }>(req);
        const result = await deps.mjApi.describe({ base64: body.base64, imageUrl: body.imageUrl });
        return json(result);
      } catch (error) {
        console.error('Describe error:', error);
        return jsonError({ status: 500, description: '反推提示词失败', error });
      }
    }

    if (pathname === '/api/vision/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }
        const body = await readJson<VisionDescribeRequest>(req);
        const { imageUrl, question, model } = body;

        if (!imageUrl) return jsonError({ status: 400, description: 'imageUrl 不能为空' });
        const normalizedUrl = normalizeInputImageUrl(req, imageUrl);
        if (normalizedUrl.includes('://localhost') || normalizedUrl.includes('://127.0.0.1')) {
          return jsonError({ status: 400, description: '识图需要公网可访问图片：请使用图床 URL 或 data:image/*' });
        }

        const raw = await deps.chatApi.visionDescribe({
          imageUrl: normalizedUrl,
          question: question || '这张图片里有什么?请详细描述。',
          model,
        });

        const upstreamError = (raw as any)?.error;
        if (upstreamError?.message || upstreamError?.message_zh) {
          return json(
            {
              code: -1,
              description: upstreamError?.message_zh || upstreamError?.message || '上游识图接口返回错误',
              error: upstreamError,
            },
            { status: 502 }
          );
        }

        const text = extractAssistantText(raw);
        return json({ code: 0, description: '成功', result: { text, raw } });
      } catch (error) {
        console.error('Vision describe error:', error);
        return jsonError({ status: 500, description: '识图失败', error });
      }
    }

    if (pathname === '/api/imagine' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ prompt: string; base64Array?: string[]; notifyHook?: string; state?: string }>(req);
        const result = await deps.mjApi.imagine({
          prompt: body.prompt,
          base64Array: body.base64Array,
          notifyHook: body.notifyHook,
          state: body.state,
        });
        return json(result);
      } catch (error) {
        console.error('Imagine error:', error);
        return jsonError({ status: 500, description: '生图失败', error });
      }
    }

    if (pathname === '/api/upscale' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ taskId: string; index: number }>(req);
        const { taskId, index } = body;

        if (!taskId) return jsonError({ status: 400, description: 'taskId 不能为空' });
        if (![1, 2, 3, 4].includes(Number(index))) return jsonError({ status: 400, description: 'index 必须为 1-4' });

        const customId = `MJ::JOB::upsample::${index}::${taskId}`;
        const result = await deps.mjApi.upscale({
          chooseSameChannel: true,
          customId,
          taskId,
          notifyHook: '',
          state: '',
        });

        return json(result);
      } catch (error) {
        console.error('Upscale error:', error);
        return jsonError({ status: 500, description: '扩图失败', error });
      }
    }

    const taskMatch = pathname.match(/^\/api\/task\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const taskId = taskMatch[1]!;
        const result = await deps.mjApi.queryTask(taskId);
        return json(result);
      } catch (error) {
        console.error('Task query error:', error);
        return jsonError({ status: 500, description: '查询任务失败', error });
      }
    }

    if (pathname === '/api/gemini/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ imageUrl?: string }>(req);
        const imageUrl = body.imageUrl;
        if (!imageUrl) return jsonError({ status: 400, description: 'imageUrl 不能为空' });

        const prompt = await deps.gemini.imageToPrompt(normalizeInputImageUrl(req, imageUrl));
        return json({ code: 0, description: '成功', result: { prompt } });
      } catch (error) {
        console.error('Gemini describe error:', error);
        return jsonError({ status: 500, description: 'Gemini 反推失败', error });
      }
    }

    if (pathname === '/api/gemini/chat' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ messages?: Array<{ role?: string; content?: string }> }>(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!messages.length) return jsonError({ status: 400, description: 'messages 不能为空' });
        const text = await deps.gemini.chat(
          messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') }))
        );
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini chat error:', error);
        return jsonError({ status: 500, description: 'Gemini 对话失败', error });
      }
    }

    if (pathname === '/api/gemini/translate' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ text?: string }>(req);
        const text = String(body.text || '').trim();
        if (!text) return jsonError({ status: 400, description: 'text 不能为空' });

        const system = [
          'You are a translation engine for Midjourney prompt text.',
          'Translate the given prompt body into natural, concise English.',
          'Rules:',
          '- Output ONLY the translated prompt body, nothing else.',
          '- Do NOT add any Midjourney parameters (e.g. --ar, --v, --style, --sref, --cref).',
          '- Do NOT add any URLs or image links.',
          '- If the input is already English, return it unchanged.',
        ].join('\n');

        const out = await deps.gemini.generateText(system, text);
        return json({ code: 0, description: '成功', result: { text: out } });
      } catch (error) {
        console.error('Gemini translate error:', error);
        return jsonError({ status: 500, description: 'Gemini 翻译失败', error });
      }
    }

    if (pathname === '/api/gemini/beautify' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ text?: string; hint?: string }>(req);
        const text = String(body.text || '').trim();
        const hint = String(body.hint || '').trim();
        if (!text) return jsonError({ status: 400, description: 'text 不能为空' });

        const system = [
          'You are a Midjourney prompt polishing assistant.',
          'Rewrite the given prompt body in Simplified Chinese (简体中文), making it more vivid, specific, cinematic, and MJ-friendly.',
          'Rules:',
          '- Output ONLY ONE line of prompt body text, nothing else.',
          '- Do NOT add any Midjourney parameters (e.g. --ar, --v, --style, --sref, --cref).',
          '- Do NOT add any URLs or image links.',
          '- Keep it concise but information-dense.',
        ].join('\n');

        const user = hint ? `PROMPT:\n${text}\n\nHINT:\n${hint}` : `PROMPT:\n${text}`;
        const out = await deps.gemini.generateText(system, user);
        return json({ code: 0, description: '成功', result: { text: out } });
      } catch (error) {
        console.error('Gemini beautify error:', error);
        return jsonError({ status: 500, description: 'Gemini 美化失败', error });
      }
    }

    if (pathname === '/api/gemini/edit' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ imageUrl?: string; editPrompt?: string }>(req);
        const { imageUrl, editPrompt } = body;
        if (!imageUrl || !editPrompt) return jsonError({ status: 400, description: 'imageUrl 和 editPrompt 不能为空' });

        const result = await deps.gemini.editImage(normalizeInputImageUrl(req, imageUrl), editPrompt);
        if (!result) return jsonError({ status: 500, description: '图片编辑失败，未返回图片' });

        return json({ code: 0, description: '成功', result: { imageDataUrl: result } });
      } catch (error) {
        console.error('Gemini edit error:', error);
        return jsonError({ status: 500, description: 'Gemini 编辑失败', error });
      }
    }

    if (pathname === '/api/video/create' && req.method === 'POST') {
      try {
        const body = await readJson<{
          provider?: string;
          prompt?: string;
          model?: string;
          seconds?: number;
          mode?: string;
          aspect?: string;
          size?: string;
          startImageUrl?: string;
          endImageUrl?: string;
        }>(req);

        const provider = String(body.provider || '').trim();
        const prompt = String(body.prompt || '').trim();
        if (!provider) return jsonError({ status: 400, description: 'provider 不能为空' });
        if (!prompt) return jsonError({ status: 400, description: 'prompt 不能为空' });

        if (provider === 'gemini') {
          const model = String(body.model || '').trim();
          if (!model) return jsonError({ status: 400, description: 'model 不能为空' });
          const op = await deps.geminiVideo.generate({
            model,
            prompt,
            durationSeconds: typeof body.seconds === 'number' ? body.seconds : undefined,
            aspectRatio: body.aspect,
            resolution: body.size,
            startImageUrl: body.startImageUrl,
            endImageUrl: body.endImageUrl,
          });
          return json({
            code: 0,
            description: '成功',
            result: { provider: 'gemini', id: op.operationName, raw: op.raw },
          });
        }

        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }

        const result = await deps.videoApi.createVideo({
          provider: provider as any,
          prompt,
          model: body.model,
          seconds: body.seconds,
          mode: body.mode,
          aspect: body.aspect,
          size: body.size,
          startImageUrl: body.startImageUrl,
          endImageUrl: body.endImageUrl,
        });
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('Video create error:', error);
        return jsonError({ status: 500, description: '生视频提交失败', error });
      }
    }

    if (pathname === '/api/video/query' && req.method === 'GET') {
      try {
        const id = String(url.searchParams.get('id') || '').trim();
        const provider = String(url.searchParams.get('provider') || '').trim();
        if (!id) return jsonError({ status: 400, description: 'id 不能为空' });
        if (!provider) return jsonError({ status: 400, description: 'provider 不能为空' });

        if (provider === 'gemini') {
          const op = await deps.geminiVideo.getOperation({ operationName: id });
          const metadata = op.metadata as any;
          const progress =
            typeof metadata?.progressPercent === 'number'
              ? metadata.progressPercent
              : typeof metadata?.progress === 'number'
                ? metadata.progress
                : undefined;

          if (!op.done) {
            return json({
              code: 0,
              description: '成功',
              result: { provider: 'gemini', id, status: 'processing', progress, raw: op },
            });
          }

          if (op.error) {
            return json({
              code: 0,
              description: '成功',
              result: { provider: 'gemini', id, status: 'failed', raw: op, error: op.error },
            });
          }

          const generated = (op.response as any)?.generatedVideos?.[0]?.video;
          const uri = typeof generated?.uri === 'string' ? generated.uri.trim() : '';
          const mimeType = typeof generated?.mimeType === 'string' ? generated.mimeType.trim() : '';
          const videoBytes = typeof generated?.videoBytes === 'string' ? generated.videoBytes.trim() : '';

          let videoUrl: string | undefined;
          if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
            videoUrl = uri;
          } else {
            // Prefer downloading via SDK (supports gs:// and other backends), fallback to inline bytes.
            const ext = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/webm' ? 'webm' : 'mp4';
            const key = `gemini-video-${randomUUID()}.${ext}`;
            const filePath = join(deps.uploads.dir, key);
            if (videoBytes) {
              const buf = Buffer.from(videoBytes, 'base64');
              await writeFile(filePath, buf);
              videoUrl = `${deps.uploads.publicPath}/${key}`;
            } else if (generated) {
              await deps.geminiVideo.downloadVideo({ file: generated, downloadPath: filePath });
              videoUrl = `${deps.uploads.publicPath}/${key}`;
            } else if (uri) {
              // last resort: return uri even if non-http
              videoUrl = uri;
            }
          }

          return json({
            code: 0,
            description: '成功',
            result: { provider: 'gemini', id, status: 'completed', progress: 100, videoUrl, raw: op },
          });
        }

        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }

        const result = await deps.videoApi.queryVideo({ provider: provider as any, id });
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('Video query error:', error);
        return jsonError({ status: 500, description: '生视频查询失败', error });
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

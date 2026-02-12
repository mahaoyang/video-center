import type { MJApi } from '../lib/mj-api';
import type { YunwuChatApi } from '../lib/yunwu-chat';
import type { GeminiVisionClient } from '../lib/gemini-vision';
import type { GeminiVideoClient } from '../lib/gemini-video';
import type { ImageProxyClient } from '../lib/imageproxy';
import type { VideoApi } from '../lib/video-api';
import type { VisionDescribeRequest } from '../types';
import { json, jsonError, readJson } from '../http/json';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function pickNonEmptyId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const s = value.trim();
    return s ? s : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function extractUpscaleCustomIdFromTask(raw: any, index: number): string | undefined {
  const buttons = raw?.buttons ?? raw?.result?.buttons ?? raw?.properties?.buttons ?? raw?.result?.properties?.buttons;
  if (!Array.isArray(buttons) || !buttons.length) return undefined;

  const labelTarget = `U${Number(index)}`;
  for (const b of buttons) {
    const cid = pickNonEmptyId(b?.customId ?? b?.custom_id);
    const label = pickNonEmptyId(b?.label);
    if (cid && label === labelTarget) return cid;
  }

  const prefix = `MJ::JOB::upsample::${Number(index)}::`;
  for (const b of buttons) {
    const cid = pickNonEmptyId(b?.customId ?? b?.custom_id);
    if (cid && cid.startsWith(prefix)) return cid;
  }

  return undefined;
}

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

function normalizeGeminiImageInput(req: Request, rawValue: string): string {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;

  const serverOrigin = new URL(req.url).origin;

  // Only allow local uploads explicitly, but fetch them via our own /api/image to avoid exposing filesystem paths.
  if (raw.startsWith('/uploads/')) {
    return new URL(`/api/image?src=${encodeURIComponent(raw)}`, req.url).toString();
  }

  // Allow explicitly using our image proxy endpoint (same-origin only).
  if (raw.startsWith('/api/image?')) {
    return new URL(raw, req.url).toString();
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    let absolute: URL;
    try {
      absolute = new URL(raw);
    } catch {
      return '';
    }
    // Allow same-origin URLs only when they point to our own safe endpoints.
    if (absolute.origin === serverOrigin) {
      if (absolute.pathname.startsWith('/uploads/')) {
        return new URL(`/api/image?src=${encodeURIComponent(absolute.pathname)}`, req.url).toString();
      }
      if (absolute.pathname.startsWith('/api/image')) {
        return absolute.toString();
      }
    }
    if (isUnsafeHost(absolute.hostname)) return '';
    return absolute.toString();
  }

  // Reject other relative paths to avoid SSRF to internal endpoints.
  return '';
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

function normalizeNonImageExt(ext: string): string {
  return String(ext || '').toLowerCase();
}

const allowedUploadExts = new Set([
  // images (still sniffed)
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // video
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  // audio
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  // text
  '.txt',
  '.srt',
]);

function parseYoutubeTitleDescription(text: string): { title: string; description: string } {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return { title: '', description: '' };

  const titleMatch = raw.match(/(?:^|\n)\s*TITLE\s*:\s*/i);
  const descMatch = raw.match(/(?:^|\n)\s*DESCRIPTION\s*:\s*/i);

  if (titleMatch && descMatch && typeof titleMatch.index === 'number' && typeof descMatch.index === 'number') {
    const titleStart = (titleMatch.index ?? 0) + titleMatch[0].length;
    const descStart = (descMatch.index ?? 0) + descMatch[0].length;
    if (descStart > titleStart) {
      const titleBlock = raw.slice(titleStart, descMatch.index).trim();
      const titleLine = titleBlock.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
      const description = raw.slice(descStart).trim();
      return { title: titleLine, description };
    }
  }

  // Fallback: first non-empty line as title, rest as description.
  const lines = raw.split('\n').map((l) => l.trim());
  const first = lines.find((l) => Boolean(l)) || '';
  const rest = lines.slice(lines.indexOf(first) + 1).join('\n').trim();
  return { title: first, description: rest };
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

async function runPythonAdd(a: number, b: number): Promise<{ a: number; b: number; sum: number; engine: 'python3' }> {
  const pyCode = [
    'import json',
    'import sys',
    'a = float(sys.argv[1])',
    'b = float(sys.argv[2])',
    's = a + b',
    'if s.is_integer():',
    '    s = int(s)',
    'print(json.dumps({"sum": s}, ensure_ascii=False))',
  ].join('\n');

  const proc = Bun.spawn(['python3', '-c', pyCode, String(a), String(b)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Python 执行失败（exit=${code}）${stderr?.trim() ? `: ${stderr.trim()}` : ''}`);
  }

  const raw = (await new Response(proc.stdout).text()).trim();
  const parsed = JSON.parse(raw || '{}');
  const sum = Number(parsed?.sum);
  if (!Number.isFinite(sum)) throw new Error('Python 输出解析失败');
  return { a, b, sum, engine: 'python3' };
}

function isLikelyAdditionQuery(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const normalized = raw.replace(/\s+/g, '').replace(/[＝]/g, '=').replace(/[？]/g, '?');
  // Match patterns like: 1+2, 1.2+3.22313=?, -10+2？
  return /^[-+]?\d+(?:\.\d+)?\+[-+]?\d+(?:\.\d+)?(?:[=?])?$/.test(normalized);
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
          const format = String(url.searchParams.get('format') || '').trim().toLowerCase();
          const download = String(url.searchParams.get('download') || '').trim();
          const nameHint = String(url.searchParams.get('name') || '').trim();

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

          if (format === 'jpeg' || format === 'jpg') {
            const qRaw = Number(url.searchParams.get('quality') || '');
            const quality = Number.isFinite(qRaw) ? Math.max(40, Math.min(95, Math.round(qRaw))) : 88;
            try {
              const out = await sharp(bytes).flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer();
              bytes = new Uint8Array(out);
              contentType = 'image/jpeg';
            } catch (error) {
              console.error('Image convert error:', error);
              return jsonError({ status: 500, description: '图片转换失败（jpeg）', error });
            }
          }

          const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800',
          };
          if (download === '1' || download.toLowerCase() === 'true') {
            const safe = (v: string) => String(v || '').trim().replace(/[^\w.-]+/g, '_') || 'image';
            const base = safe(nameHint || 'image');
            const filename = format === 'jpeg' || format === 'jpg' ? `${base}.jpg` : base;
            headers['Content-Disposition'] = `attachment; filename="${filename}"`;
          }

	        return new Response(new Blob([Uint8Array.from(bytes)]), {
	          headers,
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
          return new Response(new Blob([Uint8Array.from(out)]), {
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
        return new Response(new Blob([Uint8Array.from(out)]), {
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

        await mkdir(deps.uploads.dir, { recursive: true });
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const extFromName = extname(file.name || '');
        const loweredExt = normalizeNonImageExt(extFromName);

        // Allow extension-less images by sniffing.
        const isImageExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(loweredExt);
        let ext = loweredExt;
        if (!ext) {
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) {
            return jsonError({ status: 400, description: `不支持的文件类型：${extFromName || '(无扩展名)'}` });
          }
          ext = normalizeImageExt(sniffedExt);
        }

        if (!allowedUploadExts.has(ext)) {
          return jsonError({ status: 400, description: `不支持的文件类型：${extFromName || '(无扩展名)'}` });
        }

        // Images: sniff bytes for safety (avoid mismatched extension).
        if (['.png', '.jpg', '.webp', '.gif'].includes(normalizeImageExt(ext))) {
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) {
            return jsonError({ status: 400, description: '图片格式不支持或文件已损坏（仅支持 PNG/JPG/WEBP/GIF）' });
          }
          const normalizedSniff = normalizeImageExt(sniffedExt);
          const normalizedNameExt = normalizeImageExt(ext);
          ext = normalizeImageExt(ext || sniffedExt);
          if (normalizedSniff !== normalizedNameExt) {
            return jsonError({ status: 400, description: '图片文件扩展名与内容不匹配，请重新上传' });
          }
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
        // Allow uuid-based keys with an optional safe suffix (e.g. "<uuid>.png", "<uuid>_pro.wav")
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:[._-][a-zA-Z0-9][a-zA-Z0-9._-]{0,96})?$/.test(localKey)) {
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

    if (pathname === '/api/upload/cleanup' && req.method === 'POST') {
      try {
        const body = await readJson<{ keepLocalKeys?: unknown; minAgeSeconds?: unknown }>(req);
        const rawList = Array.isArray(body.keepLocalKeys) ? body.keepLocalKeys : [];
        const keep = new Set<string>();
        for (const it of rawList.slice(0, 5000)) {
          const key = String(it || '').trim();
          if (
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:[._-][a-zA-Z0-9][a-zA-Z0-9._-]{0,96})?$/.test(
              key
            )
          ) {
            keep.add(key);
          }
        }

        const hasMinAge = Object.prototype.hasOwnProperty.call(body as any, 'minAgeSeconds');
        const minAgeSecondsRaw = hasMinAge
          ? typeof body.minAgeSeconds === 'number'
            ? body.minAgeSeconds
            : Number(String(body.minAgeSeconds || '').trim() || 0)
          : 24 * 3600; // default: keep very recent files to avoid accidental deletion
        const minAgeMs = Number.isFinite(minAgeSecondsRaw) && minAgeSecondsRaw > 0 ? Math.floor(minAgeSecondsRaw * 1000) : 0;
        const now = Date.now();

        let deleted = 0;
        let scanned = 0;
        const deletedKeys: string[] = [];

        let entries: Array<{ name: string }> = [];
        try {
          const dirents = await readdir(deps.uploads.dir, { withFileTypes: true });
          entries = dirents.filter((d) => d.isFile()).map((d) => ({ name: d.name }));
        } catch {
          // uploads dir may not exist yet
          return json({ code: 0, description: 'OK', result: { scanned: 0, deleted: 0, deletedKeys: [] } });
        }

        for (const ent of entries) {
          const name = ent.name;
          scanned++;
          if (keep.has(name)) continue;
          if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:[._-][a-zA-Z0-9][a-zA-Z0-9._-]{0,96})?$/.test(name)) continue;

          const p = join(deps.uploads.dir, name);
          if (minAgeMs > 0) {
            try {
              const st = await stat(p);
              const age = now - st.mtimeMs;
              if (age < minAgeMs) continue;
            } catch {
              // If we can't stat, attempt delete anyway.
            }
          }

          try {
            await unlink(p);
            deleted++;
            deletedKeys.push(name);
          } catch {
            // ignore
          }
        }

        return json({ code: 0, description: 'OK', result: { scanned, deleted, deletedKeys } });
      } catch (error) {
        console.error('Upload cleanup error:', error);
        return jsonError({ status: 500, description: '清理失败', error });
      }
    }

    if (
      (pathname === '/api/audio/process' && req.method === 'POST') ||
      (pathname === '/api/video/process' && req.method === 'POST') ||
      ((pathname === '/api/mv/compose' || pathname === '/api/mv/compose/plan') && req.method === 'POST') ||
      (req.method === 'GET' && /^\/api\/media\/task\/[^/]+$/.test(pathname))
    ) {
      return jsonError({ status: 410, description: '该功能已下线（仅保留 Gemini / Sora 视频）' });
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

        // yunwu.ai 的 action 接口需要使用 task.buttons 里提供的 customId（包含 messageId 等上下文）
        let customId: string | undefined;
        try {
          const task = await deps.mjApi.queryTask(taskId);
          customId = extractUpscaleCustomIdFromTask(task, index);
        } catch (error) {
          console.warn('queryTask before upscale failed:', error);
        }

        if (!customId) customId = `MJ::JOB::upsample::${index}::${taskId}`;

        const payload = {
          chooseSameChannel: false,
          customId,
          taskId,
          notifyHook: '',
          state: '',
        };

        // yunwu.ai occasionally returns blank upstream_error for action; retry a few times before giving up.
        let result: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
          result = await deps.mjApi.upscale(payload);
          const type = typeof result?.type === 'string' ? result.type : '';
          const desc = typeof result?.description === 'string' ? result.description.trim() : '';
          if (!(type && /error/i.test(type) && !desc && attempt < 3)) break;
          await sleep(500 * attempt);
        }

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

        const normalized = normalizeGeminiImageInput(req, String(imageUrl || ''));
        if (!normalized) return jsonError({ status: 400, description: 'imageUrl 不合法（仅支持 data:image/* /uploads/* 或安全的 http(s)）' });
        const prompt = await deps.gemini.imageToPrompt(normalized);
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
        const body = await readJson<{ messages?: Array<{ role?: string; content?: string }>; model?: string }>(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!messages.length) return jsonError({ status: 400, description: 'messages 不能为空' });
        const modelRaw = String(body.model || '').trim();
        const model = modelRaw === 'gemini-3-pro-preview' || modelRaw === 'gemini-3-flash-preview' ? modelRaw : 'gemini-3-flash-preview';
        const text = await deps.gemini.chat(
          messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') })),
          model
        );
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini chat error:', error);
        return jsonError({ status: 500, description: 'Gemini 对话失败', error });
      }
    }

    if (pathname === '/api/gemini/planner' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ messages?: Array<{ role?: string; content?: string }>; model?: string }>(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!messages.length) return jsonError({ status: 400, description: 'messages 不能为空' });
        const modelRaw = String(body.model || '').trim();
        const model = modelRaw === 'gemini-3-pro-preview' || modelRaw === 'gemini-3-flash-preview' ? modelRaw : 'gemini-3-flash-preview';
        const text = await deps.gemini.plannerChat(
          messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') })),
          model
        );
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini planner error:', error);
        return jsonError({ status: 500, description: 'Gemini 规划失败', error });
      }
    }

    if (pathname === '/api/gemini/mv-storyboard' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ requirement?: string }>(req);
        const requirement = String(body.requirement || '').trim();
        if (!requirement) return jsonError({ status: 400, description: 'requirement 不能为空' });

        const text = await deps.gemini.mvStoryboard({ requirement });
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini mv storyboard error:', error);
        return jsonError({ status: 500, description: 'MV 分镜生成失败', error });
      }
    }

    if (pathname === '/api/gemini/suno' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ requirement?: string; imageUrls?: string[]; mode?: string; language?: string }>(req);
        const requirement = String(body.requirement || '').trim();
        if (!requirement) return jsonError({ status: 400, description: 'requirement 不能为空' });

        const rawUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map((u) => String(u || '').trim()).filter(Boolean) : [];
        const imageUrls = rawUrls.map((u) => normalizeGeminiImageInput(req, u)).filter(Boolean).slice(0, 8);
        if (rawUrls.length && !imageUrls.length) {
          return jsonError({ status: 400, description: '图片 URL 不合法（仅支持 data:image/* /uploads/* 或安全的 http(s)）' });
        }

        const modeRaw = String((body as any).mode || '').trim().toLowerCase();
        const languageRaw = String((body as any).language || '').trim().toLowerCase();
        const mode = modeRaw === 'instrumental' || modeRaw === 'lyrics' || modeRaw === 'auto' ? modeRaw : undefined;
        const language =
          languageRaw === 'auto' || languageRaw === 'en' || languageRaw === 'zh-cn' || languageRaw === 'zh-tw' || languageRaw === 'ja' || languageRaw === 'ko'
            ? languageRaw
            : undefined;

        const text = await deps.gemini.sunoPrompt({ requirement, imageUrls, mode, language });
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini suno error:', error);
        return jsonError({ status: 500, description: 'Suno 提示词生成失败', error });
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

    if (pathname === '/api/gemini/youtube' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }

        const body = await readJson<{
          topic?: string;
          extra?: string;
          imageUrls?: string[];
          language?: string;
        }>(req);

        const topic = String(body.topic || '').trim();
        const extra = String(body.extra || '').trim();
        const language = typeof body.language === 'string' ? body.language : undefined;
        if (!topic) return jsonError({ status: 400, description: 'topic 不能为空' });

        const imageUrls = Array.isArray(body.imageUrls)
          ? body.imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
          : [];
        const normalizedImageUrls = imageUrls.map((u) => normalizeGeminiImageInput(req, u)).filter(Boolean);
        if (imageUrls.length && !normalizedImageUrls.length) {
          return jsonError({ status: 400, description: 'imageUrls 不合法（仅支持 data:image/* /uploads/* 或安全的 http(s)）' });
        }

        const text = await deps.gemini.youtubeMeta({
          topic,
          extra: extra || undefined,
          imageUrls: normalizedImageUrls,
          language,
        });

        const parsed = parseYoutubeTitleDescription(text);
        return json({ code: 0, description: '成功', result: { title: parsed.title, description: parsed.description, text } });
      } catch (error) {
        console.error('Gemini youtube error:', error);
        return jsonError({ status: 500, description: 'YouTube 标题/简介生成失败', error });
      }
    }

    if (pathname === '/api/gemini/pro-image' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }

        const body = await readJson<{
          prompt?: string;
          imageUrls?: string[];
          aspectRatio?: string;
          imageSize?: string;
        }>(req);

        const prompt = String(body.prompt || '').trim();
        if (!prompt) return jsonError({ status: 400, description: 'prompt 不能为空' });

        const imageUrls = Array.isArray(body.imageUrls)
          ? body.imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
          : [];
        const normalizedImageUrls = imageUrls.map((u) => normalizeGeminiImageInput(req, u)).filter(Boolean);
        if (imageUrls.length && !normalizedImageUrls.length) {
          return jsonError({ status: 400, description: 'imageUrls 不合法（仅支持 data:image/* /uploads/* 或安全的 http(s)）' });
        }

        const outputs = await deps.gemini.generateOrEditImages({
          prompt,
          imageUrls: normalizedImageUrls,
          aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined,
          imageSize: typeof body.imageSize === 'string' ? body.imageSize : undefined,
          responseModalities: ['IMAGE'],
        });

        if (!outputs.length) {
          return jsonError({ status: 502, description: 'Gemini 未返回图片' });
        }

        await mkdir(deps.uploads.dir, { recursive: true });

        const saved: Array<{ url: string; localUrl: string; localKey: string; mimeType: string }> = [];
        for (const img of outputs) {
          const mimeType = String(img.mimeType || 'image/png');
          const bytes = new Uint8Array(Buffer.from(String(img.data || ''), 'base64'));
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) continue;

          const ext = normalizeImageExt(sniffedExt);
          const localKey = `${randomUUID()}${ext}`;
          const safeKey = basename(localKey);
          const localPath = join(deps.uploads.dir, safeKey);
          const localUrl = `${deps.uploads.publicPath}/${safeKey}`;
          await writeFile(localPath, bytes);
          saved.push({ url: localUrl, localUrl, localKey: safeKey, mimeType: mimeFromImageExt(ext) });
        }

        if (!saved.length) {
          return jsonError({ status: 502, description: 'Gemini 返回的图片格式不支持' });
        }

        return json({ code: 0, description: '成功', result: { images: saved } });
      } catch (error) {
        console.error('Gemini pro-image error:', error);
        return jsonError({ status: 500, description: 'Gemini 生图/编辑失败', error });
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

        const normalized = normalizeGeminiImageInput(req, String(imageUrl || ''));
        if (!normalized) return jsonError({ status: 400, description: 'imageUrl 不合法（仅支持 data:image/* /uploads/* 或安全的 http(s)）' });
        const result = await deps.gemini.editImage(normalized, editPrompt);
        if (!result) return jsonError({ status: 500, description: '图片编辑失败，未返回图片' });

        return json({ code: 0, description: '成功', result: { imageDataUrl: result } });
      } catch (error) {
        console.error('Gemini edit error:', error);
        return jsonError({ status: 500, description: 'Gemini 编辑失败', error });
      }
    }

    if (pathname === '/api/ai/chat' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }

        const body = await readJson<{ messages?: Array<{ role?: string; content?: string }>; model?: string }>(req);
        const baseMessages = Array.isArray(body.messages)
          ? body.messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '').trim() })).filter((m) => Boolean(m.content))
          : [];
        if (!baseMessages.length) return jsonError({ status: 400, description: 'messages 不能为空' });

        const modelRaw = String(body.model || '').trim();
        const model = modelRaw === 'gemini-3-pro-preview' || modelRaw === 'gemini-3-flash-preview' ? modelRaw : 'gemini-3-flash-preview';
        const latestUserContent = [...baseMessages].reverse().find((m) => m.role === 'user')?.content || '';
        const forceToolForMath = isLikelyAdditionQuery(latestUserContent);

        const system = [
          'You are a helpful assistant.',
          'You can decide whether to use tools via function calling.',
          '',
          'Available tool:',
          '- py_add(a:number, b:number): returns exact numeric sum.',
          '',
          'Decision policy:',
          '- For numeric addition requests, especially decimal precision like "1.2+3.22313", always call py_add.',
          '- For non-addition requests, answer directly unless a tool is necessary.',
          '',
          'Reply in the user language.',
        ].join('\n');

        let finalText = '';
        const toolTrace: Array<{ name: string; arguments: Record<string, unknown>; result?: unknown; error?: string }> = [];
        const firstTurn = await deps.gemini.chatWithTools({
          messages: baseMessages,
          model,
          system,
          functionDeclarations: [
            {
              name: 'py_add',
              description: 'Perform exact numeric addition for two numbers and return the sum.',
              parametersJsonSchema: {
                type: 'object',
                properties: {
                  a: { type: 'number', description: 'First addend' },
                  b: { type: 'number', description: 'Second addend' },
                },
                required: ['a', 'b'],
              },
            },
          ],
          mode: forceToolForMath ? 'ANY' : 'AUTO',
        });

        const calls = firstTurn.functionCalls.slice(0, 8);
        if (!calls.length) {
          finalText = String(firstTurn.text || '').trim();
        } else {
          const toolResults: Array<Record<string, unknown>> = [];

          for (const call of calls) {
            const name = String(call?.name || '').trim();
            const args = call?.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};

            if (name !== 'py_add') {
              const err = `未知工具: ${name || '(empty)'}`;
              toolTrace.push({ name: name || 'unknown', arguments: args, error: err });
              toolResults.push({ id: call.id, name, ok: false, error: err });
              continue;
            }

            const a = Number((args as any)?.a);
            const b = Number((args as any)?.b);
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
              const err = 'py_add 参数非法，a/b 必须是数字';
              toolTrace.push({ name: 'py_add', arguments: args, error: err });
              toolResults.push({ id: call.id, name: 'py_add', ok: false, error: err, arguments: args });
              continue;
            }

            try {
              const result = await runPythonAdd(a, b);
              toolTrace.push({ name: 'py_add', arguments: { a, b }, result });
              toolResults.push({ id: call.id, name: 'py_add', ok: true, result });
            } catch (error) {
              const err = (error as Error)?.message || 'py_add 执行失败';
              toolTrace.push({ name: 'py_add', arguments: { a, b }, error: err });
              toolResults.push({ id: call.id, name: 'py_add', ok: false, error: err, arguments: { a, b } });
            }
          }

          const followUpSystem = [
            'You are a helpful assistant.',
            'Tool execution results are authoritative.',
            'Use tool results to answer naturally and accurately.',
            'Do not output JSON unless the user explicitly requests JSON.',
            'If any tool failed, explain the issue briefly and ask for corrected input.',
            'Reply in the user language.',
          ].join('\n');

          const followUpMessages: Array<{ role: string; content: string }> = [...baseMessages];
          if (String(firstTurn.text || '').trim()) {
            followUpMessages.push({ role: 'assistant', content: String(firstTurn.text || '').trim() });
          }
          followUpMessages.push({
            role: 'user',
            content: `TOOL_EXECUTION_RESULTS_JSON:\n${JSON.stringify(toolResults)}`,
          });

          finalText = await deps.gemini.chat(followUpMessages, model, followUpSystem);
        }

        if (!finalText) {
          finalText = '我尝试了技能调度，但没有得到稳定的最终回答。请再描述一次或直接给出数字。';
        }

        return json({ code: 0, description: '成功', result: { text: finalText, toolTrace } });
      } catch (error) {
        console.error('AI chat error:', error);
        return jsonError({ status: 500, description: 'AI 对话失败', error });
      }
    }

    if (pathname === '/api/ai/skill/py-add' && req.method === 'POST') {
      try {
        const body = await readJson<{ a?: unknown; b?: unknown }>(req);
        const a = Number(body?.a);
        const b = Number(body?.b);
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
          return jsonError({ status: 400, description: 'a 和 b 必须是数字' });
        }
        const result = await runPythonAdd(a, b);
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('AI py-add skill error:', error);
        return jsonError({ status: 500, description: 'Python 加法技能失败', error });
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
        if (provider !== 'gemini' && provider !== 'sora') {
          return jsonError({ status: 400, description: '当前仅支持 Gemini / Sora 视频' });
        }

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
          provider: provider as 'sora' | 'gemini',
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
        if (provider !== 'gemini' && provider !== 'sora') {
          return jsonError({ status: 400, description: '当前仅支持 Gemini / Sora 视频' });
        }

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

        const result = await deps.videoApi.queryVideo({ provider: provider as 'sora' | 'gemini', id });
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('Video query error:', error);
        return jsonError({ status: 500, description: '生视频查询失败', error });
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

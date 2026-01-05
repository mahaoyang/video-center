import type { MJApi } from '../lib/mj-api';
import type { YunwuChatApi } from '../lib/yunwu-chat';
import type { GeminiVisionClient } from '../lib/gemini-vision';
import type { ImageProxyClient } from '../lib/imageproxy';
import type { VisionDescribeRequest } from '../types';
import { json, jsonError, readJson } from '../http/json';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

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

export function createApiRouter(deps: {
  mjApi: MJApi;
  chatApi: YunwuChatApi;
  gemini: GeminiVisionClient;
  imageproxy: ImageProxyClient;
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

    if (pathname === '/api/health' && req.method === 'GET') {
      return json({ ok: true, auth: deps.auth, meta: deps.meta });
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
        const ext = (extFromName || sniffedExt).toLowerCase();
        if (extFromName && sniffedExt !== extFromName.toLowerCase()) {
          return jsonError({ status: 400, description: '图片文件扩展名与内容不匹配，请重新上传' });
        }

        const localKey = `${randomUUID()}${ext}`;
        const safeKey = basename(localKey);
        const localPath = join(deps.uploads.dir, safeKey);
        const localUrl = `${deps.uploads.publicPath}/${safeKey}`;

        await writeFile(localPath, bytes);

        let cdnUrl: string | undefined;
        if (deps.auth.imageproxyConfigured) {
          try {
            const uploaded = await deps.imageproxy.upload(file);
            cdnUrl = uploaded?.url ? String(uploaded.url) : undefined;
          } catch (error) {
            console.warn('imageproxy upload failed:', error);
          }
        }

        const url = cdnUrl || localUrl;
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
          return jsonError({ status: 500, description: '未配置 MJ_API_TOKEN' });
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
          return jsonError({ status: 500, description: '未配置 Token：请设置 LLM_API_TOKEN 或 MJ_API_TOKEN' });
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
          return jsonError({ status: 500, description: '未配置 MJ_API_TOKEN' });
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
          return jsonError({ status: 500, description: '未配置 MJ_API_TOKEN' });
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
          return jsonError({ status: 500, description: '未配置 MJ_API_TOKEN' });
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

    return new Response('Not Found', { status: 404 });
  };
}

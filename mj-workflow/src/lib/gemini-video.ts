import { GoogleGenAI } from '@google/genai';

export interface GeminiVideoClient {
  generate(params: {
    model: string;
    prompt: string;
    startImageUrl?: string;
    endImageUrl?: string;
    durationSeconds?: number;
    aspectRatio?: string;
    resolution?: string;
  }): Promise<{ operationName: string; raw: unknown }>;

  getOperation(params: { operationName: string }): Promise<{ done: boolean; error?: unknown; metadata?: unknown; response?: unknown }>;

  downloadVideo(params: { file: unknown; downloadPath: string }): Promise<void>;
}

function isImageContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ imageBytes: string; mimeType: string }> {
  const src = String(imageUrl || '').trim();
  if (!src) throw new Error('imageUrl 不能为空');

  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;,]+)[;,]/);
    const mimeType = match?.[1] || 'image/png';
    const base64 = src.split(',')[1] || '';
    if (!base64) throw new Error('dataUrl 缺少 base64');
    return { imageBytes: base64, mimeType };
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
  const contentType = res.headers.get('content-type');
  if (contentType && !isImageContentType(contentType)) {
    throw new Error(`Fetch image failed: non-image content-type ${contentType}`);
  }
  const buffer = await res.arrayBuffer();
  return {
    imageBytes: Buffer.from(buffer).toString('base64'),
    mimeType: contentType || 'image/png',
  };
}

function normalizeResolution(input: string | undefined): string | undefined {
  const raw = String(input || '').trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper === '1080P') return '1080p';
  if (upper === '720P') return '720p';
  if (raw === '1080p' || raw === '720p') return raw;
  return raw;
}

export function createGeminiVideoClient(opts: { apiKey?: string | undefined }): GeminiVideoClient {
  let ai: GoogleGenAI | null = null;

  function getAi(): GoogleGenAI {
    if (ai) return ai;

    // Prefer Vertex AI env config (Veo is typically hosted on Vertex AI).
    const useVertex = String(process.env.GOOGLE_GENAI_USE_VERTEXAI || '').toLowerCase() === 'true';
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION;
    if (useVertex || (project && location)) {
      ai = new GoogleGenAI({
        vertexai: true,
        project: project || undefined,
        location: location || undefined,
        apiVersion: 'v1',
      } as any);
      return ai;
    }

    if (!opts.apiKey) {
      throw new Error('Gemini 视频生成需要 Vertex AI 环境变量或 Gemini_KEY（但 Veo 通常要求 Vertex AI）');
    }
    ai = new GoogleGenAI({ apiKey: opts.apiKey });
    return ai;
  }

  return {
    async generate(params) {
      const model = String(params.model || '').trim();
      const prompt = String(params.prompt || '').trim();
      if (!model) throw new Error('model 不能为空');
      if (!prompt) throw new Error('prompt 不能为空');

      const source: any = { prompt };
      if (params.startImageUrl) {
        source.image = await fetchImageAsBase64(params.startImageUrl);
      }

      const config: any = { numberOfVideos: 1 };
      if (typeof params.durationSeconds === 'number' && Number.isFinite(params.durationSeconds) && params.durationSeconds > 0) {
        config.durationSeconds = Math.floor(params.durationSeconds);
      }
      if (typeof params.aspectRatio === 'string' && params.aspectRatio.trim()) {
        config.aspectRatio = params.aspectRatio.trim();
      }
      const resolution = normalizeResolution(params.resolution);
      if (resolution) config.resolution = resolution;
      if (params.endImageUrl) {
        config.lastFrame = await fetchImageAsBase64(params.endImageUrl);
      }

      const operation: any = await getAi().models.generateVideos({
        model,
        source,
        config,
      } as any);

      const operationName = String(operation?.name || '').trim();
      if (!operationName) throw new Error('generateVideos 未返回 operation.name');
      return { operationName, raw: operation };
    },

    async getOperation(params) {
      const operationName = String(params.operationName || '').trim();
      if (!operationName) throw new Error('operationName 不能为空');
      const operation: any = { name: operationName };
      const updated: any = await getAi().operations.getVideosOperation({ operation } as any);
      return { done: Boolean(updated?.done), error: updated?.error, metadata: updated?.metadata, response: updated?.response };
    },

    async downloadVideo(params) {
      const downloadPath = String(params.downloadPath || '').trim();
      if (!downloadPath) throw new Error('downloadPath 不能为空');
      await getAi().files.download({ file: params.file as any, downloadPath } as any);
    },
  };
}

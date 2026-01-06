export type VideoProvider = 'jimeng' | 'kling' | 'gemini';

export interface VideoCreateParams {
  provider: VideoProvider;
  prompt: string;
  model?: string;
  seconds?: number;
  mode?: string;
  aspect?: string;
  size?: string;
  startImageUrl?: string;
  endImageUrl?: string;
}

export interface VideoCreateResult {
  provider: VideoProvider;
  id: string;
  raw: unknown;
}

export interface VideoQueryParams {
  provider: VideoProvider;
  id: string;
}

export interface VideoQueryResult {
  provider: VideoProvider;
  id: string;
  status: string;
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  raw: unknown;
}

function normalizeBaseUrl(url: string): string {
  return String(url || '').replace(/\/$/, '');
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s ? s : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickObj(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' ? (value as any) : undefined;
}

function extractIdFromCreate(provider: VideoProvider, raw: any): string | undefined {
  if (!raw) return undefined;

  if (provider === 'kling') {
    return (
      pickString(raw?.task_id) ||
      pickString(raw?.taskId) ||
      pickString(raw?.data?.task_id) ||
      pickString(raw?.data?.taskId) ||
      pickString(raw?.result?.task_id) ||
      pickString(raw?.result?.taskId)
    );
  }

  // jimeng/gemini via /v1/video/create
  return (
    pickString(raw?.id) ||
    pickString(raw?.data?.id) ||
    pickString(raw?.result?.id) ||
    pickString(raw?.video_id) ||
    pickString(raw?.data?.video_id) ||
    pickString(raw?.result?.video_id)
  );
}

function extractStatusFromQuery(raw: any): string {
  const s =
    pickString(raw?.status) ||
    pickString(raw?.data?.status) ||
    pickString(raw?.result?.status) ||
    pickString(raw?.properties?.status) ||
    pickString(raw?.result?.properties?.status) ||
    '';
  return s || 'processing';
}

function extractProgressFromQuery(raw: any): number | undefined {
  return (
    pickNumber(raw?.progress) ||
    pickNumber(raw?.data?.progress) ||
    pickNumber(raw?.result?.progress) ||
    pickNumber(raw?.properties?.progress) ||
    pickNumber(raw?.result?.properties?.progress)
  );
}

function extractVideoUrlFromQuery(raw: any): string | undefined {
  return (
    pickString(raw?.video_url) ||
    pickString(raw?.videoUrl) ||
    pickString(raw?.data?.video_url) ||
    pickString(raw?.data?.videoUrl) ||
    pickString(raw?.result?.video_url) ||
    pickString(raw?.result?.videoUrl) ||
    pickString(raw?.properties?.video_url) ||
    pickString(raw?.properties?.videoUrl)
  );
}

function extractThumbUrlFromQuery(raw: any): string | undefined {
  return (
    pickString(raw?.thumbnail_url) ||
    pickString(raw?.thumbnailUrl) ||
    pickString(raw?.data?.thumbnail_url) ||
    pickString(raw?.data?.thumbnailUrl) ||
    pickString(raw?.result?.thumbnail_url) ||
    pickString(raw?.result?.thumbnailUrl)
  );
}

export class VideoApi {
  private apiUrl: string;
  private token: string;

  constructor(config: { apiUrl: string; token: string }) {
    this.apiUrl = normalizeBaseUrl(config.apiUrl);
    this.token = String(config.token || '');
  }

  private async fetchJson(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, init);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      const text = await res.text();
      json = { status: res.status, text };
    }
    if (!res.ok) {
      const detail = pickObj(json);
      const message = pickString((detail as any)?.message) || pickString((detail as any)?.error) || res.statusText || 'upstream error';
      throw new Error(`${res.status} ${message}`);
    }
    return json;
  }

  async createVideo(params: VideoCreateParams): Promise<VideoCreateResult> {
    const provider = params.provider;
    const prompt = String(params.prompt || '').trim();
    if (!prompt) throw new Error('prompt 不能为空');

    if (!this.token) throw new Error('未配置 YUNWU_ALL_KEY / LLM_API_TOKEN');

    if (provider === 'kling') {
      const image = pickString(params.startImageUrl);
      if (!image) throw new Error('Kling 需要 start frame（起始帧图片 URL）');
      const payload: Record<string, any> = {
        model_name: pickString(params.model) || 'kling-v2-6',
        image,
        prompt,
        mode: pickString(params.mode) || 'std',
        duration: String(Math.max(1, Math.floor(pickNumber(params.seconds) || 5))),
      };
      const tail = pickString(params.endImageUrl);
      if (tail) payload.image_tail = tail;

      const raw = await this.fetchJson('/kling/v1/videos/image2video', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const id = extractIdFromCreate(provider, raw);
      if (!id) throw new Error('Kling 提交失败：未返回 task_id');
      return { provider, id, raw };
    }

    // jimeng / gemini (generic /v1/video/create)
    const payload: Record<string, any> = {
      model: pickString(params.model) || (provider === 'jimeng' ? 'jimeng-video-3.0' : 'gemini-video'),
      prompt,
    };

    const images: string[] = [];
    const start = pickString(params.startImageUrl);
    const end = pickString(params.endImageUrl);
    if (start) images.push(start);
    if (end && end !== start) images.push(end);
    if (images.length) payload.images = images;

    const aspect = pickString(params.aspect);
    const size = pickString(params.size);
    const seconds = pickNumber(params.seconds);

    if (provider === 'jimeng') {
      if (aspect) payload.aspect_ratio = aspect;
      if (size) payload.size = size;
    } else {
      // gemini: keep optional fields loose; only attach if explicitly provided.
      if (aspect) payload.aspect_ratio = aspect;
      if (size) payload.size = size;
      if (seconds) payload.duration = Math.max(1, Math.floor(seconds));
    }

    const raw = await this.fetchJson('/v1/video/create', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const id = extractIdFromCreate(provider, raw);
    if (!id) throw new Error('视频提交失败：未返回 id');
    return { provider, id, raw };
  }

  async queryVideo(params: VideoQueryParams): Promise<VideoQueryResult> {
    const provider = params.provider;
    const id = String(params.id || '').trim();
    if (!id) throw new Error('id 不能为空');
    if (!this.token) throw new Error('未配置 YUNWU_ALL_KEY / LLM_API_TOKEN');

    let raw: unknown;
    if (provider === 'kling') {
      raw = await this.fetchJson(`/kling/v1/videos/image2video/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` },
      });
    } else {
      raw = await this.fetchJson(`/v1/video/query?id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` },
      });
    }

    const status = extractStatusFromQuery(raw);
    const progress = extractProgressFromQuery(raw);
    const videoUrl = extractVideoUrlFromQuery(raw);
    const thumbnailUrl = extractThumbUrlFromQuery(raw);

    return { provider, id, status, progress, videoUrl, thumbnailUrl, raw };
  }
}

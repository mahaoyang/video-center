export interface ApiClient {
  upload(file: File): Promise<any>;
  deleteUpload(params: { localKey: string }): Promise<any>;
  promoteUpload(params: { localKey: string }): Promise<any>;
  cleanupUploads(params: { keepLocalKeys: string[]; minAgeSeconds?: number }): Promise<any>;
  describe(params: { base64?: string; imageUrl?: string }): Promise<any>;
  visionDescribe(params: { imageUrl: string; question?: string; model?: string }): Promise<any>;
  geminiDescribe(params: { imageUrl: string }): Promise<any>;
  geminiChat(params: { messages: Array<{ role: string; content: string }>; model?: string }): Promise<any>;
  geminiPlanner(params: { messages: Array<{ role: string; content: string }>; model?: string }): Promise<any>;
  aiChat(params: { messages: Array<{ role: string; content: string }>; model?: string }): Promise<any>;
  geminiMvStoryboard(params: { requirement: string }): Promise<any>;
  geminiSuno(params: { requirement: string; imageUrls?: string[]; mode?: string; language?: string }): Promise<any>;
  geminiTranslate(params: { text: string }): Promise<any>;
  geminiBeautify(params: { text: string; hint?: string }): Promise<any>;
  geminiYoutube(params: { topic: string; extra?: string; imageUrls?: string[]; language?: string }): Promise<any>;
  geminiProImage(params: { prompt: string; imageUrls?: string[]; aspectRatio?: string; imageSize?: string }): Promise<any>;
  videoCreate(params: {
    provider: string;
    prompt: string;
    model?: string;
    seconds?: number;
    mode?: string;
    aspect?: string;
    size?: string;
    startImageUrl?: string;
    endImageUrl?: string;
  }): Promise<any>;
  videoQuery(params: { provider: string; id: string }): Promise<any>;
  imagine(params: { prompt: string; base64Array?: string[] }): Promise<any>;
  upscale(params: { taskId: string; index: number }): Promise<any>;
  task(taskId: string): Promise<any>;
  geminiEdit(params: { imageUrl: string; editPrompt: string }): Promise<any>;
}

function unwrapJsonStringOnce(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.replace(/^\uFEFF/, '').trim();
  if (!raw) return value;

  const tryParse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  if (raw.startsWith('{') || raw.startsWith('[')) {
    const parsed = tryParse(raw);
    return parsed === undefined ? value : parsed;
  }

  // Some upstreams prepend junk before a JSON object; attempt to parse the JSON-ish substring.
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  const start =
    firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (start === -1) return value;

  const tail = raw.slice(start);
  const parsed = tryParse(tail);
  return parsed === undefined ? value : parsed;
}

function normalizeUpstreamPayload(payload: any): any {
  const top = unwrapJsonStringOnce(payload);
  if (!top || typeof top !== 'object') return top;

  const maybeResult = (top as any).result;
  const unwrappedResult = unwrapJsonStringOnce(maybeResult);
  if (unwrappedResult !== maybeResult) return { ...(top as any), result: unwrappedResult };

  const maybeProps = (top as any).properties;
  const unwrappedProps = unwrapJsonStringOnce(maybeProps);
  if (unwrappedProps !== maybeProps) return { ...(top as any), properties: unwrappedProps };

  return top;
}

async function requestJson(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return normalizeUpstreamPayload(await res.json());
}

async function requestForm(url: string, form: FormData): Promise<any> {
  const res = await fetch(url, { method: 'POST', body: form });
  return normalizeUpstreamPayload(await res.json());
}

export function createApiClient(apiBase = '/api'): ApiClient {
  return {
    upload: async (file) => {
      const form = new FormData();
      form.set('file', file, file.name);
      return await requestForm(`${apiBase}/upload`, form);
    },
    deleteUpload: async (params) => await requestJson('POST', `${apiBase}/upload/delete`, params),
    promoteUpload: async (params) => await requestJson('POST', `${apiBase}/upload/promote`, params),
    cleanupUploads: async (params) => await requestJson('POST', `${apiBase}/upload/cleanup`, params),
    describe: async (params) => await requestJson('POST', `${apiBase}/describe`, params),
    visionDescribe: async (params) => await requestJson('POST', `${apiBase}/vision/describe`, params),
    geminiDescribe: async (params) => await requestJson('POST', `${apiBase}/gemini/describe`, params),
    geminiChat: async (params) => await requestJson('POST', `${apiBase}/gemini/chat`, params),
    geminiPlanner: async (params) => await requestJson('POST', `${apiBase}/gemini/planner`, params),
    aiChat: async (params) => await requestJson('POST', `${apiBase}/ai/chat`, params),
    geminiMvStoryboard: async (params) => await requestJson('POST', `${apiBase}/gemini/mv-storyboard`, params),
    geminiSuno: async (params) => await requestJson('POST', `${apiBase}/gemini/suno`, params),
    geminiTranslate: async (params) => await requestJson('POST', `${apiBase}/gemini/translate`, params),
    geminiBeautify: async (params) => await requestJson('POST', `${apiBase}/gemini/beautify`, params),
    geminiYoutube: async (params) => await requestJson('POST', `${apiBase}/gemini/youtube`, params),
    geminiProImage: async (params) => await requestJson('POST', `${apiBase}/gemini/pro-image`, params),
    videoCreate: async (params) => await requestJson('POST', `${apiBase}/video/create`, params),
    videoQuery: async (params) =>
      await requestJson(
        'GET',
        `${apiBase}/video/query?id=${encodeURIComponent(params.id)}&provider=${encodeURIComponent(params.provider)}`
      ),
    imagine: async (params) => await requestJson('POST', `${apiBase}/imagine`, params),
    upscale: async (params) => await requestJson('POST', `${apiBase}/upscale`, params),
    task: async (taskId) => await requestJson('GET', `${apiBase}/task/${encodeURIComponent(taskId)}`),
    geminiEdit: async (params) => await requestJson('POST', `${apiBase}/gemini/edit`, params),
  };
}

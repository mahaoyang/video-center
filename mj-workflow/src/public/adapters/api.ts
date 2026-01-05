export interface ApiClient {
  upload(file: File): Promise<any>;
  deleteUpload(params: { localKey: string }): Promise<any>;
  describe(params: { base64?: string; imageUrl?: string }): Promise<any>;
  visionDescribe(params: { imageUrl: string; question?: string; model?: string }): Promise<any>;
  geminiDescribe(params: { imageUrl: string }): Promise<any>;
  imagine(params: { prompt: string; base64Array?: string[] }): Promise<any>;
  upscale(params: { taskId: string; index: number }): Promise<any>;
  task(taskId: string): Promise<any>;
  geminiEdit(params: { imageUrl: string; editPrompt: string }): Promise<any>;
}

function unwrapJsonStringOnce(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.replace(/^\uFEFF/, '').trim();
  if (!text) return value;
  if (!(text.startsWith('{') || text.startsWith('['))) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
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
    describe: async (params) => await requestJson('POST', `${apiBase}/describe`, params),
    visionDescribe: async (params) => await requestJson('POST', `${apiBase}/vision/describe`, params),
    geminiDescribe: async (params) => await requestJson('POST', `${apiBase}/gemini/describe`, params),
    imagine: async (params) => await requestJson('POST', `${apiBase}/imagine`, params),
    upscale: async (params) => await requestJson('POST', `${apiBase}/upscale`, params),
    task: async (taskId) => await requestJson('GET', `${apiBase}/task/${encodeURIComponent(taskId)}`),
    geminiEdit: async (params) => await requestJson('POST', `${apiBase}/gemini/edit`, params),
  };
}

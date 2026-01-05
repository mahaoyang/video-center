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

async function requestJson(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return await res.json();
}

async function requestForm(url: string, form: FormData): Promise<any> {
  const res = await fetch(url, { method: 'POST', body: form });
  return await res.json();
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

/**
 * MJ API 封装
 */

import type {
  MJConfig,
  DescribeRequest,
  DescribeResponse,
  ImagineRequest,
  ImagineResponse,
  UpscaleRequest,
  UpscaleResponse,
  TaskQueryResponse,
} from '../types';

async function readResponseBody(res: Response): Promise<{ json: any | null; text: string | null }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return { json: await res.json(), text: null };
    } catch {
      // fall through
    }
  }
  try {
    return { json: null, text: await res.text() };
  } catch {
    return { json: null, text: null };
  }
}

async function fetchUpstreamJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const body = await readResponseBody(res);

  if (body.json !== null) {
    // Some upstreams mistakenly wrap JSON as a JSON-string. Attempt to unwrap once.
    if (typeof body.json === 'string') {
      const text = body.json.replace(/^\uFEFF/, '').trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          return JSON.parse(text);
        } catch {
          // keep original string
        }
      }
    }
    // Preserve upstream payload even on non-2xx; many upstream APIs return JSON errors.
    return body.json;
  }

  // Non-JSON fallback: convert to our envelope-ish shape so frontend can show a message.
  const description = body.text?.trim() || `Upstream request failed: ${res.status} ${res.statusText}`;
  return { code: -1, description, error: { status: res.status, statusText: res.statusText } };
}

export class MJApi {
  private config: MJConfig;

  constructor(config: MJConfig) {
    this.config = { ...config, apiUrl: config.apiUrl.replace(/\/$/, '') };
  }

  /**
   * 反推提示词 (Describe)
   */
  async describe(request: DescribeRequest): Promise<DescribeResponse> {
    return await fetchUpstreamJson(`${this.config.apiUrl}/mj/submit/describe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  /**
   * 生图 (Imagine)
   */
  async imagine(request: ImagineRequest): Promise<ImagineResponse> {
    const payload = {
      base64Array: Array.isArray(request.base64Array) ? request.base64Array : [],
      notifyHook: request.notifyHook ?? '',
      prompt: request.prompt,
      state: request.state ?? '',
      // yunwu.ai MJ 提交接口在部分环境下需要显式 botType
      botType: 'MID_JOURNEY',
    };

    return await fetchUpstreamJson(`${this.config.apiUrl}/mj/submit/imagine`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 扩图 (Upscale)
   */
  async upscale(request: UpscaleRequest): Promise<UpscaleResponse> {
    const payload = {
      ...request,
      notifyHook: request.notifyHook ?? '',
      state: request.state ?? '',
    };
    return await fetchUpstreamJson(`${this.config.apiUrl}/mj/submit/action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 查询任务状态
   */
  async queryTask(taskId: string): Promise<TaskQueryResponse> {
    return await fetchUpstreamJson(`${this.config.apiUrl}/mj/task/${taskId}/fetch`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
  }
}

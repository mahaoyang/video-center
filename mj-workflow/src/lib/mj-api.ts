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

export class MJApi {
  private config: MJConfig;

  constructor(config: MJConfig) {
    this.config = config;
  }

  /**
   * 反推提示词 (Describe)
   */
  async describe(request: DescribeRequest): Promise<DescribeResponse> {
    const response = await fetch(`${this.config.apiUrl}/mj/submit/describe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return await response.json();
  }

  /**
   * 生图 (Imagine)
   */
  async imagine(request: ImagineRequest): Promise<ImagineResponse> {
    const response = await fetch(`${this.config.apiUrl}/mj/submit/imagine`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return await response.json();
  }

  /**
   * 扩图 (Upscale)
   */
  async upscale(request: UpscaleRequest): Promise<UpscaleResponse> {
    const response = await fetch(`${this.config.apiUrl}/mj/submit/action`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return await response.json();
  }

  /**
   * 查询任务状态
   */
  async queryTask(taskId: string): Promise<TaskQueryResponse> {
    const response = await fetch(`${this.config.apiUrl}/mj/task/${taskId}/fetch`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
      },
    });

    return await response.json();
  }
}

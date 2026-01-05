/**
 * yunwu.ai v1/chat/completions 封装（用于识图）
 */

export interface YunwuChatConfig {
  apiUrl: string;
  token: string;
  defaultModel: string;
}

export class YunwuChatApi {
  private config: YunwuChatConfig;

  constructor(config: YunwuChatConfig) {
    this.config = config;
  }

  async visionDescribe(params: { imageUrl: string; question: string; model?: string }): Promise<unknown> {
    const apiBaseUrl = this.config.apiUrl.replace(/\/$/, '');
    const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model || this.config.defaultModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: params.question },
              { type: 'image_url', image_url: { url: params.imageUrl } },
            ],
          },
        ],
      }),
    });

    return await response.json();
  }
}


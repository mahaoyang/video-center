export interface ImageProxyConfig {
  apiUrl: string; // e.g. https://imageproxy.zhongzhuan.chat
  token: string;  // bearer token
}

export interface ImageProxyUploadResult {
  url: string;
  created?: number;
}

export class ImageProxyClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(config: ImageProxyConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.token = config.token;
  }

  async upload(file: File): Promise<ImageProxyUploadResult> {
    const form = new FormData();
    form.set('file', file, file.name || 'upload.png');

    const response = await fetch(`${this.apiUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error((data as any)?.error?.message || (data as any)?.message || `Upload failed: ${response.status}`);
    }

    if (!data?.url) {
      throw new Error(`Upload failed: missing url`);
    }

    return { url: String(data.url), created: typeof data.created === 'number' ? data.created : undefined };
  }
}


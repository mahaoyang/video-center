import { poll } from './poll';

export interface VideoQueryApi {
  videoQuery(params: { provider: string; id: string }): Promise<any>;
}

export async function pollVideoUntilReady(params: {
  api: VideoQueryApi;
  provider: string;
  id: string;
  onProgress?: (progress: number) => void;
}): Promise<{ videoUrl: string; thumbnailUrl?: string }> {
  return await poll({
    intervalMs: 5000,
    maxAttempts: 240,
    run: async () => {
      const data = await params.api.videoQuery({ provider: params.provider, id: params.id });
      if (data?.code !== 0) throw new Error(String(data?.description || '查询失败'));

      const r = data?.result || {};
      const status = String(r?.status || '').toLowerCase();
      const progressRaw = r?.progress;
      if (params.onProgress && progressRaw !== undefined && progressRaw !== null) {
        const n =
          typeof progressRaw === 'number'
            ? progressRaw
            : typeof progressRaw === 'string'
              ? Number(String(progressRaw).replace('%', '').trim())
              : NaN;
        if (Number.isFinite(n)) params.onProgress(Math.max(0, Math.min(100, n)));
      }

      const videoUrl = typeof r?.videoUrl === 'string' ? r.videoUrl.trim() : '';
      const thumb = typeof r?.thumbnailUrl === 'string' ? r.thumbnailUrl.trim() : '';

      if (videoUrl) return { done: true, value: { videoUrl, thumbnailUrl: thumb || undefined } };

      if (status === 'failed' || status === 'failure') {
        throw new Error(String(r?.error || r?.failReason || '视频生成失败'));
      }

      if (status === 'completed' || status === 'success' || status === 'succeeded') {
        throw new Error('视频已完成但未返回 video_url');
      }

      return { done: false };
    },
  });
}


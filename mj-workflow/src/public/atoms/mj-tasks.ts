import { poll } from './poll';
import { getUpstreamErrorMessage } from './mj-upstream';

export interface TaskQueryApi {
  task(taskId: string): Promise<any>;
}

export async function pollTaskUntilImageUrl(params: {
  api: TaskQueryApi;
  taskId: string;
  onProgress?: (progress: number) => void;
}): Promise<string> {
  return await poll<string>({
    intervalMs: 2000,
    maxAttempts: 120,
    run: async () => {
      const data = await params.api.task(params.taskId);

      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const imageUrl =
        data?.imageUrl ??
        data?.result?.imageUrl ??
        data?.properties?.imageUrl ??
        data?.result?.properties?.imageUrl ??
        data?.result?.image ??
        data?.properties?.image;
      if (typeof imageUrl === 'string' && imageUrl.trim()) {
        return { done: true, value: imageUrl };
      }

      const status = String(
        data?.status ??
          data?.result?.status ??
          data?.properties?.status ??
          data?.result?.properties?.status ??
          ''
      );
      const failReason =
        data?.failReason ??
        data?.result?.failReason ??
        data?.properties?.failReason ??
        data?.result?.properties?.failReason;
      if (status === 'FAILURE' || failReason) {
        throw new Error(String(failReason || '任务失败'));
      }

      const progressRaw =
        data?.progress ??
        data?.result?.progress ??
        data?.properties?.progress ??
        data?.result?.properties?.progress;
      if (params.onProgress && progressRaw !== undefined && progressRaw !== null) {
        const n =
          typeof progressRaw === 'number'
            ? progressRaw
            : typeof progressRaw === 'string'
              ? Number(String(progressRaw).replace('%', '').trim())
              : NaN;
        if (Number.isFinite(n)) params.onProgress(n);
      }

      return { done: false };
    },
  });
}

export async function pollTaskUntilFinalPrompt(params: {
  api: TaskQueryApi;
  taskId: string;
  onProgress?: (progress: number) => void;
}): Promise<string> {
  return await poll<string>({
    intervalMs: 2000,
    maxAttempts: 120,
    run: async () => {
      const task = await params.api.task(params.taskId);

      const upstreamError = getUpstreamErrorMessage(task);
      if (upstreamError) throw new Error(upstreamError);

      const status = String(task?.status ?? task?.result?.status ?? task?.properties?.status ?? '');
      const failReason = task?.failReason ?? task?.result?.failReason ?? task?.properties?.failReason;
      if (status === 'FAILURE' || failReason) {
        throw new Error(String(failReason || '任务失败'));
      }

      const progressRaw = task?.progress ?? task?.result?.progress ?? task?.properties?.progress;
      if (params.onProgress && progressRaw !== undefined && progressRaw !== null) {
        const n =
          typeof progressRaw === 'number'
            ? progressRaw
            : typeof progressRaw === 'string'
              ? Number(String(progressRaw).replace('%', '').trim())
              : NaN;
        if (Number.isFinite(n)) params.onProgress(n);
      }

      const p = task?.properties ?? task?.result?.properties ?? task?.result;
      const finalPrompt = typeof p?.finalPrompt === 'string' ? p.finalPrompt.trim() : '';
      const finalZhPrompt = typeof p?.finalZhPrompt === 'string' ? p.finalZhPrompt.trim() : '';
      const text = finalPrompt || finalZhPrompt;
      if (text) return { done: true, value: text };

      return { done: false };
    },
  });
}

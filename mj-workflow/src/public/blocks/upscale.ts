import type { ApiClient } from '../adapters/api';
import { pretty } from '../atoms/format';
import { poll } from '../atoms/poll';
import { byId, hide, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';

function getUpstreamErrorMessage(payload: any): string | null {
  const err = payload?.error;
  if (err?.message_zh || err?.message) return String(err.message_zh || err.message);
  const code = payload?.code;
  if (typeof code === 'number' && code !== 0 && code !== 1) {
    if (typeof payload?.description === 'string' && payload.description) return payload.description;
    return '上游接口返回错误';
  }
  return null;
}

function getSubmitTaskId(payload: any): string | null {
  const result = payload?.result;
  if (typeof result === 'string' || typeof result === 'number') return String(result);
  if (typeof result?.taskId === 'string' || typeof result?.taskId === 'number') return String(result.taskId);
  if (typeof payload?.taskId === 'string' || typeof payload?.taskId === 'number') return String(payload.taskId);
  return null;
}

async function pollTaskUntilImageUrl(params: { api: ApiClient; taskId: string }): Promise<string> {
  return await poll<string>({
    intervalMs: 2000,
    maxAttempts: 120,
    run: async () => {
      const data = await params.api.task(params.taskId);

      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const imageUrl = data?.imageUrl ?? data?.result?.imageUrl;
      if (typeof imageUrl === 'string' && imageUrl.trim()) {
        return { done: true, value: imageUrl };
      }

      const status = String(data?.status ?? data?.result?.status ?? '');
      const failReason = data?.failReason ?? data?.result?.failReason;
      if (status === 'FAILURE' || failReason) {
        throw new Error(String(failReason || '任务失败'));
      }

      return { done: false };
    },
  });
}

export function createUpscaleBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  async function upscaleSelected() {
    const s = params.store.get();
    const selectedIndex = s.selectedIndices[0];
    if (!selectedIndex || !s.taskId) {
      showError('请先选择图片');
      return;
    }

    params.activateStep(6);
    show(byId<HTMLElement>('upscalingStatus'));

    try {
      const data = await params.api.upscale({ taskId: s.taskId, index: selectedIndex });
      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const upscaleTaskId = getSubmitTaskId(data);
      if (!upscaleTaskId) {
        throw new Error(pretty(data) || '扩图失败：未返回任务ID');
      }

      const imageUrl = await pollTaskUntilImageUrl({ api: params.api, taskId: upscaleTaskId });

      hide(byId<HTMLElement>('upscalingStatus'));
      const upscaledImage = byId<HTMLImageElement>('upscaledImage');
      upscaledImage.src = imageUrl;
      show(byId<HTMLElement>('upscaledImageContainer'));

      params.store.update((prev) => {
        const nextUpscaled = [...prev.upscaledImages, imageUrl];
        const history = prev.history.map((h) =>
          h.taskId === prev.taskId ? { ...h, upscaledImages: [...h.upscaledImages, imageUrl] } : h
        );
        return { ...prev, upscaledImages: nextUpscaled, history };
      });
    } catch (error) {
      console.error('Upscale error:', error);
      showError((error as Error)?.message || '扩图失败，请重试');
      hide(byId<HTMLElement>('upscalingStatus'));
    }
  }

  async function geminiEditUpscaled() {
    const last = params.store.get().upscaledImages.at(-1);
    if (!last) {
      showError('没有可编辑的图片');
      return;
    }

    const editPrompt = byId<HTMLTextAreaElement>('geminiEditPrompt').value.trim();
    if (!editPrompt) {
      showError('请输入编辑指令');
      return;
    }

    const btn = byId<HTMLButtonElement>('geminiEditBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading mr-2"></span>编辑中...';

    try {
      const data = await params.api.geminiEdit({ imageUrl: last, editPrompt });
      if (data.code === 0 && data.result?.imageDataUrl) {
        const resultContainer = byId<HTMLElement>('geminiEditResult');
        const resultImg = byId<HTMLImageElement>('geminiEditedImg');
        resultImg.src = data.result.imageDataUrl;
        show(resultContainer);

        params.store.update((s) => ({ ...s, upscaledImages: [...s.upscaledImages, String(data.result.imageDataUrl)] }));
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>编辑完成';
        return;
      }

      throw new Error([pretty(data.description), pretty(data.error)].filter(Boolean).join('\n') || '编辑失败');
    } catch (error) {
      console.error('Gemini edit error:', error);
      showError((error as Error)?.message || 'Gemini 编辑失败');
      btn.disabled = false;
      btn.innerHTML = 'Gemini Edit';
    }
  }

  return { upscaleSelected, geminiEditUpscaled };
}

import type { ApiClient } from '../adapters/api';
import { pretty } from '../atoms/format';
import { byId, hide, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { randomId } from '../atoms/id';
import { buildMjPrompt } from '../atoms/mj-prompt';
import { pollTaskUntilImageUrl } from '../headless/tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../headless/upstream';

export function createGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  function isHttpUrl(value: string | undefined): value is string {
    if (!value) return false;
    return value.startsWith('http://') || value.startsWith('https://');
  }

  async function generateImage() {
    const promptInput = byId<HTMLTextAreaElement>('promptInput');
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showError('请输入提示词');
      return;
    }

    params.store.update((s) => ({ ...s, prompt }));
    const btn = byId<HTMLButtonElement>('step3Next');
    btn.disabled = true;

    params.activateStep(4);
    show(byId<HTMLElement>('generatingStatus'));

    try {
      const s = params.store.get();
      const imageUrls: string[] = [];
      const extraArgs: string[] = [];

      let base64Array: string[] | undefined = undefined;
      const selected = s.referenceImages.filter((r) => s.selectedReferenceIds.includes(r.id));
      if (selected.length) {
        const collected: string[] = [];
        for (const r of selected) {
          // MJ prompt images must be publicly accessible; prefer CDN URL, never relative local paths.
          const cdnUrl = r.cdnUrl || (isHttpUrl(r.url) ? r.url : undefined);
          if (isHttpUrl(cdnUrl)) imageUrls.push(cdnUrl);
          else if (r.base64) collected.push(r.base64);
        }
        if (collected.length) base64Array = collected;
      }

      const finalPrompt = buildMjPrompt({
        basePrompt: prompt,
        padImages: imageUrls,
        srefImageUrl: s.mjSrefImageUrl,
        crefImageUrl: s.mjCrefImageUrl,
        extraArgs,
      });
      const imagine = await params.api.imagine({ prompt: finalPrompt, base64Array });

      const upstreamError = getUpstreamErrorMessage(imagine);
      if (upstreamError) throw new Error(upstreamError);

      const taskId = getSubmitTaskId(imagine);
      if (!taskId) {
        throw new Error(pretty(imagine) || '生成失败：未返回任务ID');
      }
      params.store.update((s) => ({ ...s, taskId }));

      const imageUrl = await pollTaskUntilImageUrl({
        api: params.api,
        taskId,
        onProgress: (p) => {
          const progressText = document.getElementById('progressText');
          if (progressText) progressText.textContent = `${p}%`;
        },
      });

      params.store.update((s) => ({ ...s, gridImageUrl: imageUrl }));
      hide(byId<HTMLElement>('generatingStatus'));
      const gridImage = byId<HTMLImageElement>('gridImage');
      gridImage.src = imageUrl;
      show(byId<HTMLElement>('gridImageContainer'));

      const stateAfter = params.store.get();
      const selectedRefs = stateAfter.referenceImages
        .filter((r) => stateAfter.selectedReferenceIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt,
          url: r.url,
          cdnUrl: r.cdnUrl,
          localUrl: r.localUrl,
        }));

      params.store.update((prev) => ({
        ...prev,
        history: [
          ...prev.history,
          {
            id: randomId('hist'),
            createdAt: Date.now(),
            prompt: finalPrompt,
            taskId,
            gridImageUrl: imageUrl,
            references: selectedRefs,
            upscaledImages: [],
          },
        ].slice(-30),
      }));
    } catch (error) {
      console.error('Generate error:', error);
      showError((error as Error)?.message || '生成图片失败，请重试');
      btn.disabled = false;
      hide(byId<HTMLElement>('generatingStatus'));
    }
  }

  return { generateImage, pollTaskUntilImageUrl };
}

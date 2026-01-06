import type { ApiClient } from '../adapters/api';
import { pretty } from '../atoms/format';
import { byId } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { randomId } from '../atoms/id';
import { buildMjPrompt } from '../atoms/mj-prompt';
import { pollTaskUntilImageUrl } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { isHttpUrl } from '../atoms/url';

export function createGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  async function generateImage() {
    const promptInput = byId<HTMLTextAreaElement>('promptInput');
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showError('请输入提示词');
      return;
    }

    params.store.update((s) => ({ ...s, prompt }));
    params.activateStep(4);

    // Non-blocking: create a single "job card" message (prompt + progress + result grid).
    const s = params.store.get();
    const extraArgs: string[] = [];

    let padUrl: string | undefined;
    if (s.mjPadRefId) {
      const r = s.referenceImages.find((x) => x.id === s.mjPadRefId);
      const publicUrl = (isHttpUrl(r?.cdnUrl) ? r?.cdnUrl : undefined) || (isHttpUrl(r?.url) ? r?.url : undefined);
      if (isHttpUrl(publicUrl)) padUrl = publicUrl;
      else showError('垫图（PAD）缺少公网 URL（请使用 CDN 图片链接），本次已忽略');
    }

    const finalPrompt = buildMjPrompt({
      basePrompt: prompt,
      padImages: padUrl ? [padUrl] : [],
      srefImageUrl: s.mjSrefImageUrl,
      crefImageUrl: s.mjCrefImageUrl,
      extraArgs,
    });

    const jobMsgId = randomId('msg');
    const pending: StreamMessage = {
      id: jobMsgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'generate',
      text: finalPrompt,
      progress: 0,
    };
    params.store.update((st) => ({ ...st, streamMessages: [...st.streamMessages, pending].slice(-200) }));

    void (async () => {
      try {
        const imagine = await params.api.imagine({ prompt: finalPrompt });

        const upstreamError = getUpstreamErrorMessage(imagine);
        if (upstreamError) throw new Error(upstreamError);

        const taskId = getSubmitTaskId(imagine);
        if (!taskId) throw new Error(pretty(imagine) || '生成失败：未返回任务ID');

        params.store.update((s) => ({ ...s, taskId }));

        params.store.update((st) => ({
          ...st,
          streamMessages: st.streamMessages.map((m) => (m.id === jobMsgId ? { ...m, taskId, progress: 1 } : m)),
        }));

        const imageUrl = await pollTaskUntilImageUrl({
          api: params.api,
          taskId,
          onProgress: (p) => {
            params.store.update((st) => ({
              ...st,
              streamMessages: st.streamMessages.map((m) => (m.id === jobMsgId ? { ...m, progress: p } : m)),
            }));
          },
        });

        params.store.update((s) => ({ ...s, gridImageUrl: imageUrl }));
        params.store.update((st) => ({
          ...st,
          streamMessages: st.streamMessages.map((m) =>
            m.id === jobMsgId ? { ...m, gridImageUrl: imageUrl, progress: 100 } : m
          ),
        }));

        const stateAfter = params.store.get();
        const padRef = stateAfter.mjPadRefId ? stateAfter.referenceImages.find((r) => r.id === stateAfter.mjPadRefId) : undefined;
        const selectedRefs = padRef
          ? [
              {
                id: padRef.id,
                name: padRef.name,
                createdAt: padRef.createdAt,
                url: padRef.url,
                cdnUrl: padRef.cdnUrl,
                localUrl: padRef.localUrl,
              },
            ]
          : [];

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
        params.store.update((st) => ({
          ...st,
          streamMessages: st.streamMessages.map((m) =>
            m.id === jobMsgId ? { ...m, error: (error as Error)?.message || '生成失败' } : m
          ),
        }));
      }
    })();
  }

  return { generateImage, pollTaskUntilImageUrl };
}

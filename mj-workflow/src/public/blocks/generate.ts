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
import { translatePromptBodyToEnglishForMj } from '../atoms/mj-prompt-ai';

export function createGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  function getLocalKey(ref: { localKey?: string; localUrl?: string }): string | undefined {
    if (ref.localKey) return ref.localKey;
    const url = String(ref.localUrl || '');
    const m = url.match(/^\/uploads\/([^/?#]+)$/);
    return m?.[1];
  }

  async function ensurePublicUrlForRefId(refId: string, label: string): Promise<string | undefined> {
    const ref = params.store.get().referenceImages.find((r) => r.id === refId);
    if (!ref) return undefined;

    const existing = (isHttpUrl(ref.cdnUrl) ? ref.cdnUrl : undefined) || (isHttpUrl(ref.url) ? ref.url : undefined);
    if (existing) return existing;

    const localKey = getLocalKey(ref);
    if (!localKey) {
      showError(`${label} 缺少公网 URL 且无法从本地文件补全（请重新上传或配置图床/CDN）`);
      return undefined;
    }

    try {
      const promoted = await params.api.promoteUpload({ localKey });
      if (promoted?.code !== 0) throw new Error(promoted?.description || 'CDN 上传失败');
      const cdnUrl = String(promoted?.result?.cdnUrl || promoted?.result?.url || '').trim();
      if (!isHttpUrl(cdnUrl)) throw new Error('CDN 上传失败：未返回可用 URL');

      params.store.update((s) => ({
        ...s,
        referenceImages: s.referenceImages.map((r) => (r.id === refId ? { ...r, cdnUrl, url: cdnUrl } : r)),
      }));
      return cdnUrl;
    } catch (error) {
      console.error('promoteUpload failed:', error);
      showError(`${label} 上传到 CDN 失败：${(error as Error)?.message || '未知错误'}`);
      return undefined;
    }
  }

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
      padUrl = await ensurePublicUrlForRefId(s.mjPadRefId, '垫图（PAD）');
      if (!padUrl) return;
    }

    const srefUrl = s.mjSrefRefId
      ? await ensurePublicUrlForRefId(s.mjSrefRefId, '风格参考（SREF）')
      : isHttpUrl(s.mjSrefImageUrl)
        ? s.mjSrefImageUrl
        : undefined;
    if (s.mjSrefRefId && !srefUrl) return;

    const crefUrl = s.mjCrefRefId
      ? await ensurePublicUrlForRefId(s.mjCrefRefId, '角色参考（CREF）')
      : isHttpUrl(s.mjCrefImageUrl)
        ? s.mjCrefImageUrl
        : undefined;
    if (s.mjCrefRefId && !crefUrl) return;

    const translatedPrompt = await translatePromptBodyToEnglishForMj({ api: params.api, prompt });

    const finalPrompt = buildMjPrompt({
      basePrompt: translatedPrompt,
      padImages: padUrl ? [padUrl] : [],
      srefImageUrl: srefUrl,
      crefImageUrl: crefUrl,
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

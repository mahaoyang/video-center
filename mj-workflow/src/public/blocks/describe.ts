import type { ApiClient } from '../adapters/api';
import type { Store } from '../state/store';
import type { ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';
import { pretty } from '../atoms/format';
import { showError } from '../atoms/notify';
import { pollTaskUntilFinalPrompt } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { urlToBase64 } from '../atoms/file';
import { randomId } from '../atoms/id';
import { normalizeMjPromptForGeminiDescribe } from '../atoms/mj-normalize';
import { isHttpUrl } from '../atoms/url';
import { readSelectedReferenceIds } from '../state/material';

function getActiveImage(state: WorkflowState) {
  const id = state.activeImageId;
  if (id === '__none__') return undefined;
  const fromHistory = id ? state.referenceImages.find((r) => r.id === id) : undefined;
  const fallback = state.referenceImages.at(-1);
  return fromHistory || fallback;
}

function bestPreviewUrl(r: ReferenceImage): string {
  return r.dataUrl || r.cdnUrl || r.url || r.localUrl || '';
}

function pickPublicUrl(r: ReferenceImage): string | undefined {
  if (isHttpUrl(r.cdnUrl)) return r.cdnUrl;
  if (isHttpUrl(r.url)) return r.url;
  return undefined;
}

async function resolveBase64ForDescribe(r: ReferenceImage): Promise<string | undefined> {
  if (typeof r.base64 === 'string' && r.base64.trim()) return r.base64.trim();
  if (typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:')) {
    const b64 = r.dataUrl.split(',')[1] || '';
    if (b64) return b64;
  }
  if (typeof r.localUrl === 'string' && r.localUrl.trim()) {
    try {
      return await urlToBase64(r.localUrl);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function createDescribeBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  async function deconstructAssets() {
    const selector = document.getElementById('describeEngineSelect') as HTMLSelectElement | null;
    const engine = selector?.value || 'gemini';

    try {
      const s = params.store.get();
      const baseHead = s.traceHeadMessageId;
      const selectedIds = readSelectedReferenceIds(s, 24);
      const selected = selectedIds.length
        ? s.referenceImages.filter((r) => selectedIds.includes(r.id))
        : (() => {
            const one = getActiveImage(s);
            return one ? [one] : [];
          })();

      if (!selected.length) throw new Error('No assets detected in buffer');

      for (let i = 0; i < selected.length; i++) {
        const r = selected[i]!;
        const previewUrl = bestPreviewUrl(r);
        const aiMsgId = randomId('msg');
        const parentMessageId = r.producedByMessageId || baseHead;

        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: aiMsgId,
          streamMessages: [
            ...st.streamMessages,
            {
              id: aiMsgId,
              createdAt: Date.now(),
              role: 'ai',
              kind: 'deconstruct',
              text: '',
              progress: 1,
              imageUrl: previewUrl || undefined,
              refId: r.id,
              parentMessageId: typeof parentMessageId === 'string' ? parentMessageId : undefined,
            } satisfies StreamMessage,
          ].slice(-200),
        }));

        const publicUrl = pickPublicUrl(r);
        const base64 = await resolveBase64ForDescribe(r);
        if (!publicUrl && !base64) {
          params.store.update((st) => ({
            ...st,
            streamMessages: st.streamMessages.map((m) =>
              m.id === aiMsgId
                ? { ...m, text: '该图片无法读取（缺少可用 URL/base64），请重新上传。', progress: 100, error: '图片不可用' }
                : m
            ),
          }));
          continue;
        }

        let promptText = '';
        if (engine === 'mj') {
          const data = await params.api.describe({ base64, imageUrl: publicUrl });
          const upstreamError = getUpstreamErrorMessage(data);
          if (upstreamError) throw new Error(upstreamError);
          const taskId = getSubmitTaskId(data);
          if (!taskId) throw new Error(pretty(data) || 'MJ Describe failed');
          promptText = await pollTaskUntilFinalPrompt({
            api: params.api,
            taskId,
            onProgress: (p) => {
              params.store.update((st) => ({
                ...st,
                streamMessages: st.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, progress: p } : m)),
              }));
            },
          });
        } else if (engine === 'gemini') {
          const imageUrl = publicUrl || (base64 ? `data:image/png;base64,${base64}` : '');
          const data = await params.api.geminiDescribe({ imageUrl });
          promptText = normalizeMjPromptForGeminiDescribe(data.result?.prompt || '');
        } else if (engine.startsWith('vision:')) {
          const imageUrl = publicUrl || (base64 ? `data:image/png;base64,${base64}` : '');
          const data = await params.api.visionDescribe({
            imageUrl,
            question: 'Describe for MJ',
            model: engine.split(':')[1],
          });
          promptText = data.result?.text || '';
        }

        const aiText = promptText || 'Neural engine failed to deconstruct assets';
        params.store.update((st) => ({
          ...st,
          streamMessages: st.streamMessages.map((m) =>
            m.id === aiMsgId ? { ...m, text: aiText, progress: 100, error: aiText.includes('failed') ? aiText : m.error } : m
          ),
        }));
      }
    } catch (error) {
      console.error('Deconstruct error:', error);
      showError((error as Error)?.message);
    }
  }

  return { deconstructAssets };
}

import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { randomId } from '../atoms/id';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';

function normalizeMultiline(text: string): string {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function bestImageUrl(r: { localUrl?: string; cdnUrl?: string; url?: string; dataUrl?: string }): string {
  const cands = [r.localUrl, r.cdnUrl, r.url, r.dataUrl].map((x) => String(x || '').trim()).filter(Boolean);
  return cands[0] || '';
}

export function createSunoBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  async function run() {
    const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
    const requirement = String(promptInput?.value || '').trim();
    if (!requirement) {
      showError('请输入 Suno 需求（主题/风格/情绪/人声/语言/节奏/时长等）');
      return;
    }

    const s0 = params.store.get();
    const refIds = Array.isArray(s0.selectedReferenceIds)
      ? s0.selectedReferenceIds.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!refIds.length) {
      showError('请先在素材区勾选参考图（可多选），再生成 Suno 提示词');
      return;
    }

    const urls: string[] = [];
    for (const id of refIds) {
      const r = s0.referenceImages.find((x) => x.id === id);
      if (!r) continue;
      const u = bestImageUrl(r);
      if (u) urls.push(u);
    }
    if (!urls.length) {
      showError('所选素材缺少可用图片 URL，请重新上传/选择');
      return;
    }

    const msgId = randomId('msg');
    const parentMessageId = params.store.get().traceHeadMessageId;
    const pending: StreamMessage = {
      id: msgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'suno',
      text: normalizeMultiline(`需求：${requirement}\n\n生成中…`),
      refIds,
      inputImageUrls: urls.slice(0, 3),
      parentMessageId: typeof parentMessageId === 'string' ? parentMessageId : undefined,
      progress: 1,
    };
    params.store.update((st) => ({
      ...st,
      traceHeadMessageId: msgId,
      streamMessages: [...st.streamMessages, pending].slice(-200),
    }));

    try {
      const res = await params.api.geminiSuno({ requirement, imageUrls: urls.slice(0, 8) });
      if (res?.code !== 0) throw new Error(String(res?.description || '生成失败'));
      const text = String(res?.result?.text || '').trim();
      if (!text) throw new Error('生成失败：返回为空');
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === msgId ? { ...m, text, progress: 100 } : m)),
      }));
    } catch (error) {
      const msg = (error as Error)?.message || 'Suno 提示词生成失败';
      console.error('suno run error:', error);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === msgId ? { ...m, error: msg, progress: 100 } : m)),
      }));
      showError(msg);
    }
  }

  return { run };
}

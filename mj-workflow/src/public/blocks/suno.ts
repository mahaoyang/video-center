import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { randomId } from '../atoms/id';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { readSelectedReferenceIds } from '../state/material';

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
    const refIds = readSelectedReferenceIds(s0, 12);
    if (!refIds.length) {
      showError('请先在素材区勾选参考图（可多选），再生成 Suno 提示词');
      return;
    }

    const used: Array<{ id: string; url: string; name: string }> = [];
    for (const id of refIds) {
      const r = s0.referenceImages.find((x) => x.id === id);
      if (!r) continue;
      const u = bestImageUrl(r);
      if (!u) {
        showError(`所选参考图缺少可用 URL：${String(r.name || id)}`);
        return;
      }
      used.push({ id, url: u, name: String(r.name || id) });
    }
    if (!used.length) {
      showError('所选素材缺少可用图片 URL，请重新上传/选择');
      return;
    }
    const usedUrls = used.map((x) => x.url);
    const sentUrls = usedUrls.slice(0, 8);

    const msgId = randomId('msg');
    const parentMessageId = params.store.get().traceHeadMessageId;
    const sunoMode = typeof (s0 as any).sunoMode === 'string' ? String((s0 as any).sunoMode || '').trim() : '';
    const sunoLanguage = typeof (s0 as any).sunoLanguage === 'string' ? String((s0 as any).sunoLanguage || '').trim() : '';
    const pending: StreamMessage = {
      id: msgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'suno',
      userPrompt: requirement,
      text: normalizeMultiline(`需求：${requirement}\n\n生成中…`),
      refIds,
      inputImageUrls: sentUrls,
      parentMessageId: typeof parentMessageId === 'string' ? parentMessageId : undefined,
      progress: 1,
    };
    params.store.update((st) => ({
      ...st,
      traceHeadMessageId: msgId,
      streamMessages: [...st.streamMessages, pending].slice(-200),
    }));

    try {
      const res = await params.api.geminiSuno({
        requirement,
        imageUrls: sentUrls,
        mode: sunoMode || undefined,
        language: sunoLanguage || undefined,
      });
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

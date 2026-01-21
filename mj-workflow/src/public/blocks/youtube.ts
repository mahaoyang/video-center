import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { byId, hide, show } from '../atoms/ui';
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

export function createYoutubeMetaBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const promptInput = byId<HTMLTextAreaElement>('promptInput');
  const extraWrap = document.getElementById('youtubeExtraWrap') as HTMLDivElement | null;
  const extraInput = document.getElementById('youtubeExtraInput') as HTMLTextAreaElement | null;

  const defaultPlaceholder = promptInput.placeholder;

  function applyUi(mode: string) {
    const isYoutube = mode === 'youtube';
    if (isYoutube) {
      promptInput.placeholder = '关于视频主题描述（必填）：你要讲什么？视频主线/看点/情绪/受众…';
      if (extraWrap) show(extraWrap);
    } else {
      promptInput.placeholder = defaultPlaceholder;
      if (extraWrap) hide(extraWrap);
      if (extraInput) extraInput.value = '';
    }
  }

  applyUi(String(params.store.get().commandMode || ''));
  params.store.subscribe((s) => applyUi(String(s.commandMode || '')));

  async function run() {
    const topic = String(promptInput.value || '').trim();
    const extra = String(extraInput?.value || '').trim();
    if (!topic) {
      showError('请输入视频主题描述（必填）');
      return;
    }

    const s0 = params.store.get();
    const refIds = readSelectedReferenceIds(s0, 12);

    const used: Array<{ id: string; url: string; name: string }> = [];
    for (const id of refIds) {
      const r = s0.referenceImages.find((x) => x.id === id);
      if (!r) continue;
      const u = bestImageUrl(r);
      if (!u) continue;
      used.push({ id, url: u, name: String(r.name || id) });
    }
    const usedUrls = used.map((x) => x.url);
    const sentUrls = usedUrls.slice(0, 8);

    const msgId = randomId('msg');
    const parentMessageId = params.store.get().traceHeadMessageId;
    const userPrompt = normalizeMultiline(extra ? `主题：${topic}\n\n补充：${extra}` : `主题：${topic}`);
    const pending: StreamMessage = {
      id: msgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'youtube',
      userPrompt,
      text: normalizeMultiline(
        [
          `主题：${topic}`,
          extra ? `补充：${extra}` : '',
          sentUrls.length ? `图片：${sentUrls.length} 张` : '图片：未选择（仅用文字生成）',
          '',
          '生成中…',
        ]
          .filter(Boolean)
          .join('\n')
      ),
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
      const res = await params.api.geminiYoutube({
        topic,
        extra: extra || undefined,
        imageUrls: sentUrls,
        // Default: English output unless user explicitly requests otherwise (e.g. "输出中文/简体中文/英文").
        language: undefined,
      });
      if (res?.code !== 0) throw new Error(String(res?.description || '生成失败'));
      const title = String(res?.result?.title || '').trim();
      const description = String(res?.result?.description || '').trim();
      if (!title && !description) throw new Error('生成失败：返回为空');

      const text = normalizeMultiline(`TITLE:\n${title}\n\nDESCRIPTION:\n${description}`);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === msgId ? { ...m, text, progress: 100 } : m)),
      }));
    } catch (error) {
      const msg = (error as Error)?.message || 'YouTube 标题/简介生成失败';
      console.error('youtube meta run error:', error);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === msgId ? { ...m, error: msg, progress: 100 } : m)),
      }));
      showError(msg);
    }
  }

  return { run };
}

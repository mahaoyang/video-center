import type { ApiClient } from '../adapters/api';
import { dataUrlToFile } from '../atoms/file';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { byId } from '../atoms/ui';
import type { Store } from '../state/store';
import type { ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';
import { sha256HexFromBlob } from '../atoms/blob-hash';

function bestEditSourceUrl(r: ReferenceImage | undefined): string | undefined {
  return r?.cdnUrl || r?.url || r?.localUrl || r?.dataUrl;
}

function extFromDataUrl(dataUrl: string): string {
  const m = String(dataUrl || '').match(/^data:([^;,]+)[;,]/);
  const mime = (m?.[1] || '').toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

export function createGeminiEditBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const panel = byId<HTMLElement>('pEditPanel');
  const closeBtn = byId<HTMLButtonElement>('pEditClose');
  const applyBtn = byId<HTMLButtonElement>('pEditApply');
  const thumb = byId<HTMLImageElement>('pEditThumb');
  const meta = byId<HTMLElement>('pEditMeta');
  const mainPrompt = byId<HTMLTextAreaElement>('promptInput');

  function open() {
    panel.classList.remove('hidden');
  }

  function close() {
    panel.classList.add('hidden');
  }

  function render(state: WorkflowState) {
    const ref = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
    const src = bestEditSourceUrl(ref);
    if (src) {
      thumb.src = src;
      thumb.referrerPolicy = 'no-referrer';
      meta.textContent = `目标：${ref?.name || ref?.id || 'PAD'}（使用主输入框文字）`;
      applyBtn.disabled = false;
    } else {
      thumb.removeAttribute('src');
      meta.textContent = '请先选择一张 PAD 图（垫图）';
      applyBtn.disabled = true;
    }
  }

  let busy = false;
  async function applyEdit() {
    if (busy) return;
    const state = params.store.get();
    const ref = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
    const imageUrl = bestEditSourceUrl(ref);
    const editPrompt = mainPrompt.value.trim();
    if (!imageUrl) {
      showError('请先选择一张 PAD 图（垫图）');
      return;
    }
    if (!editPrompt) {
      showError('请输入 P 图提示词');
      return;
    }

    busy = true;
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>';

    const aiMsgId = randomId('msg');
    const pending: StreamMessage = {
      id: aiMsgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'pedit',
      text: editPrompt,
      imageUrl,
      refId: ref?.id,
      progress: 1,
    };
    params.store.update((s) => ({ ...s, streamMessages: [...s.streamMessages, pending].slice(-200) }));

    try {
      const res = await params.api.geminiEdit({ imageUrl, editPrompt });
      if (res?.code !== 0) throw new Error(res?.description || 'P 图失败');
      const dataUrl = res?.result?.imageDataUrl;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new Error('P 图失败：未返回图片');

      const file = dataUrlToFile(dataUrl, `gemini-edit-${Date.now()}.${extFromDataUrl(dataUrl)}`);
      const originKey = `gemini-edit:sha256:${await sha256HexFromBlob(file)}`;
      const existing = params.store.get().referenceImages.find((r) => r.originKey === originKey);
      if (existing) {
        const existingPreview = bestEditSourceUrl(existing);
        params.store.update((s) => ({
          ...s,
          selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, existing.id])),
          mjPadRefId: existing.id,
        }));
        params.store.update((st) => ({
          ...st,
          streamMessages: st.streamMessages.map((m) =>
            m.id === aiMsgId ? { ...m, peditImageUrl: existingPreview, progress: 100 } : m
          ),
        }));
        return;
      }

      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const url = String(result.url);
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;
      const previewUrl = cdnUrl || url || localUrl;

      params.store.update((s) => ({
        ...s,
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `P-${new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            createdAt,
            originKey,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, referenceId])),
        mjPadRefId: referenceId,
      }));

      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, peditImageUrl: previewUrl, progress: 100 } : m)),
      }));

      showMessage('P 图完成：已加入图片栏并设为 PAD，可继续重复 P');
    } catch (e) {
      console.error('Gemini edit failed:', e);
      const msg = (e as Error)?.message || 'P 图失败';
      showError(msg);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, error: msg } : m)),
      }));
    } finally {
      busy = false;
      applyBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles text-[10px]"></i><span class="ml-2">Apply</span>';
      applyBtn.disabled = false;
      render(params.store.get());
    }
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  applyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void applyEdit();
  });

  render(params.store.get());
  params.store.subscribe(render);

  return { open, close, applyEdit };
}

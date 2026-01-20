import type { ApiClient } from '../adapters/api';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { byId } from '../atoms/ui';
import type { Store } from '../state/store';
import type { ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';
import { stripMjParamsAndUrls } from '../atoms/mj-prompt-parts';
import { toAppImageSrc } from '../atoms/image-src';
import { createPopoverMenu } from '../atoms/popover-menu';
import { setupScrollArea } from '../atoms/scroll-area';
import { readSelectedReferenceIds } from '../state/material';

function bestEditSourceUrl(r: ReferenceImage | undefined): string | undefined {
  return r?.cdnUrl || r?.url || r?.localUrl || r?.dataUrl;
}

export function createGeminiEditBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const panel = byId<HTMLElement>('pEditPanel');
  const aspectBtn = byId<HTMLButtonElement>('pEditAspectBtn');
  const aspectLabel = byId<HTMLElement>('pEditAspectLabel');
  const aspectMenu = byId<HTMLElement>('pEditAspectMenu');
  const sizeBtn = byId<HTMLButtonElement>('pEditSizeBtn');
  const sizeLabel = byId<HTMLElement>('pEditSizeLabel');
  const sizeMenu = byId<HTMLElement>('pEditSizeMenu');
  const selectedRefs = byId<HTMLElement>('pEditSelectedRefs');
  const clearSelectedBtn = byId<HTMLButtonElement>('pEditClearSelected');
  const mainPrompt = byId<HTMLTextAreaElement>('promptInput');

  const aspectPopover = createPopoverMenu({
    button: aspectBtn,
    menu: aspectMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(aspectMenu);
    },
  });
  const sizePopover = createPopoverMenu({
    button: sizeBtn,
    menu: sizeMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(sizeMenu);
    },
  });

  function open() {
    panel.classList.remove('hidden');
  }

  function close() {
    panel.classList.add('hidden');
  }

  function getSelectedRefsOrdered(state: WorkflowState): ReferenceImage[] {
    const selected = new Set(readSelectedReferenceIds(state, 24));
    return (state.referenceImages || []).filter((r) => selected.has(r.id));
  }

  function render(state: WorkflowState) {
    const ar = typeof state.gimageAspect === 'string' && state.gimageAspect.trim() ? state.gimageAspect.trim() : '16:9';
    const size = typeof state.gimageSize === 'string' && state.gimageSize.trim() ? state.gimageSize.trim() : '2K';
    aspectLabel.textContent = ar;
    sizeLabel.textContent = size;

    aspectMenu.querySelectorAll<HTMLElement>('button[data-gimage-aspect]').forEach((el) => {
      const v = String(el.dataset.gimageAspect || '').trim();
      el.classList.toggle('bg-white/5', v === ar);
    });
    sizeMenu.querySelectorAll<HTMLElement>('button[data-gimage-size]').forEach((el) => {
      const v = String(el.dataset.gimageSize || '').trim();
      el.classList.toggle('bg-white/5', v === size);
    });

    const refs = getSelectedRefsOrdered(state);
    selectedRefs.innerHTML = '';

    if (!refs.length) {
      const empty = document.createElement('div');
      empty.className = 'text-[10px] font-mono opacity-40 py-2';
      empty.textContent = '未选择参考图（将使用纯文本生图）';
      selectedRefs.appendChild(empty);
      return;
    }

    for (let i = 0; i < refs.length; i++) {
      const r = refs[i]!;
      const src = bestEditSourceUrl(r);
      const chip = document.createElement('div');
      chip.className = 'relative flex-shrink-0 w-12 h-12 rounded-2xl overflow-hidden border border-white/10 bg-black/20';
      if (src) {
        const img = document.createElement('img');
        img.className = 'w-full h-full object-cover';
        img.src = toAppImageSrc(src);
        img.referrerPolicy = 'no-referrer';
        chip.appendChild(img);
      }

      const idx = document.createElement('div');
      idx.className =
        'absolute -top-1 -left-1 w-5 h-5 rounded-full bg-studio-accent text-studio-bg text-[9px] font-black flex items-center justify-center shadow-xl';
      idx.textContent = String(i + 1);
      chip.appendChild(idx);

      const del = document.createElement('button');
      del.type = 'button';
      del.className =
        'absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 border border-white/10 text-white/70 hover:text-white hover:border-white/20 flex items-center justify-center text-[10px]';
      del.innerHTML = '<i class="fas fa-minus"></i>';
      del.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((s) => ({ ...s, selectedReferenceIds: (s.selectedReferenceIds || []).filter((id) => id !== r.id) }));
      });
      chip.appendChild(del);

      selectedRefs.appendChild(chip);
    }
  }

  let busy = false;
  async function applyEdit() {
    if (busy) return;
    const state = params.store.get();
    const editPrompt = stripMjParamsAndUrls(mainPrompt.value);
    if (!editPrompt) return showError('请输入提示词主体（会忽略 --ar / URL 等参数）');

    const selected = getSelectedRefsOrdered(state);
    const refIds = selected.map((r) => r.id);
    const inputImageUrls = selected
      .map((r) => bestEditSourceUrl(r))
      .filter((u): u is string => typeof u === 'string' && u.trim());
    if (selected.length && inputImageUrls.length !== selected.length) {
      showError('部分参考图缺少可用 URL（请等待上传完成或重新上传）');
      return;
    }

    const aspectRatio = typeof state.gimageAspect === 'string' && state.gimageAspect.trim() ? state.gimageAspect.trim() : '16:9';
    const imageSize = typeof state.gimageSize === 'string' && state.gimageSize.trim() ? state.gimageSize.trim() : '2K';

    busy = true;

    const aiMsgId = randomId('msg');
    const parentMessageId = params.store.get().traceHeadMessageId;
    const pending: StreamMessage = {
      id: aiMsgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'pedit',
      text: editPrompt,
      imageUrl: inputImageUrls[0],
      refIds,
      inputImageUrls,
      gimageAspect: aspectRatio,
      gimageSize: imageSize,
      parentMessageId: typeof parentMessageId === 'string' ? parentMessageId : undefined,
      progress: 1,
    };
    params.store.update((s) => ({ ...s, traceHeadMessageId: aiMsgId, streamMessages: [...s.streamMessages, pending].slice(-200) }));

    try {
      const res = await params.api.geminiProImage({ prompt: editPrompt, imageUrls: inputImageUrls, aspectRatio, imageSize });
      if (res?.code !== 0) throw new Error(res?.description || 'Gemini 生图/编辑失败');
      const images = Array.isArray(res?.result?.images) ? res.result.images : [];
      const urls = images.map((it: any) => String(it?.url || it?.localUrl || '').trim()).filter(Boolean);
      if (!urls.length) throw new Error('Gemini 生图/编辑失败：未返回图片');

      const createdAt = Date.now();
      const newRefs: ReferenceImage[] = images
        .map((it: any, idx: number) => {
          const url = String(it?.url || it?.localUrl || '').trim();
          if (!url) return null;
          const localUrl = typeof it?.localUrl === 'string' ? it.localUrl : undefined;
          const localKey = typeof it?.localKey === 'string' ? it.localKey : undefined;
          return {
            id: randomId('ref'),
            name: `G-${new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${idx + 1}`,
            createdAt,
            originKey: localKey ? `gemini-pro-image:localKey:${localKey}` : undefined,
            producedByMessageId: aiMsgId,
            url,
            localUrl,
            localKey,
          } satisfies ReferenceImage;
        })
        .filter(Boolean) as ReferenceImage[];

      const peditImageUrls = urls;
      const peditImageUrl = peditImageUrls[0];
      params.store.update((st) => ({
        ...st,
        referenceImages: [...st.referenceImages, ...newRefs],
        streamMessages: st.streamMessages.map((m) =>
          m.id === aiMsgId ? { ...m, peditImageUrls, peditImageUrl, outputRefIds: newRefs.map((r) => r.id), progress: 100 } : m
        ),
      }));

      showMessage('Gemini 生图/编辑完成：已加入素材区（未自动勾选）');
    } catch (e) {
      console.error('Gemini edit failed:', e);
      const msg = (e as Error)?.message || 'Gemini 生图/编辑失败';
      showError(msg);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, error: msg } : m)),
      }));
    } finally {
      busy = false;
      render(params.store.get());
    }
  }

  aspectMenu.querySelectorAll<HTMLButtonElement>('button[data-gimage-aspect]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.gimageAspect || '').trim();
      if (!v) return;
      params.store.update((s) => ({ ...s, gimageAspect: v }));
      aspectPopover.close();
    });
  });
  sizeMenu.querySelectorAll<HTMLButtonElement>('button[data-gimage-size]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.gimageSize || '').trim();
      if (!v) return;
      params.store.update((s) => ({ ...s, gimageSize: v }));
      sizePopover.close();
    });
  });
  clearSelectedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    params.store.update((s) => ({ ...s, selectedReferenceIds: [] }));
  });

  render(params.store.get());
  params.store.subscribe(render);

  return { open, close, applyEdit };
}

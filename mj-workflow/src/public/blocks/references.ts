import type { Store } from '../state/store';
import type { ReferenceImage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

function getMjLink(ref: ReferenceImage): string | undefined {
  if (isHttpUrl(ref.cdnUrl)) return ref.cdnUrl;
  if (isHttpUrl(ref.url)) return ref.url;
  return undefined;
}

function getDeleteKey(ref: ReferenceImage): string | undefined {
  if (ref.localKey) return ref.localKey;
  const url = String(ref.localUrl || '');
  const m = url.match(/^\/uploads\/([^/?#]+)$/);
  return m?.[1];
}

function renderReferenceItem(params: {
  reference: ReferenceImage;
  state: WorkflowState;
  selectedAsPad: boolean;
  onTogglePad: () => void;
  onSetSref: () => void;
  onSetCref: () => void;
  onDelete: () => void;
}): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'group relative aspect-square rounded-xl overflow-hidden border border-studio-border hover:border-studio-accent transition-all duration-300 ' +
    (params.selectedAsPad ? 'ring-2 ring-studio-accent' : '');

  const img = document.createElement('img');
  img.className = 'w-full h-full object-cover cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity';
  img.src = params.reference.dataUrl || params.reference.url || params.reference.cdnUrl || params.reference.localUrl || '';
  img.onclick = () => params.onTogglePad();

  // Hover Overlay with Actions
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3';

  const mkBtn = (text: string, active: boolean, disabled: boolean, onClick: () => void) => {
    const b = document.createElement('button');
    b.disabled = disabled;
    b.className = `w-full py-1.5 rounded-md text-[7px] font-black uppercase tracking-widest transition-all ${
      active
        ? 'bg-studio-accent text-black'
        : disabled
          ? 'bg-white/5 text-white/30 cursor-not-allowed'
          : 'bg-white/10 text-white hover:bg-white/20'
    }`;
    b.textContent = text;
    b.onclick = (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      onClick();
    };
    return b;
  };

  const mjUrl = getMjLink(params.reference);
  overlay.appendChild(
    mkBtn(
      'Style (SREF)',
      Boolean(mjUrl && params.state.mjSrefImageUrl === mjUrl),
      !mjUrl,
      params.onSetSref
    )
  );
  overlay.appendChild(
    mkBtn(
      'Char (CREF)',
      Boolean(mjUrl && params.state.mjCrefImageUrl === mjUrl),
      !mjUrl,
      params.onSetCref
    )
  );

  const delBtn = document.createElement('button');
  delBtn.className = 'absolute top-1 right-1 w-5 h-5 rounded-md bg-red-500/20 text-red-500 text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white';
  delBtn.innerHTML = '<i class="fas fa-times"></i>';
  delBtn.onclick = (e) => { e.stopPropagation(); params.onDelete(); };

  wrapper.appendChild(img);
  wrapper.appendChild(overlay);
  wrapper.appendChild(delBtn);

  if (params.selectedAsPad) {
    const check = document.createElement('div');
    check.className = 'absolute bottom-1 right-1 w-4 h-4 rounded-full bg-studio-accent text-black flex items-center justify-center text-[8px] shadow-xl z-20';
    check.innerHTML = '<i class="fas fa-check"></i>';
    wrapper.appendChild(check);
  }

  return wrapper;
}

export function createReferencePicker(params: { store: Store<WorkflowState>; api: ApiClient }) {
  const container = byId<HTMLElement>('referenceList');
  const clearBtn = document.getElementById('clearRefsBtn') as HTMLButtonElement | null;

  function toggleReference(id: string) {
    params.store.update((s) => {
      const selected = new Set(s.selectedReferenceIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...s, selectedReferenceIds: Array.from(selected) };
    });
  }

  function setSlot(kind: 'sref' | 'cref', url: string | undefined) {
    if (!url) {
      showError('该图片没有 CDN 公网链接，无法用于 SREF/CREF（请先配置图床或上传到可公网访问的 URL）');
      return;
    }
    params.store.update((s) => {
      const current = kind === 'sref' ? s.mjSrefImageUrl : s.mjCrefImageUrl;
      const next = current === url ? undefined : url;
      return { ...s, mjSrefImageUrl: kind === 'sref' ? next : s.mjSrefImageUrl, mjCrefImageUrl: kind === 'cref' ? next : s.mjCrefImageUrl };
    });
  }

  async function deleteReference(ref: ReferenceImage) {
    if (!confirm(`删除该图片？\n\n${ref.name || ref.id}`)) return;
    try {
      const deleteKey = getDeleteKey(ref);
      if (deleteKey) {
        const resp = await params.api.deleteUpload({ localKey: deleteKey });
        if (resp?.code !== 0) {
          throw new Error(resp?.description || '删除失败');
        }
      }
    } catch (error) {
      console.error('Delete upload error:', error);
      showError((error as Error)?.message || '删除失败');
      return;
    }

    params.store.update((s) => {
      const nextRefs = s.referenceImages.filter((r) => r.id !== ref.id);
      const nextSelected = s.selectedReferenceIds.filter((id) => id !== ref.id);

      const publicUrls = [ref.cdnUrl, ref.url].filter(Boolean) as string[];
      const mjSrefImageUrl = s.mjSrefImageUrl && publicUrls.includes(s.mjSrefImageUrl) ? undefined : s.mjSrefImageUrl;
      const mjCrefImageUrl = s.mjCrefImageUrl && publicUrls.includes(s.mjCrefImageUrl) ? undefined : s.mjCrefImageUrl;

      return { ...s, referenceImages: nextRefs, selectedReferenceIds: nextSelected, mjSrefImageUrl, mjCrefImageUrl };
    });
  }

  function render(state: WorkflowState) {
    container.innerHTML = '';
    const selectedSet = new Set(state.selectedReferenceIds);
    const refs = state.referenceImages.slice().reverse();

    for (const r of refs) {
      const url = getMjLink(r);
      container.appendChild(
        renderReferenceItem({
          reference: r,
          state,
          selectedAsPad: selectedSet.has(r.id),
          onTogglePad: () => toggleReference(r.id),
          onSetSref: () => setSlot('sref', url),
          onSetCref: () => setSlot('cref', url),
          onDelete: () => void deleteReference(r),
        })
      );
    }

    if (!refs.length) {
      const empty = document.createElement('div');
      empty.className = 'text-xs uppercase tracking-widest opacity-40 py-6 text-center';
      empty.textContent = 'No reference images yet';
      container.appendChild(empty);
    }
  }

  clearBtn?.addEventListener('click', () => {
    params.store.update((s) => ({ ...s, selectedReferenceIds: [] }));
  });

  render(params.store.get());
  params.store.subscribe(render);

  return { toggleReference };
}

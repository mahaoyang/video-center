import type { Store } from '../state/store';
import type { ReferenceImage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { isHttpUrl } from '../atoms/url';
import { readSelectedReferenceIds, toggleId } from '../state/material';

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
  selected: boolean;
  selectedIndex: number;
  onToggleSelected: () => void;
  onSetSref: () => void;
  onSetCref: () => void;
  onDelete: () => void;
}): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'group relative aspect-square rounded-xl overflow-hidden border border-studio-border hover:border-studio-accent transition-all duration-300 ' +
    (params.selected ? 'ring-2 ring-studio-accent' : '');

  const img = document.createElement('img');
  img.className = 'w-full h-full object-cover cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity';
  img.src = params.reference.dataUrl || params.reference.url || params.reference.cdnUrl || params.reference.localUrl || '';
  img.onclick = () => params.onToggleSelected();

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
      Boolean(
        (params.state.mjSrefRefId && params.state.mjSrefRefId === params.reference.id) ||
          (mjUrl && params.state.mjSrefImageUrl === mjUrl)
      ),
      false,
      params.onSetSref
    )
  );
  overlay.appendChild(
    mkBtn(
      'Char (CREF)',
      Boolean(
        (params.state.mjCrefRefId && params.state.mjCrefRefId === params.reference.id) ||
          (mjUrl && params.state.mjCrefImageUrl === mjUrl)
      ),
      false,
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

  if (typeof params.selectedIndex === 'number' && params.selectedIndex >= 0) {
    const badge = document.createElement('div');
    badge.className =
      'absolute left-1 bottom-1 min-w-6 h-6 px-2 rounded-full bg-black/60 border border-white/10 text-[9px] font-black text-studio-accent flex items-center justify-center z-20';
    badge.textContent = String(params.selectedIndex + 1);
    wrapper.appendChild(badge);
  }

  if (params.selected) {
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

  function toggleSelected(id: string) {
    params.store.update((s) => ({ ...s, selectedReferenceIds: toggleId(readSelectedReferenceIds(s, 24), id, 24) }));
  }

  function setSlot(kind: 'sref' | 'cref', ref: ReferenceImage) {
    const mjUrl = getMjLink(ref);
    params.store.update((s) => {
      const currentId = kind === 'sref' ? s.mjSrefRefId : s.mjCrefRefId;
      const nextId = currentId === ref.id ? undefined : ref.id;
      const nextUrl = nextId && mjUrl ? mjUrl : undefined;
      return {
        ...s,
        mjSrefRefId: kind === 'sref' ? nextId : s.mjSrefRefId,
        mjCrefRefId: kind === 'cref' ? nextId : s.mjCrefRefId,
        // Back-compat: keep URL if already public; otherwise we'll lazily promote on generate.
        mjSrefImageUrl: kind === 'sref' ? nextUrl : s.mjSrefImageUrl,
        mjCrefImageUrl: kind === 'cref' ? nextUrl : s.mjCrefImageUrl,
      };
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

      return {
        ...s,
        referenceImages: nextRefs,
        selectedReferenceIds: nextSelected,
        mjSrefImageUrl,
        mjCrefImageUrl,
        mjSrefRefId: s.mjSrefRefId === ref.id ? undefined : s.mjSrefRefId,
        mjCrefRefId: s.mjCrefRefId === ref.id ? undefined : s.mjCrefRefId,
      };
    });
  }

  function render(state: WorkflowState) {
    container.innerHTML = '';
    const refs = state.referenceImages.slice().reverse();
    const selectedOrder = readSelectedReferenceIds(state, 24);

    for (const r of refs) {
      container.appendChild(
        renderReferenceItem({
          reference: r,
          state,
          selected: selectedOrder.includes(r.id),
          selectedIndex: selectedOrder.indexOf(r.id),
          onToggleSelected: () => toggleSelected(r.id),
          onSetSref: () => setSlot('sref', r),
          onSetCref: () => setSlot('cref', r),
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

  return { toggleSelected };
}

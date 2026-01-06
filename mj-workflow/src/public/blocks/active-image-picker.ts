import type { Store } from '../state/store';
import type { ReferenceImage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';

const NONE = '__none__';

function bestPreviewUrl(r: ReferenceImage): string {
  return r.dataUrl || r.cdnUrl || r.url || r.localUrl || '';
}

function renderItem(params: {
  reference: ReferenceImage;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'group relative aspect-square rounded-xl overflow-hidden border border-studio-border hover:border-studio-accent transition-all duration-300 ' +
    (params.selected ? 'ring-2 ring-studio-accent' : '');

  const img = document.createElement('img');
  img.className = 'w-full h-full object-cover cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity';
  img.src = bestPreviewUrl(params.reference);
  img.onclick = () => params.onSelect();

  const delBtn = document.createElement('button');
  delBtn.className = 'absolute top-1 right-1 w-5 h-5 rounded-md bg-red-500/20 text-red-500 text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white';
  delBtn.innerHTML = '<i class="fas fa-times"></i>';
  delBtn.onclick = (e) => { e.stopPropagation(); params.onDelete(); };

  wrapper.appendChild(img);
  wrapper.appendChild(delBtn);

  if (params.selected) {
    const check = document.createElement('div');
    check.className = 'absolute bottom-1 right-1 w-4 h-4 rounded-full bg-studio-accent text-black flex items-center justify-center text-[8px] shadow-xl';
    check.innerHTML = '<i class="fas fa-check"></i>';
    wrapper.appendChild(check);
  }

  return wrapper;
}

export function createActiveImagePicker(params: { store: Store<WorkflowState>; api: ApiClient }) {
  const container = byId<HTMLElement>('activeImageList');
  const clearBtn = document.getElementById('clearActiveImageBtn') as HTMLButtonElement | null;
  const clearLibraryBtn = document.getElementById('clearUploadHistoryBtn') as HTMLButtonElement | null;

  function setActive(id: string) {
    params.store.update((s) => ({ ...s, activeImageId: s.activeImageId === id ? NONE : id }));
  }

  function ensureDefault(state: WorkflowState) {
    if (state.activeImageId && state.activeImageId !== NONE) return;
    if (state.activeImageId === NONE) return;
    const last = state.referenceImages.at(-1);
    if (last?.id) params.store.update((s) => ({ ...s, activeImageId: last.id }));
  }

  async function deleteOne(ref: ReferenceImage) {
    if (!confirm(`删除该图片？\n\n${ref.name || ref.id}`)) return;
    try {
      if (ref.localKey) {
        const resp = await params.api.deleteUpload({ localKey: ref.localKey });
        if (resp?.code !== 0) throw new Error(resp?.description || '删除失败');
      }
    } catch (error) {
      console.error('Delete upload error:', error);
      showError((error as Error)?.message || '删除失败');
      return;
    }

    params.store.update((s) => {
      const nextRefs = s.referenceImages.filter((r) => r.id !== ref.id);
      const nextSelected = s.selectedReferenceIds.filter((id) => id !== ref.id);
      const nextActiveId = s.activeImageId === ref.id ? (nextRefs.at(-1)?.id || NONE) : s.activeImageId;
      const nextPad = s.mjPadRefId === ref.id ? undefined : s.mjPadRefId;
      return {
        ...s,
        referenceImages: nextRefs,
        selectedReferenceIds: nextSelected,
        activeImageId: nextActiveId,
        mjPadRefId: nextPad,
        mjSrefRefId: s.mjSrefRefId === ref.id ? undefined : s.mjSrefRefId,
        mjCrefRefId: s.mjCrefRefId === ref.id ? undefined : s.mjCrefRefId,
      };
    });
  }

  async function clearLibrary() {
    const ok = confirm('清空上传历史？这会从页面移除记录，并尝试删除本地服务缓存文件。');
    if (!ok) return;

    const refs = params.store.get().referenceImages.slice();
    for (const r of refs) {
      if (!r.localKey) continue;
      try {
        await params.api.deleteUpload({ localKey: r.localKey });
      } catch {
        // ignore
      }
    }

    params.store.update((s) => ({
      ...s,
      referenceImages: [],
      selectedReferenceIds: [],
      activeImageId: NONE,
      mjPadRefId: undefined,
      mjSrefImageUrl: undefined,
      mjCrefImageUrl: undefined,
      mjSrefRefId: undefined,
      mjCrefRefId: undefined,
    }));
  }

  function render(state: WorkflowState) {
    ensureDefault(state);
    container.innerHTML = '';

    const refs = state.referenceImages.slice().reverse();
    for (const r of refs) {
      container.appendChild(
        renderItem({
          reference: r,
          selected: Boolean(state.activeImageId && state.activeImageId === r.id),
          onSelect: () => setActive(r.id),
          onDelete: () => void deleteOne(r),
        })
      );
    }

    if (!refs.length) {
      const empty = document.createElement('div');
      empty.className = 'text-xs uppercase tracking-widest opacity-40 py-6 text-center';
      empty.textContent = 'No uploaded images yet';
      container.appendChild(empty);
    }
  }

  clearBtn?.addEventListener('click', () => params.store.update((s) => ({ ...s, activeImageId: NONE })));
  clearLibraryBtn?.addEventListener('click', () => void clearLibrary());

  render(params.store.get());
  params.store.subscribe(render);
}

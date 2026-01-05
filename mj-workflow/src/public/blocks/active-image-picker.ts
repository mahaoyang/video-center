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
  const div = document.createElement('button');
  div.type = 'button';
  div.className =
    'group relative overflow-hidden rounded-2xl border transition-all duration-500 text-left ' +
    (params.selected
      ? 'border-brand-green bg-white shadow-2xl shadow-brand-green/10 scale-[0.98]'
      : 'border-brand-green/5 bg-white/40 hover:border-brand-green/20 hover:bg-white/60');

  const img = document.createElement('img');
  img.className = 'w-full h-32 object-cover';
  img.src = bestPreviewUrl(params.reference);
  img.alt = params.reference.name;

  const label = document.createElement('div');
  label.className = 'p-3';

  const top = document.createElement('div');
  top.className = 'flex items-center justify-between gap-2';

  const name = document.createElement('div');
  name.className = 'text-xs font-semibold uppercase tracking-widest opacity-70 truncate';
  name.textContent = params.reference.name || 'image';

  const badge = document.createElement('div');
  badge.className = 'badge ' + (params.selected ? '!bg-brand-green' : '!bg-brand-green/5 !text-brand-green/40');
  badge.textContent = params.selected ? 'Active' : 'Use';

  top.appendChild(name);
  top.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'text-[10px] uppercase tracking-widest opacity-40 mt-2';
  const dt = new Date(params.reference.createdAt);
  meta.textContent = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;

  label.appendChild(top);
  label.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'mt-3 flex gap-2';

  const del = document.createElement('button');
  del.type = 'button';
  del.className =
    'flex-1 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black transition-all border bg-white/70 text-red-600/70 border-red-500/10 hover:border-red-500/30';
  del.textContent = '删除';
  del.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    params.onDelete();
  });
  actions.appendChild(del);

  label.appendChild(actions);

  div.appendChild(img);
  div.appendChild(label);

  div.addEventListener('click', () => params.onSelect());
  return div;
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
      return { ...s, referenceImages: nextRefs, selectedReferenceIds: nextSelected, activeImageId: nextActiveId };
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
      mjSrefImageUrl: undefined,
      mjCrefImageUrl: undefined,
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

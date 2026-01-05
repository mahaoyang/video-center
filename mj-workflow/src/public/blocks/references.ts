import type { Store } from '../state/store';
import type { ReferenceImage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';

function renderReferenceItem(params: {
  reference: ReferenceImage;
  state: WorkflowState;
  selectedAsPad: boolean;
  onTogglePad: () => void;
  onSetSref: () => void;
  onSetCref: () => void;
  onDelete: () => void;
}): HTMLElement {
  const div = document.createElement('button');
  div.type = 'button';
  div.className =
    'group relative overflow-hidden rounded-2xl border transition-all duration-500 text-left ' +
    (params.selectedAsPad
      ? 'border-brand-green bg-white shadow-2xl shadow-brand-green/10 scale-[0.98]'
      : 'border-brand-green/5 bg-white/40 hover:border-brand-green/20 hover:bg-white/60');

  const img = document.createElement('img');
  img.className = 'w-full h-32 object-cover';
  img.src = params.reference.dataUrl || params.reference.url || params.reference.cdnUrl || params.reference.localUrl || '';
  img.alt = params.reference.name;

  const label = document.createElement('div');
  label.className = 'p-3';

  const top = document.createElement('div');
  top.className = 'flex items-center justify-between gap-2';

  const name = document.createElement('div');
  name.className = 'text-xs font-semibold uppercase tracking-widest opacity-70 truncate';
  name.textContent = params.reference.name || 'reference';

  const status = document.createElement('div');
  status.className = 'flex items-center gap-2';

  const mkBadge = (text: string, active: boolean) => {
    const b = document.createElement('div');
    b.className = 'badge ' + (active ? '!bg-brand-green' : '!bg-brand-green/5 !text-brand-green/40');
    b.textContent = text;
    return b;
  };

  const url = params.reference.url || params.reference.cdnUrl || params.reference.localUrl;
  status.appendChild(mkBadge('Pad', params.selectedAsPad));
  status.appendChild(mkBadge('sref', Boolean(url && params.state.mjSrefImageUrl === url)));
  status.appendChild(mkBadge('cref', Boolean(url && params.state.mjCrefImageUrl === url)));

  top.appendChild(name);
  top.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'mt-3 flex gap-2';

  const mkAction = (text: string, active: boolean, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = disabled;
    b.className =
      'flex-1 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black transition-all border ' +
      (disabled
        ? 'bg-white/40 text-brand-green/20 border-brand-green/5'
        : active
          ? 'bg-brand-green text-white border-brand-green'
          : 'bg-white/70 text-brand-green/70 border-brand-green/10 hover:border-brand-green/30');
    b.textContent = text;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  actions.appendChild(mkAction('垫图', params.selectedAsPad, params.onTogglePad));
  actions.appendChild(
    mkAction('sref', Boolean(url && params.state.mjSrefImageUrl === url), params.onSetSref, !url)
  );
  actions.appendChild(
    mkAction('cref', Boolean(url && params.state.mjCrefImageUrl === url), params.onSetCref, !url)
  );

  const del = document.createElement('button');
  del.type = 'button';
  del.className =
    'px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black transition-all border bg-white/70 text-red-600/70 border-red-500/10 hover:border-red-500/30';
  del.textContent = '删除';
  del.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    params.onDelete();
  });
  actions.appendChild(del);

  const meta = document.createElement('div');
  meta.className = 'text-[10px] uppercase tracking-widest opacity-40 mt-2';
  const dt = new Date(params.reference.createdAt);
  meta.textContent = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;

  label.appendChild(top);
  label.appendChild(meta);
  label.appendChild(actions);

  const links = document.createElement('div');
  links.className = 'mt-3 text-[10px] leading-relaxed opacity-40 break-all';
  const cdn = params.reference.cdnUrl ? `CDN: ${params.reference.cdnUrl}` : '';
  const local = params.reference.localPath ? `LOCAL: ${params.reference.localPath}` : '';
  links.textContent = [cdn, local].filter(Boolean).join('\n');
  if (links.textContent) label.appendChild(links);

  div.appendChild(img);
  div.appendChild(label);

  div.addEventListener('click', () => params.onTogglePad());
  return div;
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
    if (!url) return;
    params.store.update((s) => {
      const current = kind === 'sref' ? s.mjSrefImageUrl : s.mjCrefImageUrl;
      const next = current === url ? undefined : url;
      return { ...s, mjSrefImageUrl: kind === 'sref' ? next : s.mjSrefImageUrl, mjCrefImageUrl: kind === 'cref' ? next : s.mjCrefImageUrl };
    });
  }

  async function deleteReference(ref: ReferenceImage) {
    if (!confirm(`删除该图片？\n\n${ref.name || ref.id}`)) return;
    try {
      if (ref.localKey) {
        const resp = await params.api.deleteUpload({ localKey: ref.localKey });
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

      const refUrl = ref.url || ref.cdnUrl || ref.localUrl;
      const mjSrefImageUrl = refUrl && s.mjSrefImageUrl === refUrl ? undefined : s.mjSrefImageUrl;
      const mjCrefImageUrl = refUrl && s.mjCrefImageUrl === refUrl ? undefined : s.mjCrefImageUrl;

      return { ...s, referenceImages: nextRefs, selectedReferenceIds: nextSelected, mjSrefImageUrl, mjCrefImageUrl };
    });
  }

  function render(state: WorkflowState) {
    container.innerHTML = '';
    const selectedSet = new Set(state.selectedReferenceIds);
    const refs = state.referenceImages.slice().reverse();

    for (const r of refs) {
      const url = r.url || r.cdnUrl || r.localUrl;
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

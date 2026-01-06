import type { Store } from '../state/store';
import type { WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { randomId } from '../atoms/id';
import { openImagePreview } from '../atoms/image-preview';

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function createImgWithFallback(params: { urls: string[]; className: string; alt?: string; aspect?: 'square' | 'rect' }): HTMLElement {
  const wrapper = document.createElement('div');
  if (params.aspect === 'square') wrapper.className = 'w-full aspect-square rounded-lg overflow-hidden border border-white/5 bg-black/20';
  else if (params.aspect === 'rect') wrapper.className = 'w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/5 bg-black/20';
  else wrapper.className = 'w-full rounded-xl overflow-hidden border border-white/5 bg-black/20';

  const img = document.createElement('img');
  img.className = params.className;
  img.alt = params.alt || '';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  wrapper.appendChild(img);

  let idx = 0;
  const tryNext = () => {
    const next = params.urls[idx++];
    if (!next) {
      wrapper.innerHTML = '';
      const placeholder = document.createElement('div');
      placeholder.className = 'w-full h-full flex items-center justify-center text-[10px] font-semibold opacity-40 bg-studio-panel border border-white/5';
      placeholder.textContent = '图片失效';
      wrapper.appendChild(placeholder);
      return;
    }
    img.src = next;
  };

  img.addEventListener('error', () => tryNext());
  tryNext();
  return wrapper;
}

function renderHistoryItem(params: {
  item: WorkflowHistoryItem;
  onRestore: (item: WorkflowHistoryItem) => void;
  onDelete: (taskId: string) => void;
}): HTMLElement {
  const item = params.item;
  const card = document.createElement('div');
  card.className =
    'group relative rounded-[2rem] border border-white/5 bg-white/[0.02] p-6 shadow-2xl transition-all duration-500 hover:border-studio-accent/25';

  const timeStr = new Date(item.createdAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const idShort = item.taskId ? item.taskId.slice(-6).toUpperCase() : '------';

  const main = document.createElement('div');
  main.className = 'flex gap-5 items-start';

  // Preview
  const previewWrap = document.createElement('div');
  previewWrap.className =
    'relative w-36 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-black/30 aspect-[4/3]';

  const previewUrls = uniqueStrings([item.gridImageUrl, item.upscaledImages.at(-1)]);
  const preview = createImgWithFallback({
    urls: previewUrls,
    aspect: 'rect',
    className: 'w-full h-full object-contain bg-black/20',
    alt: 'preview',
  });
  previewWrap.appendChild(preview);

  const hoverActions = document.createElement('div');
  hoverActions.className =
    'absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity';
  hoverActions.innerHTML = `
    <div class="absolute top-3 right-3 flex items-center gap-2">
      <button data-action="restore" class="w-10 h-10 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center">
        <i class="fas fa-rotate-left text-[11px]"></i>
      </button>
      <button data-action="delete" class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:border-red-400/30 hover:text-red-300 hover:scale-105 transition-all flex items-center justify-center">
        <i class="fas fa-trash text-[11px]"></i>
      </button>
    </div>
  `;
  previewWrap.appendChild(hoverActions);

  previewWrap.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const src = item.upscaledImages.at(-1) || item.gridImageUrl;
    if (src) openImagePreview(src);
  });

  // Info
  const info = document.createElement('div');
  info.className = 'flex-1 min-w-0';

  const top = document.createElement('div');
  top.className = 'flex items-start justify-between gap-4';
  top.innerHTML = `
    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex items-center gap-3">
        <span class="text-[9px] font-black uppercase tracking-[0.25em] text-studio-accent/80">${timeStr}</span>
        <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">ID:${idShort}</span>
        <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">UPSCALE:${item.upscaledImages.length}</span>
      </div>
    </div>
  `;

  const prompt = document.createElement('div');
  prompt.className = 'mt-4 p-4 bg-white/5 rounded-2xl border border-white/5';
  const promptText = document.createElement('div');
  promptText.className = 'text-[11px] leading-relaxed text-white/70 line-clamp-3 group-hover:line-clamp-none transition-all break-words';
  promptText.textContent = item.prompt;
  prompt.appendChild(promptText);

  const strip = document.createElement('div');
  strip.className = 'mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide';

  const thumb = (url: string, label: string) => {
    const w = document.createElement('div');
    w.className = 'relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/20 cursor-pointer';
    const inner = createImgWithFallback({
      urls: uniqueStrings([url]),
      aspect: 'square',
      className: 'w-full h-full object-contain bg-black/20',
      alt: label,
    });
    w.appendChild(inner);
    const tag = document.createElement('div');
    tag.className = 'absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[6px] font-black uppercase tracking-widest rounded';
    tag.textContent = label;
    w.appendChild(tag);
    w.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImagePreview(url);
    });
    return w;
  };

  if (item.gridImageUrl) strip.appendChild(thumb(item.gridImageUrl, 'GRID'));
  item.upscaledImages.slice(-6).forEach((u, i) => strip.appendChild(thumb(u, `U${Math.max(1, item.upscaledImages.length - 5 + i)}`)));

  info.appendChild(top);
  info.appendChild(prompt);
  if (item.gridImageUrl || item.upscaledImages.length) info.appendChild(strip);

  main.appendChild(previewWrap);
  main.appendChild(info);
  card.appendChild(main);

  // Actions
  const restoreBtn = previewWrap.querySelector<HTMLButtonElement>('button[data-action="restore"]');
  restoreBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    params.onRestore(item);
  });

  const deleteBtn = previewWrap.querySelector<HTMLButtonElement>('button[data-action="delete"]');
  deleteBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm('删除该历史记录？');
    if (!ok) return;
    params.onDelete(item.taskId);
  });

  return card;
}

export function createHistoryView(store: Store<WorkflowState>) {
  const container = byId<HTMLElement>('historyList');
  const countEl = document.getElementById('historyCount');

  function clearHistory() {
    if (!confirm('Are you sure you want to permanently delete all archived snapshots?')) return;
    store.update(s => ({ ...s, history: [] }));
  }

  function onDelete(taskId: string) {
    store.update((s) => ({ ...s, history: s.history.filter((h) => h.taskId !== taskId) }));
  }

  function onRestore(item: WorkflowHistoryItem) {
    const prompt = item.prompt;
    const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
    if (promptInput) {
      promptInput.value = prompt;
      promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    store.update((s) => {
      const first = item.references?.[0];
      if (!first) return { ...s, prompt, step: 4 };

      const existing = s.referenceImages.find((r) => r.id === first.id);
      if (existing) {
        return { ...s, prompt, mjPadRefId: existing.id, step: 4 };
      }

      const url = first.cdnUrl || first.url || first.localUrl;
      if (!url) return { ...s, prompt, step: 4 };

      const id = randomId('ref');
      return {
        ...s,
        prompt,
        referenceImages: [
          ...s.referenceImages,
          { id, name: first.name || 'restored', createdAt: Date.now(), url, cdnUrl: first.cdnUrl, localUrl: first.localUrl },
        ],
        mjPadRefId: id,
        step: 4,
      };
    });
  }

  function render(state: WorkflowState) {
    container.innerHTML = '';
    const items = state.history.slice().reverse();
    if (countEl) countEl.textContent = items.length.toString();
    const countSmall = document.getElementById('historyCountSmall');
    if (countSmall) countSmall.textContent = items.length.toString();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'py-32 flex flex-col items-center justify-center opacity-20';
      empty.innerHTML = `
        <i class="fas fa-folder-open text-4xl mb-6"></i>
        <span class="label-mono uppercase">Archive Interrogator Empty</span>
      `;
      container.appendChild(empty);
      return;
    }

    // Group items by date
    let lastDate = '';
    const listWrapper = document.createElement('div');
    listWrapper.className = 'space-y-12';

    for (const item of items) {
      const d = new Date(item.createdAt);
      const dateStr = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (dateStr !== lastDate) {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'pt-8 pb-4 border-b border-studio-dark/5 mb-8';
        dateHeader.innerHTML = `<span class="label-mono !text-studio-dark opacity-60">${dateStr.toUpperCase()}</span>`;
        listWrapper.appendChild(dateHeader);
        lastDate = dateStr;
      }
      listWrapper.appendChild(renderHistoryItem({ item, onRestore, onDelete }));
    }

    container.appendChild(listWrapper);
  }

  render(store.get());
  store.subscribe(render);
}

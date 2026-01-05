import type { Store } from '../state/store';
import type { ReferenceImage } from '../state/workflow';
import type { WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { randomId } from '../atoms/id';

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

function isLikelyUrl(value: string): boolean {
  const v = value.trim();
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/') || v.startsWith('data:');
}

function normalizeHistoryImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (isLikelyUrl(v)) return v;
  if (v.startsWith('{') && v.endsWith('}')) {
    try {
      const parsed = JSON.parse(v) as any;
      const candidates = [
        parsed?.result,
        parsed?.result?.imageUrl,
        parsed?.result?.url,
        parsed?.result?.cdnUrl,
        parsed?.imageUrl,
        parsed?.url,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && isLikelyUrl(c)) return c.trim();
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

function renderHistoryItem(item: WorkflowHistoryItem, refLookup: Map<string, ReferenceImage>, onRestore: (item: WorkflowHistoryItem) => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'studio-panel p-8 group relative overflow-hidden transition-all duration-500 hover:border-studio-accent/30';

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-6';

  const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  header.innerHTML = `
    <div class="flex flex-col">
      <span class="text-[9px] font-black uppercase tracking-[0.2em] text-studio-accent opacity-40">${timeStr} // ARCHIVE</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-3';

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'px-3 py-1.5 rounded-lg bg-studio-accent/10 text-studio-accent text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all hover:bg-studio-accent hover:text-black';
  restoreBtn.innerHTML = '<i class="fas fa-rotate-left mr-2"></i>Restore';
  restoreBtn.onclick = () => onRestore(item);

  const badge = document.createElement('div');
  badge.className = 'px-3 py-1 bg-white/5 text-white/20 text-[8px] font-mono rounded-md';
  badge.textContent = `ID:${item.taskId.slice(-6).toUpperCase()}`;

  actions.appendChild(restoreBtn);
  actions.appendChild(badge);
  header.appendChild(actions);

  // Prompt
  const promptBox = document.createElement('div');
  promptBox.className = 'mb-8 p-4 bg-white/5 rounded-xl border border-white/5';
  const promptText = document.createElement('p');
  promptText.className = 'text-[11px] font-medium leading-relaxed opacity-40 italic line-clamp-2 group-hover:line-clamp-none transition-all';
  promptText.textContent = item.prompt;
  promptBox.appendChild(promptText);

  // Results Grid
  const resultsGrid = document.createElement('div');
  resultsGrid.className = 'grid grid-cols-4 gap-3';

  const addImg = (url: string, label: string) => {
    const normalized = normalizeHistoryImageUrl(url);
    const wrapper = document.createElement('div');
    wrapper.className = 'relative group/img cursor-pointer';
    const inner = createImgWithFallback({
      urls: uniqueStrings([normalized]),
      aspect: 'square',
      className: 'w-full h-full object-cover transform transition-transform duration-700 group-hover/img:scale-110 grayscale group-hover/img:grayscale-0',
      alt: label,
    });
    wrapper.appendChild(inner);

    const tag = document.createElement('span');
    tag.className = 'absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[6px] font-black uppercase tracking-widest rounded';
    tag.textContent = label;
    wrapper.appendChild(tag);
    resultsGrid.appendChild(wrapper);
  };

  if (item.gridImageUrl) addImg(item.gridImageUrl, 'GRID');
  item.upscaledImages.slice(0, 3).forEach((url, i) => addImg(url, `V${i + 1}`));

  card.appendChild(header);
  card.appendChild(promptBox);
  card.appendChild(resultsGrid);

  return card;
}

export function createHistoryView(store: Store<WorkflowState>) {
  const container = byId<HTMLElement>('historyList');
  const countEl = document.getElementById('historyCount');

  function clearHistory() {
    if (!confirm('Are you sure you want to permanently delete all archived snapshots?')) return;
    store.update(s => ({ ...s, history: [] }));
  }

  (window as any).clearHistory = clearHistory;

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
    const refLookup = new Map(state.referenceImages.map((r) => [r.id, r] as const));
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
      listWrapper.appendChild(renderHistoryItem(item, refLookup, onRestore));
    }

    container.appendChild(listWrapper);
  }

  render(store.get());
  store.subscribe(render);
}

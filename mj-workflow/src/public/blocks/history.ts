import type { Store } from '../state/store';
import type { ReferenceImage } from '../state/workflow';
import type { WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';

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
  if (params.aspect === 'square') wrapper.className = 'w-full aspect-square rounded-lg border border-brand-green/5 overflow-hidden';
  else if (params.aspect === 'rect') wrapper.className = 'w-full aspect-[4/3] rounded-xl overflow-hidden';
  else wrapper.className = 'w-full rounded-xl overflow-hidden';

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
      placeholder.className = 'w-full h-full flex items-center justify-center text-[10px] font-semibold opacity-40 bg-white/70';
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

function renderHistoryItem(item: WorkflowHistoryItem, refLookup: Map<string, ReferenceImage>): HTMLElement {
  const card = document.createElement('div');
  card.className = 'rounded-[1.5rem] border border-brand-green/5 bg-white p-6 shadow-sm hover:shadow-xl transition-all duration-500';

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-6 mb-6';

  const left = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'text-[10px] uppercase tracking-[0.2em] font-black opacity-30 mb-2';
  title.textContent = new Date(item.createdAt).toLocaleString();
  const prompt = document.createElement('div');
  prompt.className = 'text-sm font-medium leading-relaxed text-brand-green/80 break-words line-clamp-2 hover:line-clamp-none transition-all';
  prompt.textContent = item.prompt;
  left.appendChild(title);
  left.appendChild(prompt);

  const right = document.createElement('div');
  right.className = 'badge !bg-brand-green/5 !text-brand-green/30 px-3';
  right.textContent = `ID:${item.taskId.slice(-4)}`;

  header.appendChild(left);
  header.appendChild(right);

  const refs = document.createElement('div');
  refs.className = 'grid grid-cols-4 md:grid-cols-8 gap-3 mb-6';
  for (const r of item.references) {
    const lib = refLookup.get(r.id);
    const urls = uniqueStrings([
      (r as any).localUrl,
      (r as any).cdnUrl,
      r.url,
      lib?.localUrl,
      lib?.cdnUrl,
      lib?.url,
      lib?.dataUrl,
    ]);
    if (!urls.length) continue;
    const thumb = createImgWithFallback({
      urls,
      className: 'w-full h-full object-cover grayscale hover:grayscale-0 transition-all',
      alt: r.name,
      aspect: 'square',
    });
    refs.appendChild(thumb);
  }

  const results = document.createElement('div');
  results.className = 'grid grid-cols-2 gap-4';

  if (item.gridImageUrl) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'relative rounded-xl overflow-hidden shadow-lg';
    imgWrapper.appendChild(
      createImgWithFallback({
        urls: uniqueStrings([item.gridImageUrl]),
        className: 'w-full h-full object-cover',
        alt: 'grid',
        aspect: 'rect',
      }),
    );
    results.appendChild(imgWrapper);
  }

  const lastUpscaled = item.upscaledImages.at(-1);
  if (lastUpscaled) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'relative rounded-xl overflow-hidden shadow-lg';
    imgWrapper.appendChild(
      createImgWithFallback({
        urls: uniqueStrings([lastUpscaled]),
        className: 'w-full h-full object-cover',
        alt: 'upscaled',
        aspect: 'rect',
      }),
    );
    results.appendChild(imgWrapper);
  }

  card.appendChild(header);
  if (refs.childElementCount) card.appendChild(refs);
  if (results.childElementCount) card.appendChild(results);
  return card;
}

export function createHistoryView(store: Store<WorkflowState>) {
  const container = byId<HTMLElement>('historyList');

  function render(state: WorkflowState) {
    container.innerHTML = '';
    const refLookup = new Map(state.referenceImages.map((r) => [r.id, r] as const));
    const items = state.history.slice().reverse();
    for (const item of items) container.appendChild(renderHistoryItem(item, refLookup));
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'text-xs uppercase tracking-widest opacity-40 py-8 text-center';
      empty.textContent = 'No history yet';
      container.appendChild(empty);
    }
  }

  render(store.get());
  store.subscribe(render);
}

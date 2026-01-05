import type { Store } from '../state/store';
import type { WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';

function renderHistoryItem(item: WorkflowHistoryItem): HTMLElement {
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
    if (!r.url) continue;
    const img = document.createElement('img');
    img.className = 'w-full aspect-square object-cover rounded-lg border border-brand-green/5 grayscale hover:grayscale-0 transition-all';
    img.src = r.url;
    img.alt = r.name;
    refs.appendChild(img);
  }

  const results = document.createElement('div');
  results.className = 'grid grid-cols-2 gap-4';

  if (item.gridImageUrl) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'relative rounded-xl overflow-hidden shadow-lg';
    const img = document.createElement('img');
    img.className = 'w-full aspect-[4/3] object-cover';
    img.src = item.gridImageUrl;
    imgWrapper.appendChild(img);
    results.appendChild(imgWrapper);
  }

  const lastUpscaled = item.upscaledImages.at(-1);
  if (lastUpscaled) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'relative rounded-xl overflow-hidden shadow-lg';
    const img = document.createElement('img');
    img.className = 'w-full aspect-[4/3] object-cover';
    img.src = lastUpscaled;
    imgWrapper.appendChild(img);
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
    const items = state.history.slice().reverse();
    for (const item of items) container.appendChild(renderHistoryItem(item));
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


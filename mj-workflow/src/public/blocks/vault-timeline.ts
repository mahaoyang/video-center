import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { escapeHtml } from '../atoms/html';
import { openImagePreview } from '../atoms/image-preview';
import { setTraceOpen, setVaultOpen } from '../atoms/overlays';
import { deriveTimelineItems, type TimelineItem, type TimelineResource } from '../state/timeline';
import type { ApiClient } from '../adapters/api';
import { cleanupOrphanUploads } from '../headless/uploads-gc';
import { clearVaultMessages, deleteVaultMessage } from '../headless/conversation-actions';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function kindLabel(kind: TimelineItem['kind']): string {
  if (kind === 'generate') return 'MJ / GRID';
  if (kind === 'upscale') return 'MJ / UPSCALE';
  if (kind === 'pedit') return 'GEMINI / IMAGE';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'deconstruct') return 'DESCRIBE';
  return kind.toUpperCase();
}

function roleLabel(role: TimelineItem['role']): string {
  return role === 'user' ? 'USER' : 'AI';
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderResource(res: TimelineResource): string {
  const label = typeof res.label === 'string' && res.label.trim() ? res.label.trim() : '';
  const title = label || (res.type === 'video' ? 'VIDEO' : 'IMAGE');
  const labelHtml = label
    ? `<div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[6px] font-black uppercase tracking-widest rounded">${escapeHtml(label)}</div>`
    : '';

  if (res.type === 'video') {
    const thumb = typeof res.thumbUrl === 'string' && res.thumbUrl.trim() ? res.thumbUrl.trim() : '';
    const thumbHtml = thumb
      ? `<img src="${escapeHtml(thumb)}" referrerpolicy="no-referrer" class="w-full h-full object-cover bg-black/30" />`
      : `<div class="w-full h-full flex items-center justify-center bg-black/30 text-white/40"><i class="fas fa-film"></i></div>`;
    return `
      <a data-vault-resource="1" data-type="video" data-url="${escapeHtml(res.url)}"
        title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"
        class="relative w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:border-studio-accent/40 transition-all cursor-pointer">
        ${thumbHtml}
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-8 h-8 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center text-white/80">
            <i class="fas fa-play text-[10px]"></i>
          </div>
        </div>
        ${labelHtml}
      </a>
    `;
  }

  return `
    <button data-vault-resource="1" data-type="image" data-url="${escapeHtml(res.url)}" type="button"
      title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"
      class="relative w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:border-studio-accent/40 transition-all">
      <img src="${escapeHtml(res.url)}" referrerpolicy="no-referrer" class="w-full h-full object-cover bg-black/30" />
      ${labelHtml}
    </button>
  `;
}

function renderTimelineItem(item: TimelineItem): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative';
  wrap.dataset.vaultItemId = item.id;

  const time = formatTime(item.createdAt);
  const title = kindLabel(item.kind);
  const role = roleLabel(item.role);
  const provider = item.provider ? String(item.provider).toUpperCase() : '';
  const progress = typeof item.progress === 'number' ? `${Math.round(item.progress)}%` : '';
  const hasError = Boolean(item.error && item.error.trim());

  const text = typeof item.text === 'string' ? item.text.trim() : '';
  const safeText = escapeHtml(text || '（无文本）');

  const resources = Array.isArray(item.resources) ? item.resources.slice(0, 6) : [];
  const resourcesHtml = resources.length
    ? `<div class="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">${resources.map(renderResource).join('')}</div>`
    : '';

  const errorHtml = hasError
    ? `<div class="mt-4 p-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-[10px] font-mono text-red-200/90">${escapeHtml(
        item.error || ''
      )}</div>`
    : '';

  wrap.innerHTML = `
    <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full ${hasError ? 'bg-red-400' : 'bg-studio-accent'} shadow-[0_0_12px_rgba(197,243,65,0.35)]"></div>
    <div class="ml-10 group relative rounded-[2rem] border border-white/5 bg-white/[0.02] p-6 shadow-2xl transition-all duration-500 hover:border-studio-accent/25">
      <button data-vault-action="trace" type="button"
        class="absolute top-4 right-14 w-9 h-9 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/30 hover:text-white hover:scale-105 transition-all flex items-center justify-center"
        title="链路追踪">
        <i class="fas fa-sitemap text-[11px]"></i>
      </button>
      <button data-vault-action="delete" type="button"
        class="absolute top-4 right-4 w-9 h-9 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-red-400/30 hover:text-red-300 hover:scale-105 transition-all flex items-center justify-center"
        title="Delete">
        <i class="fas fa-trash text-[11px]"></i>
      </button>

      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-[9px] font-black uppercase tracking-[0.25em] text-studio-accent/80">${escapeHtml(time)}</span>
            <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/60">${escapeHtml(
              title
            )}</span>
            <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(role)}${
              provider ? ` · ${escapeHtml(provider)}` : ''
            }</span>
            ${progress ? `<span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(progress)}</span>` : ''}
          </div>

          <div class="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5">
            <div class="text-[11px] leading-relaxed text-white/75 break-words whitespace-pre-wrap line-clamp-4 group-hover:line-clamp-none transition-all">${safeText}</div>
          </div>

          ${resourcesHtml}
          ${errorHtml}
        </div>
      </div>
    </div>
  `;

  return wrap;
}

export function createVaultTimeline(params: { store: Store<WorkflowState>; api: ApiClient }) {
  const list = byId<HTMLElement>('historyList');

  const clearBtn = document.getElementById('clearConversationBtn') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('saveConversationBtn') as HTMLButtonElement | null;

  function deleteItem(id: string) {
    params.store.update((s) => deleteVaultMessage(s, id));
    void cleanupOrphanUploads({ api: params.api, state: params.store.get(), minAgeSeconds: 0 });
  }

  function clearAll() {
    if (!confirm('清空全部历史记录？（仅删除本地浏览器缓存，不影响 CDN）')) return;
    params.store.update((s) => clearVaultMessages(s));
    void cleanupOrphanUploads({ api: params.api, state: params.store.get(), minAgeSeconds: 0 });
  }

  function saveAll() {
    const data = params.store.get().streamMessages;
    const filename = `mj-vault-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    downloadJson(filename, { version: 1, exportedAt: Date.now(), messages: data });
  }

  clearBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearAll();
  });
  saveBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveAll();
  });

  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const actionBtn = target.closest<HTMLElement>('[data-vault-action]');
    if (actionBtn?.dataset.vaultAction === 'delete') {
      e.preventDefault();
      e.stopPropagation();
      const row = actionBtn.closest<HTMLElement>('[data-vault-item-id]');
      const id = row?.dataset.vaultItemId || '';
      if (!id) return;
      if (!confirm('删除该条历史记录？')) return;
      deleteItem(id);
      return;
    }
    if (actionBtn?.dataset.vaultAction === 'trace') {
      e.preventDefault();
      e.stopPropagation();
      const row = actionBtn.closest<HTMLElement>('[data-vault-item-id]');
      const id = row?.dataset.vaultItemId || '';
      if (!id) return;
      params.store.update((s) => ({ ...s, traceTarget: { type: 'message', id }, traceReturnTo: 'vault' }));
      setVaultOpen(false);
      setTraceOpen(true);
      return;
    }

    const resEl = target.closest<HTMLElement>('[data-vault-resource="1"]');
    if (!resEl) return;
    e.preventDefault();
    e.stopPropagation();
    const mouse = e as MouseEvent;
    const type = resEl.dataset.type;
    const url = resEl.dataset.url || '';
    if (!url) return;
    if (mouse.ctrlKey || mouse.metaKey) {
      params.store.update((s) => ({
        ...s,
        traceTarget: { type: 'url', url, resourceType: type === 'video' ? 'video' : 'image' },
        traceReturnTo: 'vault',
      }));
      setVaultOpen(false);
      setTraceOpen(true);
      return;
    }
    if (type === 'image') openImagePreview(url);
    else window.open(url, '_blank', 'noreferrer');
  });

  function render(state: WorkflowState) {
    const items = deriveTimelineItems(state.streamMessages || []);
    const countEl = document.getElementById('conversationCount');
    if (countEl) countEl.textContent = String(items.length || 0);

    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'py-28 flex flex-col items-center justify-center opacity-20';
      empty.innerHTML = `
        <i class="fas fa-clock-rotate-left text-4xl mb-6"></i>
        <span class="text-[10px] font-black uppercase tracking-[0.3em]">Timeline Empty</span>
        <span class="mt-2 text-[9px] font-mono opacity-40">No local records</span>
      `;
      list.appendChild(empty);
      return;
    }

    const rail = document.createElement('div');
    rail.className = 'relative';
    rail.innerHTML = `<div class="absolute left-3 top-0 bottom-0 w-px bg-white/10"></div>`;
    const stack = document.createElement('div');
    stack.className = 'space-y-8';

    for (const it of items.slice().reverse()) {
      stack.appendChild(renderTimelineItem(it));
    }

    rail.appendChild(stack);
    list.appendChild(rail);
  }

  render(params.store.get());
  params.store.subscribe(render);
}

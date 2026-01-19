import { escapeHtml } from '../atoms/html';
import { openImagePreview } from '../atoms/image-preview';
import { toAppImageSrc } from '../atoms/image-src';
import { toAppVideoSrc } from '../atoms/video-src';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { setTraceOpen, setVaultOpen } from '../atoms/overlays';
import { byId } from '../atoms/ui';
import type { Store } from '../state/store';
import type { StreamMessage, TraceTarget, WorkflowState } from '../state/workflow';
import { deriveTraceNodes, type TraceNode } from '../state/trace';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function kindLabel(kind: StreamMessage['kind']): string {
  if (kind === 'generate') return 'MJ / GRID';
  if (kind === 'upscale') return 'MJ / UPSCALE';
  if (kind === 'pedit') return 'GEMINI / IMAGE';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'deconstruct') return 'DESCRIBE';
  if (kind === 'suno') return 'SUNO';
  return String(kind || '').toUpperCase();
}

type TraceResource = { type: 'image' | 'video'; url: string; thumbUrl?: string; label?: string };

function messageShortText(m: StreamMessage): string {
  const raw =
    m.kind === 'generate' && typeof m.userPrompt === 'string' && m.userPrompt.trim()
      ? m.userPrompt
      : typeof m.text === 'string'
        ? m.text
        : '';
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '（无文本）';
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
}

function messageResources(m: StreamMessage): TraceResource[] {
  const out: TraceResource[] = [];
  const push = (r: TraceResource) => {
    const u = String(r.url || '').trim();
    if (!u) return;
    if (out.some((x) => x.type === r.type && x.url === u)) return;
    out.push({ ...r, url: u });
  };

  if (m.kind === 'generate' && typeof m.gridImageUrl === 'string') push({ type: 'image', url: m.gridImageUrl, label: 'GRID' });
  if (m.kind === 'upscale' && typeof m.upscaledImageUrl === 'string')
    push({ type: 'image', url: m.upscaledImageUrl, label: 'UPSCALE' });
  if (m.kind === 'pedit') {
    const urls = Array.isArray(m.peditImageUrls) && m.peditImageUrls.length ? m.peditImageUrls : m.peditImageUrl ? [m.peditImageUrl] : [];
    urls.forEach((u, idx) => push({ type: 'image', url: u, label: `OUT ${idx + 1}` }));
  }
  if (m.kind === 'video') {
    if (typeof m.thumbnailUrl === 'string') push({ type: 'image', url: m.thumbnailUrl, label: 'THUMB' });
    if (typeof m.videoUrl === 'string') push({ type: 'video', url: m.videoUrl, thumbUrl: m.thumbnailUrl, label: 'VIDEO' });
  }
  if (m.kind === 'deconstruct' && typeof m.imageUrl === 'string') push({ type: 'image', url: m.imageUrl, label: 'INPUT' });

  return out;
}

function renderResource(res: TraceResource): string {
  const label = typeof res.label === 'string' && res.label.trim() ? res.label.trim() : '';
  const title = label || (res.type === 'video' ? 'VIDEO' : 'IMAGE');
  const labelHtml = label
    ? `<div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[6px] font-black uppercase tracking-widest rounded">${escapeHtml(label)}</div>`
    : '';

  if (res.type === 'video') {
    const thumb = typeof res.thumbUrl === 'string' && res.thumbUrl.trim() ? toAppImageSrc(res.thumbUrl) : '';
    const thumbHtml = thumb
      ? `<img src="${escapeHtml(thumb)}" referrerpolicy="no-referrer" class="w-full h-full object-cover bg-black/30" />`
      : `<div class="w-full h-full flex items-center justify-center bg-black/30 text-white/40"><i class="fas fa-film"></i></div>`;
    return `
      <a data-trace-resource="1" data-type="video" data-url="${escapeHtml(res.url)}"
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

  const src = toAppImageSrc(res.url);
  return `
    <button data-trace-resource="1" data-type="image" data-url="${escapeHtml(res.url)}" type="button"
      title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"
      class="relative w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:border-studio-accent/40 transition-all">
      <img src="${escapeHtml(src)}" referrerpolicy="no-referrer" class="w-full h-full object-cover bg-black/30" />
      ${labelHtml}
    </button>
  `;
}

function childMessages(state: WorkflowState, parentId: string): StreamMessage[] {
  const pid = String(parentId || '').trim();
  if (!pid) return [];
  return (state.streamMessages || [])
    .filter((m) => typeof m.parentMessageId === 'string' && m.parentMessageId === pid && m.role === 'ai')
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderBranchList(state: WorkflowState, msg: StreamMessage): string {
  const all = childMessages(state, msg.id);
  const total = all.length;
  const children = all.slice(0, 12);
  if (total <= 0) return '';

  const itemsHtml = children
    .map((c) => {
      const title = kindLabel(c.kind);
      const time = formatTime(c.createdAt || Date.now());
      const text = messageShortText(c);
      const res = messageResources(c).slice(0, 2);
      const resHtml = res.length ? `<div class="flex items-center gap-1.5">${res.map(renderResource).join('')}</div>` : '';
      return `
        <button data-trace-action="open-message" data-message-id="${escapeHtml(c.id)}" type="button"
          class="w-full p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-studio-accent/35 transition-all text-left">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/60">${escapeHtml(
                  title
                )}</span>
                <span class="text-[8px] font-mono opacity-35">${escapeHtml(time)}</span>
              </div>
              <div class="mt-2 text-[9px] leading-relaxed text-white/70 break-words whitespace-pre-wrap line-clamp-2">${escapeHtml(
                text
              )}</div>
            </div>
            ${resHtml ? `<div class="flex-shrink-0">${resHtml}</div>` : ''}
          </div>
        </button>
      `;
    })
    .join('');

  const more = total > children.length ? `<div class="mt-2 text-[8px] font-mono opacity-30">+${total - children.length} more</div>` : '';

  return `
    <details class="mt-4">
      <summary class="cursor-pointer text-[9px] font-black uppercase tracking-[0.2em] opacity-30 hover:opacity-60 transition-all">
        Branches (${escapeHtml(String(total))})
      </summary>
      <div class="mt-3 space-y-2">
        ${itemsHtml}
        ${more}
      </div>
    </details>
  `;
}

function applyPromptToMainInput(text: string) {
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;
  promptInput.value = text;
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function focusMainPrompt() {
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;
  promptInput.focus();
  try {
    const len = promptInput.value.length;
    promptInput.setSelectionRange(len, len);
  } catch {
    // ignore
  }
}

function nodeKey(node: TraceNode): string {
  if (node.type === 'message') return `message:${node.id}`;
  if (node.type === 'ref') return `ref:${node.id}`;
  return `meta:${node.key}:${node.value}`;
}

function targetKey(target: TraceTarget): string {
  if (target.type === 'message') return `message:${target.id}`;
  if (target.type === 'ref') return `ref:${target.id}`;
  return `url:${target.url}`;
}

function renderNode(state: WorkflowState, node: TraceNode, currentTarget: TraceTarget): string {
  const isCurrent = nodeKey(node) === targetKey(currentTarget);

  if (node.type === 'meta') {
    return `
      <div class="relative" data-trace-node="1" data-trace-node-key="${escapeHtml(nodeKey(node))}">
        <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full bg-white/20"></div>
        <div class="ml-10 rounded-[2rem] border border-white/5 bg-white/[0.02] p-6">
          <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">${escapeHtml(node.key)}</div>
          <div class="mt-2 text-[10px] font-mono opacity-40 break-words">${escapeHtml(node.value)}</div>
        </div>
      </div>
    `;
  }

  if (node.type === 'ref') {
    const ref = (state.referenceImages || []).find((r) => r.id === node.id);
    if (!ref) {
      return `
        <div class="relative pl-10" data-trace-node="1" data-trace-node-key="${escapeHtml(nodeKey(node))}" ${isCurrent ? 'data-trace-current="1"' : ''}>
          <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full bg-white/20"></div>
          <div class="ml-10 rounded-[2rem] border border-white/5 bg-white/[0.02] p-6">
            <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">REF</div>
            <div class="mt-2 text-[10px] font-mono opacity-40">Missing ref: ${escapeHtml(node.id)}</div>
          </div>
        </div>
      `;
    }

    const preview = ref.dataUrl || ref.cdnUrl || ref.url || ref.localUrl || '';
    const originKey = typeof ref.originKey === 'string' ? ref.originKey : '';
    const localPath = typeof ref.localPath === 'string' ? ref.localPath : '';
    const localKey = typeof ref.localKey === 'string' ? ref.localKey : '';
    const cdnUrl = typeof ref.cdnUrl === 'string' ? ref.cdnUrl : '';
    const url = typeof ref.url === 'string' ? ref.url : '';
    const localUrl = typeof ref.localUrl === 'string' ? ref.localUrl : '';

    const currentBadge = isCurrent
      ? `<span class="px-2 py-1 rounded-lg bg-studio-accent text-[8px] font-black uppercase tracking-widest text-studio-bg">CURRENT</span>`
      : '';

    return `
      <div class="relative" data-trace-node="1" data-trace-node-key="${escapeHtml(nodeKey(node))}" ${isCurrent ? 'data-trace-current="1"' : ''}>
        <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full bg-white/30"></div>
        <div class="ml-10 rounded-[2rem] border ${isCurrent ? 'border-studio-accent/35 shadow-[0_0_30px_rgba(197,243,65,0.12)]' : 'border-white/5'} bg-white/[0.02] p-6 hover:border-studio-accent/20 transition-all">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-3 flex-wrap">
                <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/60">REF</span>
                <span class="text-[9px] font-mono opacity-35">${escapeHtml(formatTime(ref.createdAt || Date.now()))}</span>
                ${currentBadge}
              </div>
              <div class="mt-3 text-[12px] font-semibold text-white/80 truncate">${escapeHtml(ref.name || ref.id)}</div>
              <div class="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                ${preview ? renderResource({ type: 'image', url: preview, label: 'PREVIEW' }) : ''}
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button data-trace-action="set-pad" data-ref-id="${escapeHtml(ref.id)}" type="button"
                class="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:border-studio-accent/40 hover:text-white transition-all">
                PAD
              </button>
              <button data-trace-action="set-start" data-ref-id="${escapeHtml(ref.id)}" type="button"
                class="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:border-studio-accent/40 hover:text-white transition-all">
                START
              </button>
              <button data-trace-action="set-end" data-ref-id="${escapeHtml(ref.id)}" type="button"
                class="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:border-studio-accent/40 hover:text-white transition-all">
                END
              </button>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-1 gap-3">
            ${originKey ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">originKey: ${escapeHtml(originKey)}</div>` : ''}
            ${localPath ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">localPath: ${escapeHtml(localPath)}</div>` : ''}
            ${localKey ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">localKey: ${escapeHtml(localKey)}</div>` : ''}
            ${cdnUrl ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">cdnUrl: ${escapeHtml(cdnUrl)}</div>` : ''}
            ${url ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">url: ${escapeHtml(url)}</div>` : ''}
            ${localUrl ? `<div class="p-3 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-mono opacity-60 break-words">localUrl: ${escapeHtml(localUrl)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  const msg = (state.streamMessages || []).find((m) => m.id === node.id);
  if (!msg) {
    return `
      <div class="relative pl-10">
        <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full bg-red-400"></div>
        <div class="ml-10 rounded-[2rem] border border-white/5 bg-white/[0.02] p-6">
          <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">MESSAGE</div>
          <div class="mt-2 text-[10px] font-mono opacity-40">Missing message: ${escapeHtml(node.id)}</div>
        </div>
      </div>
    `;
  }

  const time = formatTime(msg.createdAt || Date.now());
  const title = kindLabel(msg.kind);
  const provider = typeof msg.provider === 'string' && msg.provider.trim() ? msg.provider.trim().toUpperCase() : '';
  const progress = typeof msg.progress === 'number' ? `${Math.round(msg.progress)}%` : '';
  const hasError = Boolean(msg.error && msg.error.trim());
  const isHead = typeof state.traceHeadMessageId === 'string' && state.traceHeadMessageId === msg.id;
  const childCount = (state.streamMessages || []).filter((m) => typeof m.parentMessageId === 'string' && m.parentMessageId === msg.id).length;

  const promptPrimary =
    msg.kind === 'generate' && typeof msg.userPrompt === 'string' && msg.userPrompt.trim() ? msg.userPrompt.trim() : (msg.text || '').trim();
  const promptSecondary =
    msg.kind === 'generate' && typeof msg.userPrompt === 'string' && msg.userPrompt.trim() && typeof msg.text === 'string' && msg.text.trim()
      ? msg.text.trim()
      : '';

  const resources = messageResources(msg);
  const resourcesHtml = resources.length
    ? `<div class="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">${resources.map(renderResource).join('')}</div>`
    : '';
  const branchesHtml = renderBranchList(state, msg);

  const errorHtml = hasError
    ? `<div class="mt-4 p-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-[10px] font-mono text-red-200/90">${escapeHtml(
        msg.error || ''
      )}</div>`
    : '';

  const inputRefs = (() => {
    if (msg.kind === 'generate') {
      const padIds = (Array.isArray(msg.mjPadRefIds) ? msg.mjPadRefIds : typeof msg.mjPadRefId === 'string' ? [msg.mjPadRefId] : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12);
      return [...padIds, msg.mjSrefRefId, msg.mjCrefRefId].filter(
        (x): x is string => typeof x === 'string' && x.trim()
      );
    }
    if (msg.kind === 'pedit') return (Array.isArray(msg.refIds) ? msg.refIds : msg.refId ? [msg.refId] : []).filter(Boolean);
    if (msg.kind === 'suno') return (Array.isArray(msg.refIds) ? msg.refIds : []).filter(Boolean);
    if (msg.kind === 'video') {
      const provider = String(msg.provider || '').trim();
      const mvSeqRaw = Array.isArray((msg as any).mvSequence) ? (msg as any).mvSequence : [];
      const mvRefs =
        provider === 'mv'
          ? mvSeqRaw
              .map((it: any) => String(it?.refId || '').trim())
              .filter(Boolean)
              .slice(0, 24)
          : [];
      if (mvRefs.length) return mvRefs;
      return [msg.videoStartRefId, msg.videoEndRefId].filter((x): x is string => typeof x === 'string' && x.trim());
    }
    if (msg.kind === 'deconstruct') return msg.refId ? [msg.refId] : [];
    return [];
  })();

  const inputRefsHtml = inputRefs.length
    ? `
      <div class="mt-4 flex items-center gap-2 flex-wrap">
        ${inputRefs
          .map((id) => {
            const r = (state.referenceImages || []).find((x) => x.id === id);
            const label = r?.name || id;
            return `<button data-trace-action="open-ref" data-ref-id="${escapeHtml(id)}" type="button"
              class="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-[0.16em] text-white/60 hover:border-studio-accent/40 hover:text-white transition-all">
              ${escapeHtml(label)}
            </button>`;
          })
          .join('')}
      </div>
    `
    : '';

  const metaBadges: string[] = [];
  if (isCurrent) metaBadges.push(`<span class="px-2 py-1 rounded-lg bg-studio-accent text-[8px] font-black uppercase tracking-widest text-studio-bg">CURRENT</span>`);
  if (isHead) metaBadges.push(`<span class="px-2 py-1 rounded-lg bg-studio-accent text-[8px] font-black uppercase tracking-widest text-studio-bg">HEAD</span>`);
  if (provider) metaBadges.push(`<span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(provider)}</span>`);
  if (msg.kind === 'video' && typeof msg.videoModel === 'string' && msg.videoModel.trim())
    metaBadges.push(`<span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(msg.videoModel.trim())}</span>`);
  if (progress) metaBadges.push(`<span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(progress)}</span>`);
  if (childCount > 0)
    metaBadges.push(
      `<span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-mono text-white/30">${escapeHtml(String(childCount))} BR</span>`
    );

  const secondaryHtml = promptSecondary
    ? `<details class="mt-3">
        <summary class="cursor-pointer text-[9px] font-black uppercase tracking-[0.2em] opacity-30 hover:opacity-60 transition-all">Final Prompt</summary>
        <div class="mt-2 p-4 bg-white/5 rounded-2xl border border-white/5">
          <div class="text-[10px] leading-relaxed text-white/70 break-words whitespace-pre-wrap">${escapeHtml(promptSecondary)}</div>
        </div>
      </details>`
    : '';

  return `
    <div class="relative" data-trace-node="1" data-trace-node-key="${escapeHtml(nodeKey(node))}" ${isCurrent ? 'data-trace-current="1"' : ''}>
      <div class="absolute left-3 top-7 w-2.5 h-2.5 rounded-full ${hasError ? 'bg-red-400' : 'bg-studio-accent'} shadow-[0_0_12px_rgba(197,243,65,0.35)]"></div>
      <div class="ml-10 rounded-[2rem] border ${isCurrent ? 'border-studio-accent/35 shadow-[0_0_30px_rgba(197,243,65,0.12)]' : 'border-white/5'} bg-white/[0.02] p-6 shadow-2xl transition-all duration-500 hover:border-studio-accent/25">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-[9px] font-black uppercase tracking-[0.25em] text-studio-accent/80">${escapeHtml(time)}</span>
              <span class="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/60">${escapeHtml(
                title
              )}</span>
              ${metaBadges.join('')}
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button data-trace-action="redo" data-message-id="${escapeHtml(msg.id)}" type="button"
              class="px-4 py-2 rounded-2xl bg-studio-accent text-studio-bg text-[9px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(197,243,65,0.18)]">
              回填
            </button>
          </div>
        </div>

        <div class="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5">
          <div class="text-[10px] leading-relaxed text-white/75 break-words whitespace-pre-wrap">${escapeHtml(
            promptPrimary || '（无文本）'
          )}</div>
        </div>
        ${secondaryHtml}
        ${inputRefsHtml}
        ${resourcesHtml}
        ${branchesHtml}
        ${errorHtml}
      </div>
    </div>
  `;
}

export function createTraceBlock(params: {
  store: Store<WorkflowState>;
}) {
  const content = byId<HTMLElement>('traceContent');
  const subtitle = byId<HTMLElement>('traceSubtitle');
  const closeBtn = document.getElementById('traceCloseBtn') as HTMLButtonElement | null;
  const backdrop = document.getElementById('traceBackdrop') as HTMLElement | null;
  let lastTarget: string | undefined;

  function setTarget(next: TraceTarget) {
    params.store.update((s) => ({ ...s, traceTarget: next }));
  }

  function scrollToCurrent() {
    window.setTimeout(() => {
      const current = content.querySelector<HTMLElement>('[data-trace-current="1"]');
      if (!current) return;
      const cRect = content.getBoundingClientRect();
      const nRect = current.getBoundingClientRect();
      const delta = nRect.top - cRect.top - cRect.height / 2 + nRect.height / 2;
      content.scrollTop += delta;
    }, 0);
  }

  function closeWithReturn() {
    const ret = params.store.get().traceReturnTo;
    params.store.update((s) => ({ ...s, traceReturnTo: undefined }));
    setTraceOpen(false);
    if (ret === 'vault') setVaultOpen(true);
  }

  function closeToMainWorkspace() {
    params.store.update((s) => ({ ...s, traceReturnTo: undefined }));
    setTraceOpen(false);
  }

  function scrollMessageIntoView(messageId: string) {
    const id = String(messageId || '').trim();
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-1', 'ring-studio-accent/30');
    window.setTimeout(() => el.classList.remove('ring-1', 'ring-studio-accent/30'), 1200);
  }

  async function redoMessage(messageId: string) {
    const s = params.store.get();
    const msg = (s.streamMessages || []).find((m) => m.id === messageId);
    if (!msg) return showError('找不到该记录');

    try {
      if (msg.kind === 'generate') {
        const prompt = (typeof msg.userPrompt === 'string' && msg.userPrompt.trim() ? msg.userPrompt.trim() : msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        applyPromptToMainInput(prompt);
        params.store.update((st) => {
          const padRefIds = (Array.isArray(msg.mjPadRefIds) ? msg.mjPadRefIds : typeof msg.mjPadRefId === 'string' ? [msg.mjPadRefId] : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean)
            .slice(0, 12);
          const ids = [...padRefIds, msg.mjSrefRefId, msg.mjCrefRefId].filter(
            (x): x is string => typeof x === 'string' && x.trim()
          );
          return {
            ...st,
            traceHeadMessageId: msg.id,
            commandMode: 'mj',
            mjPadRefIds: padRefIds.length ? padRefIds : st.mjPadRefIds,
            mjSrefRefId: typeof msg.mjSrefRefId === 'string' ? msg.mjSrefRefId : st.mjSrefRefId,
            mjCrefRefId: typeof msg.mjCrefRefId === 'string' ? msg.mjCrefRefId : st.mjCrefRefId,
            mjSrefImageUrl: typeof msg.mjSrefImageUrl === 'string' ? msg.mjSrefImageUrl : st.mjSrefImageUrl,
            mjCrefImageUrl: typeof msg.mjCrefImageUrl === 'string' ? msg.mjCrefImageUrl : st.mjCrefImageUrl,
            selectedReferenceIds: Array.from(new Set([...(st.selectedReferenceIds || []), ...ids])),
          };
        });
        closeToMainWorkspace();
        focusMainPrompt();
        showMessage('已回填到输入区（可修改素材/提示词），点击发送即可重新生成（MJ / GRID）');
        return;
      }

      if (msg.kind === 'upscale') {
        const srcTaskId = typeof msg.upscaleSourceTaskId === 'string' ? msg.upscaleSourceTaskId : '';
        const idx = typeof msg.upscaleIndex === 'number' ? msg.upscaleIndex : NaN;
        if (!srcTaskId || !Number.isFinite(idx)) return showError('该扩图记录缺少来源 taskId / index（无法重做）');
        const parent = (s.streamMessages || []).find((m) => m.kind === 'generate' && m.taskId === srcTaskId);
        if (parent?.id) scrollMessageIntoView(parent.id);
        params.store.update((st) => ({ ...st, traceHeadMessageId: parent?.id || st.traceHeadMessageId }));
        closeToMainWorkspace();
        showMessage(`已定位到源 GRID（V${idx}），请在卡片上点 Upscale 重新扩图`);
        return;
      }

      if (msg.kind === 'deconstruct') {
        const refId = typeof msg.refId === 'string' ? msg.refId : '';
        if (!refId) return showError('该描述记录缺少 refId（无法重做）');
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'deconstruct',
          selectedReferenceIds: [refId],
          activeImageId: refId,
        }));
        closeToMainWorkspace();
        showMessage('已回填素材（DESCRIBE），点击发送即可重新描述');
        return;
      }

      if (msg.kind === 'pedit') {
        const prompt = (msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        const refIds = Array.isArray(msg.refIds) ? msg.refIds : msg.refId ? [msg.refId] : [];
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'pedit',
          selectedReferenceIds: refIds.filter(Boolean),
          gimageAspect: typeof msg.gimageAspect === 'string' ? msg.gimageAspect : st.gimageAspect,
          gimageSize: typeof msg.gimageSize === 'string' ? msg.gimageSize : st.gimageSize,
        }));
        applyPromptToMainInput(prompt);
        closeToMainWorkspace();
        focusMainPrompt();
        showMessage('已回填到输入区（GEMINI / IMAGE），可修改参考图/提示词/尺寸，点击发送即可重新生成');
        return;
      }

      if (msg.kind === 'video') {
        const prompt = (msg.text || '').trim();
        if (!prompt) return showError('提示词为空');

        const isMv =
          String(msg.provider || '').trim() === 'mv' || Boolean(msg.mvResolution || (msg as any).mvSequence || msg.mvSubtitleSrt);
	        if (isMv) {
	          const mvVideoUrl = typeof msg.mvVideoUrl === 'string' ? msg.mvVideoUrl : undefined;
	          const mvAudioUrl = typeof msg.mvAudioUrl === 'string' ? msg.mvAudioUrl : undefined;
	          const mvSrt = typeof msg.mvSubtitleSrt === 'string' ? msg.mvSubtitleSrt : '';
	          const mvSeqRaw = Array.isArray((msg as any).mvSequence) ? (msg as any).mvSequence : [];

	          params.store.update((st) => {
	            const mediaAssets = Array.isArray(st.mediaAssets) ? st.mediaAssets.slice() : [];

	            const ensureUrlAsset = (kind: 'video' | 'audio', url: string | undefined) => {
	              if (!url) return undefined;
	              const existing = mediaAssets.find((a) => a.kind === kind && (a.localUrl === url || a.url === url));
	              if (existing) return existing.id;
	              const name = url.split('/').pop() || `${kind}`;
	              const id = randomId('asset');
	              mediaAssets.push({ id, kind, name, createdAt: Date.now(), url, localUrl: url.startsWith('/uploads/') ? url : undefined });
	              return id;
	            };

	            const ensureSubtitleAsset = (srt: string) => {
	              const text = String(srt || '').trim();
	              if (!text) return undefined;
	              const existing = mediaAssets.find((a) => a.kind === 'subtitle' && typeof a.text === 'string' && a.text.trim() === text);
	              if (existing) return existing.id;
	              const id = randomId('asset');
	              mediaAssets.push({ id, kind: 'subtitle', name: `subtitle-${new Date().toISOString().slice(0, 10)}.srt`, createdAt: Date.now(), text });
	              return id;
	            };

	            const videoAssetId = ensureUrlAsset('video', mvVideoUrl);
	            const audioAssetId = ensureUrlAsset('audio', mvAudioUrl);
	            const subtitleAssetId = ensureSubtitleAsset(mvSrt);

	            const selectedRefIds = mvSeqRaw
	              .map((it: any) => String(it?.refId || '').trim())
	              .filter(Boolean)
	              .slice(0, 24);

	            return {
	              ...st,
	              traceHeadMessageId: msg.id,
	              commandMode: 'mv-mix',
	              mediaAssets: mediaAssets.slice(-120),
	              mvResolution: typeof msg.mvResolution === 'string' ? msg.mvResolution : st.mvResolution,
	              mvFps: typeof msg.mvFps === 'number' ? msg.mvFps : st.mvFps,
	              mvDurationSeconds: typeof msg.mvDurationSeconds === 'number' ? msg.mvDurationSeconds : st.mvDurationSeconds,
	              mvSubtitleMode: msg.mvSubtitleMode === 'burn' ? 'burn' : 'soft',
	              selectedReferenceIds: selectedRefIds,
	              mvVideoAssetId: videoAssetId || st.mvVideoAssetId,
	              mvAudioAssetId: audioAssetId || st.mvAudioAssetId,
	              mvSubtitleAssetId: subtitleAssetId || st.mvSubtitleAssetId,
	            };
	          });

	          applyPromptToMainInput(prompt);

	          closeToMainWorkspace();
	          focusMainPrompt();
	          showMessage('已回填到输入区（MV），可修改素材/字幕/参数，点击发送即可重新合成');
	          return;
	        }

        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'video',
          videoProvider: msg.provider === 'jimeng' || msg.provider === 'kling' || msg.provider === 'gemini' ? (msg.provider as any) : st.videoProvider,
          videoModel: typeof msg.videoModel === 'string' ? msg.videoModel : st.videoModel,
          videoSeconds: typeof msg.videoSeconds === 'number' ? msg.videoSeconds : st.videoSeconds,
          videoMode: typeof msg.videoMode === 'string' ? msg.videoMode : st.videoMode,
          videoAspect: typeof msg.videoAspect === 'string' ? msg.videoAspect : st.videoAspect,
          videoSize: typeof msg.videoSize === 'string' ? msg.videoSize : st.videoSize,
          videoStartRefId: typeof msg.videoStartRefId === 'string' ? msg.videoStartRefId : st.videoStartRefId,
          videoEndRefId: typeof msg.videoEndRefId === 'string' ? msg.videoEndRefId : st.videoEndRefId,
        }));
        applyPromptToMainInput(prompt);
        closeToMainWorkspace();
        focusMainPrompt();
        showMessage('已回填到输入区（VIDEO），可修改起止帧/模型/时长等，点击发送即可重新生成');
        return;
      }

      showError('该节点暂不支持重做');
    } catch (error) {
      console.error('redo failed:', error);
      showError((error as Error)?.message || '重做失败');
    }
  }

  function render(state: WorkflowState) {
    const target = state.traceTarget;
    if (!target) {
      subtitle.textContent = '选择一条记录查看素材路径与可重做步骤';
      content.innerHTML = `
        <div class="py-28 flex flex-col items-center justify-center opacity-25">
          <i class="fas fa-sitemap text-4xl mb-6"></i>
          <span class="text-[10px] font-black uppercase tracking-[0.3em]">Trace Empty</span>
          <span class="mt-2 text-[9px] font-mono opacity-40">Open from Vault Timeline</span>
        </div>
      `;
      return;
    }

    const head = typeof state.traceHeadMessageId === 'string' && state.traceHeadMessageId.trim() ? state.traceHeadMessageId.trim() : '';
    const headShort = head ? `${head.slice(0, 6)}…${head.slice(-4)}` : '';
    subtitle.textContent =
      (target.type === 'message'
        ? `目标：消息 ${target.id}`
        : target.type === 'ref'
          ? `目标：素材 ${target.id}`
          : `目标：URL ${target.url}`) + (headShort ? ` · 当前分支 HEAD: ${headShort}` : '');

    const nodes = deriveTraceNodes(state, target).slice().reverse();
    content.innerHTML = `
      <div class="relative">
        <div class="absolute left-3 top-0 bottom-0 w-px bg-white/10"></div>
        <div class="space-y-8">
          ${nodes.map((n) => renderNode(state, n, target)).join('')}
        </div>
      </div>
    `;

    const tk = targetKey(target);
    if (tk !== lastTarget) {
      lastTarget = tk;
      scrollToCurrent();
    }
  }

  content.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const action = target.closest<HTMLElement>('[data-trace-action]');
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      const kind = action.dataset.traceAction || '';
      if (kind === 'redo') {
        const messageId = action.dataset.messageId || '';
        if (messageId) void redoMessage(messageId);
        return;
      }
      if (kind === 'open-ref') {
        const refId = action.dataset.refId || '';
        if (refId) setTarget({ type: 'ref', id: refId });
        return;
      }
      if (kind === 'open-message') {
        const messageId = action.dataset.messageId || '';
        if (messageId) setTarget({ type: 'message', id: messageId });
        return;
      }
      if (kind === 'set-pad') {
        const refId = action.dataset.refId || '';
        if (!refId) return;
        params.store.update((s) => {
          const padIds = Array.isArray(s.mjPadRefIds) ? s.mjPadRefIds.slice() : [];
          if (!padIds.includes(refId)) padIds.push(refId);
          return {
            ...s,
            mjPadRefIds: padIds.slice(0, 12),
            selectedReferenceIds: Array.from(new Set([...(s.selectedReferenceIds || []), refId])),
          };
        });
        showMessage('已加入 PAD');
        return;
      }
      if (kind === 'set-start') {
        const refId = action.dataset.refId || '';
        if (!refId) return;
        params.store.update((s) => ({ ...s, videoStartRefId: refId }));
        showMessage('已设为 Start Frame');
        return;
      }
      if (kind === 'set-end') {
        const refId = action.dataset.refId || '';
        if (!refId) return;
        params.store.update((s) => ({ ...s, videoEndRefId: refId }));
        showMessage('已设为 End Frame');
        return;
      }
    }

    const resEl = target.closest<HTMLElement>('[data-trace-resource="1"]');
    if (resEl) {
      e.preventDefault();
      e.stopPropagation();
      const mouse = e as MouseEvent;
      const type = resEl.dataset.type;
      const url = resEl.dataset.url || '';
      if (!url) return;
      if (mouse.ctrlKey || mouse.metaKey) {
        setTarget({ type: 'url', url, resourceType: type === 'video' ? 'video' : 'image' });
        return;
      }
      if (type === 'image') openImagePreview(toAppImageSrc(url));
      else window.open(toAppVideoSrc(url), '_blank', 'noreferrer');
    }
  });

  closeBtn?.addEventListener('click', () => closeWithReturn());
  backdrop?.addEventListener('click', () => closeWithReturn());

  // Keep overlay open/close in the central overlay manager (backdrop/close button),
  // but allow Escape from here for convenience.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeWithReturn();
  });

  window.addEventListener('vc:overlay', (e) => {
    const detail = (e as CustomEvent)?.detail as { key?: string; open?: boolean } | undefined;
    if (detail?.key !== 'trace' || detail.open !== true) return;
    scrollToCurrent();
  });

  params.store.subscribe(render);
  render(params.store.get());

  return {
    openFor(target: TraceTarget) {
      setTarget(target);
      setTraceOpen(true);
    },
  };
}

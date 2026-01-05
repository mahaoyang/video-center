import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { dispatchStreamTileEvent } from '../atoms/stream-events';
import { setPromptInput } from '../atoms/prompt-input';

function clearRenderedMessages(stream: HTMLElement) {
  stream.querySelectorAll<HTMLElement>('[data-stream-message="1"]').forEach((el) => el.remove());
}

function ensureZeroState(stream: HTMLElement, hasMessages: boolean) {
  const zero = stream.querySelector<HTMLElement>('#zeroState');
  if (!zero) return;
  if (hasMessages) zero.style.display = 'none';
  else zero.style.display = '';
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bindStreamTileActions(root: HTMLElement, ctx: { src?: string; taskId?: string }) {
  root.querySelectorAll<HTMLButtonElement>('button[data-stream-action]').forEach((btn) => {
    const action = btn.dataset.streamAction as 'pad' | 'upscale' | 'select' | undefined;
    const index = Number(btn.dataset.index || '');
    if (!action || !Number.isFinite(index) || index < 1 || index > 4) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (action === 'pad') {
        if (!ctx.src) return;
        dispatchStreamTileEvent({ action: 'pad', src: ctx.src, index });
      } else if (action === 'upscale') {
        if (!ctx.taskId) return;
        dispatchStreamTileEvent({ action: 'upscale', taskId: ctx.taskId, index });
      } else if (action === 'select') {
        if (!ctx.src) return;
        dispatchStreamTileEvent({ action: 'select', src: ctx.src, index });
      }
    });
  });
}

function renderDeconstructMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  if (m.role === 'user') {
    msg.className = 'flex justify-end animate-fade-in-up';
    msg.innerHTML = `
      <div class="max-w-xl glass-panel px-7 py-5 rounded-[2rem] border border-white/5 shadow-2xl bg-studio-panel/40 backdrop-blur-md relative">
        <div class="text-[9px] font-black uppercase tracking-[0.4em] text-studio-accent mb-3 opacity-60">Neural Inquiry</div>
        <p class="text-xs font-mono opacity-80 italic">Analyze context and deconstruct visual roots...</p>
      </div>
    `;
  } else {
    msg.className = 'group animate-fade-in-up';
    msg.innerHTML = `
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60">
        <div class="flex items-center gap-4 mb-8 opacity-40">
          <i class="fas fa-fingerprint text-studio-accent text-xs"></i>
          <span class="text-[10px] font-black uppercase tracking-[0.3em]">Deconstruction Complete</span>
        </div>
        <div class="space-y-6">
          <div class="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-studio-accent/30 transition-all cursor-pointer group/chip">
            <p class="text-sm leading-relaxed opacity-90 group-hover/chip:text-studio-accent transition-colors"></p>
            <div class="mt-4 flex items-center justify-end gap-2 opacity-0 group-hover/chip:opacity-40 transition-opacity">
              <span class="text-[8px] font-black uppercase tracking-widest">Click to auto-fill</span>
              <i class="fas fa-arrow-right text-[8px]"></i>
            </div>
          </div>
        </div>
      </div>
    `;
    const p = msg.querySelector('p');
    if (p) p.textContent = m.text || '';
    const chip = msg.querySelector('.group\\/chip') as HTMLElement | null;
    if (chip) {
      chip.addEventListener('click', () => {
        if (m.text) setPromptInput(m.text);
      });
    }
  }

  const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
  if (panel && m.imageUrl) {
    const thumb = document.createElement('img');
    thumb.src = m.imageUrl;
    thumb.referrerPolicy = 'no-referrer';
    thumb.className = 'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl';
    panel.appendChild(thumb);
  }
  return msg;
}

function renderGenerateMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  if (m.role === 'user') {
    msg.className = 'flex justify-end animate-fade-in-up';
    msg.innerHTML = `
      <div class="max-w-xl glass-panel px-7 py-5 rounded-[2rem] border border-white/5 shadow-2xl bg-studio-panel/40 backdrop-blur-md">
        <div class="text-[9px] font-black uppercase tracking-[0.4em] text-studio-accent mb-3 opacity-60">Neural Instruction Received</div>
        <p class="text-sm font-medium leading-relaxed opacity-90">${escapeHtml(m.text || '')}</p>
      </div>
    `;
    return msg;
  }

  const taskId = m.taskId || '';
  const src = m.gridImageUrl;
  if (!src) {
    const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
    msg.className = 'group animate-fade-in-up';
    msg.innerHTML = `
      <div class="glass-panel p-10 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Synthesis Pending</span>
              <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : 'Submitting...'}</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent">${p}%</div>
        </div>
        ${m.error ? `<div class="mt-6 text-[11px] text-red-300/90 font-mono">${escapeHtml(m.error)}</div>` : ''}
      </div>
    `;
    return msg;
  }

  msg.className = 'group animate-fade-in-up';
  msg.innerHTML = `
    <div class="glass-panel p-8 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Synthesis Finalized</span>
          <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : ''}</span>
        </div>
        <div class="text-[9px] font-black uppercase tracking-widest opacity-30">2x2 Grid</div>
      </div>

	      <div class="grid grid-cols-2 gap-4">
	        ${[1, 2, 3, 4]
	          .map(
	            (i) => `
	          <div class="relative rounded-3xl overflow-hidden border border-white/10 bg-black group/tile">
	            <img src="/api/slice?src=${encodeURIComponent(src)}&index=${i}" referrerpolicy="no-referrer" class="w-full aspect-square object-cover" />
	            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center gap-3">
	              <button data-stream-action="pad" data-index="${i}"
	                class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all flex items-center justify-center">
	                <i class="fas fa-plus text-xs"></i>
	              </button>
	              <button data-stream-action="upscale" data-index="${i}"
	                class="w-12 h-12 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center">
	                <i class="fas fa-arrow-up-right-dots text-xs"></i>
	              </button>
	            </div>
	            <div class="absolute top-3 left-3 px-2 py-1 rounded-xl bg-black/60 border border-white/10 text-[9px] font-black">V${i}</div>
	          </div>
	        `
	          )
	          .join('')}
	      </div>
	    </div>
	  `;
	  bindStreamTileActions(msg, { src, taskId });
	  return msg;
	}

function renderUpscaleMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const taskId = m.taskId || '';
  const id = taskId || m.id;
  const src = m.upscaledImageUrl;
  if (!src) {
    const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
    msg.className = 'group animate-fade-in-up';
    msg.innerHTML = `
      <div class="glass-panel p-10 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Upscale Pending</span>
              <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : 'Submitting...'}</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent">${p}%</div>
        </div>
        ${m.error ? `<div class="mt-6 text-[11px] text-red-300/90 font-mono">${escapeHtml(m.error)}</div>` : ''}
      </div>
    `;
    return msg;
  }

  msg.className = 'group animate-fade-in-up';
  msg.innerHTML = `
    <div class="glass-panel p-8 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Upscale Complete</span>
          <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : ''}</span>
        </div>
        <div class="text-[9px] font-black uppercase tracking-widest opacity-30">Pick</div>
      </div>

	      <div class="grid grid-cols-2 gap-4">
	        ${[1, 2, 3, 4]
	          .map(
	            (i) => `
	          <div class="relative rounded-3xl overflow-hidden border border-white/10 bg-black group/tile">
	            <img src="/api/slice?src=${encodeURIComponent(src)}&index=${i}" referrerpolicy="no-referrer" class="w-full aspect-square object-cover" />
	            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center gap-3">
	              <button data-stream-action="select" data-index="${i}"
	                class="w-12 h-12 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center">
	                <i class="fas fa-plus text-xs"></i>
	              </button>
	            </div>
	            <div class="absolute top-3 left-3 px-2 py-1 rounded-xl bg-black/60 border border-white/10 text-[9px] font-black">V${i}</div>
	          </div>
	        `
	          )
	          .join('')}
	      </div>
	    </div>
	  `;
	  bindStreamTileActions(msg, { src });
	  return msg;
	}

function renderMessage(m: StreamMessage): HTMLElement {
  if (m.kind === 'deconstruct') return renderDeconstructMessage(m);
  if (m.kind === 'upscale') return renderUpscaleMessage(m);
  return renderGenerateMessage(m);
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

export function createStreamHistory(params: { store: Store<WorkflowState> }) {
  const stream = byId<HTMLElement>('productionStream');
  let lastMessages: StreamMessage[] | null = null;

  function resolveMessageImageUrl(m: StreamMessage, state: WorkflowState): StreamMessage {
    if (m.imageUrl) return m;
    if (!m.refId) return m;
    const ref = state.referenceImages.find((r) => r.id === m.refId);
    const url = ref?.cdnUrl || ref?.url || ref?.localUrl || ref?.dataUrl;
    if (!url) return m;
    return { ...m, imageUrl: url };
  }

  function renderAll(messages: StreamMessage[]) {
    const stickToBottom = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 200;
    clearRenderedMessages(stream);
    const state = params.store.get();
    for (const m of messages) {
      stream.appendChild(renderMessage(resolveMessageImageUrl(m, state)));
    }
    ensureZeroState(stream, messages.length > 0);
    if (stickToBottom) stream.scrollTop = stream.scrollHeight;
  }

  function clearConversation() {
    if (!confirm('清空历史对话？（仅删除本地浏览器缓存，不影响 CDN）')) return;
    params.store.update((s) => ({ ...s, streamMessages: [] }));
    clearRenderedMessages(stream);
    ensureZeroState(stream, false);
  }

  function saveConversation() {
    const data = params.store.get().streamMessages;
    const filename = `mj-conversation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    downloadJson(filename, { version: 1, exportedAt: Date.now(), messages: data });
  }

  (window as any).clearConversation = clearConversation;
  (window as any).saveConversation = saveConversation;

  renderAll(params.store.get().streamMessages);
  const initialCountEl = document.getElementById('conversationCount');
  if (initialCountEl) initialCountEl.textContent = String(params.store.get().streamMessages.length || 0);
  params.store.subscribe((s) => {
    if (s.streamMessages !== lastMessages) {
      lastMessages = s.streamMessages;
      renderAll(s.streamMessages);
    }
    const countEl = document.getElementById('conversationCount');
    if (countEl) countEl.textContent = String(s.streamMessages.length || 0);
  });

  return { renderAll, clearConversation, saveConversation };
}

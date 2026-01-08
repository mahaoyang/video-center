import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { dispatchStreamTileEvent } from '../atoms/stream-events';
import { setPromptInput } from '../atoms/prompt-input';
import { openImagePreview } from '../atoms/image-preview';
import { escapeHtml } from '../atoms/html';
import { toAppImageSrc } from '../atoms/image-src';
import { toAppVideoSrc } from '../atoms/video-src';

function ensureZeroState(stream: HTMLElement, hasMessages: boolean) {
  const zero = stream.querySelector<HTMLElement>('#zeroState');
  if (!zero) return;
  if (hasMessages) zero.style.display = 'none';
  else zero.style.display = '';
}

function bindStreamTileActions(root: HTMLElement, ctx: { src?: string; taskId?: string }) {
  root.querySelectorAll<HTMLButtonElement>('button[data-stream-action]').forEach((btn) => {
    const action = btn.dataset.streamAction as 'pad' | 'upscale' | 'select' | 'selectUrl' | undefined;
    const index = Number(btn.dataset.index || '');
    if (!action) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (action === 'pad') {
        if (!Number.isFinite(index) || index < 1 || index > 4) return;
        if (!ctx.src) return;
        dispatchStreamTileEvent({ action: 'pad', src: ctx.src, index });
      } else if (action === 'upscale') {
        if (!Number.isFinite(index) || index < 1 || index > 4) return;
        if (!ctx.taskId) return;
        dispatchStreamTileEvent({ action: 'upscale', taskId: ctx.taskId, index });
      } else if (action === 'select') {
        if (!Number.isFinite(index) || index < 1 || index > 4) return;
        if (!ctx.src) return;
        dispatchStreamTileEvent({ action: 'select', src: ctx.src, index });
      } else if (action === 'selectUrl') {
        if (!ctx.src) return;
        dispatchStreamTileEvent({ action: 'selectUrl', src: ctx.src });
      }
    });
  });
}

function bindPreview(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('img[data-preview-src]').forEach((img) => {
    const src = img.dataset.previewSrc;
    if (!src) return;
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImagePreview(src);
    });
  });
}

function renderDeconstructMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const isPending = !m.text || !m.text.trim();
  if (isPending) {
    const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
    msg.className = 'group animate-fade-in-up';
    msg.innerHTML = `
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4 opacity-60">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em]">Neural Inquiry</span>
              <span class="text-[9px] font-mono opacity-40">Deconstructing…</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent"><span data-progress-text="1">${p}%</span></div>
        </div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
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
              <span data-task-text="1" class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : 'Submitting...'}</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent"><span data-progress-text="1">${p}%</span></div>
        </div>
        <div class="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Prompt</div>
          <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        </div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
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

      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Prompt</div>
        <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
      </div>

	      <div class="grid grid-cols-2 gap-4">
	        ${[1, 2, 3, 4]
	          .map(
	            (i) => `
		          <div class="relative rounded-3xl overflow-hidden border border-white/10 bg-black/40 group/tile">
		            <img data-preview-src="/api/slice?src=${encodeURIComponent(src)}&index=${i}" src="/api/slice?src=${encodeURIComponent(src)}&index=${i}" referrerpolicy="no-referrer" class="w-full h-auto block" />
		            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
		              <button data-stream-action="pad" data-index="${i}"
		                class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all flex items-center justify-center pointer-events-auto">
		                <i class="fas fa-plus text-xs"></i>
		              </button>
                  <a href="/api/slice?src=${encodeURIComponent(src)}&index=${i}" download="mj-grid-${i}.png"
                    class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:text-white transition-all flex items-center justify-center pointer-events-auto"
                    title="Download">
                    <i class="fas fa-download text-xs"></i>
                  </a>
		              <button data-stream-action="upscale" data-index="${i}"
		                class="w-12 h-12 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center pointer-events-auto">
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
		  bindPreview(msg);
		  return msg;
		}

function renderUpscaleMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const taskId = m.taskId || '';
  const id = taskId || m.id;
    const rawSrc = m.upscaledImageUrl;
    const src = rawSrc ? toAppImageSrc(rawSrc) : '';
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
              <span data-task-text="1" class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : 'Submitting...'}</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent"><span data-progress-text="1">${p}%</span></div>
        </div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
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
        <div class="text-[9px] font-black uppercase tracking-widest opacity-30">Single</div>
      </div>

      <div class="relative rounded-3xl overflow-hidden border border-white/10 bg-black/40 group/tile">
        <img data-preview-src="${escapeHtml(src)}" src="${escapeHtml(src)}" referrerpolicy="no-referrer" class="w-full h-auto block" />
        <div class="absolute top-4 right-4 opacity-0 group-hover/tile:opacity-100 transition-opacity">
          <div class="flex items-center gap-2">
            <a href="${escapeHtml(src)}" download="mj-upscale-${Date.now()}.png"
              class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:text-white transition-all flex items-center justify-center"
              title="Download">
              <i class="fas fa-download text-xs"></i>
            </a>
            <button data-stream-action="selectUrl"
              class="w-12 h-12 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center"
              title="Use">
              <i class="fas fa-plus text-xs"></i>
            </button>
          </div>
        </div>
      </div>
		    </div>
		  `;
		  bindStreamTileActions(msg, { src: rawSrc || '' });
		  bindPreview(msg);
		  return msg;
}

function renderPeditMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';

  const outputsRaw = Array.isArray(m.peditImageUrls) && m.peditImageUrls.length ? m.peditImageUrls : m.peditImageUrl ? [m.peditImageUrl] : [];
  const outputs = outputsRaw.map((u) => toAppImageSrc(u)).filter(Boolean);
  const src = outputs[0] || '';
  if (!src) {
    const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
    msg.className = 'group animate-fade-in-up';
    msg.innerHTML = `
      <div class="glass-panel relative overflow-visible p-10 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Gemini Pro Image Pending</span>
              <span data-task-text="1" class="text-[9px] font-mono opacity-40">Generating…</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent"><span data-progress-text="1">${p}%</span></div>
        </div>
        <div class="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Instruction</div>
          <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        </div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
      </div>
    `;

    const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
    if (panel) {
      const thumbs = Array.isArray(m.inputImageUrls) && m.inputImageUrls.length ? m.inputImageUrls : m.imageUrl ? [m.imageUrl] : [];
      const showThumbs = thumbs.slice(0, 3);
      for (let i = 0; i < showThumbs.length; i++) {
        const u = showThumbs[i]!;
        const thumb = document.createElement('img');
        thumb.src = toAppImageSrc(u);
        thumb.referrerPolicy = 'no-referrer';
        thumb.className =
          'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
        if (i === 1) thumb.style.left = '2.75rem';
        if (i === 2) thumb.style.left = '5.5rem';
        panel.appendChild(thumb);
      }
    }
    return msg;
  }

  msg.className = 'group animate-fade-in-up';
  msg.innerHTML = `
    <div class="glass-panel relative overflow-visible p-8 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Gemini Pro Image Complete</span>
          <span class="text-[9px] font-mono opacity-40">Added to tray</span>
        </div>
        <div class="text-[9px] font-black uppercase tracking-widest opacity-30">${outputs.length > 1 ? 'Multi' : 'Single'}</div>
      </div>

      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Instruction</div>
        <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
      </div>

      <div class="grid ${outputs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-4">
        ${outputs
          .map(
            (u) => `
          <div class="relative rounded-3xl overflow-hidden border border-white/10 bg-black/40 group/tile">
            <img data-preview-src="${escapeHtml(u)}" src="${escapeHtml(u)}" referrerpolicy="no-referrer" class="w-full h-auto block" />
            <div class="absolute top-4 right-4 opacity-0 group-hover/tile:opacity-100 transition-opacity">
              <a href="${escapeHtml(u)}" download="gemini-image-${Date.now()}.png"
                class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:text-white transition-all flex items-center justify-center"
                title="Download">
                <i class="fas fa-download text-xs"></i>
              </a>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
  if (panel) {
    const thumbs = Array.isArray(m.inputImageUrls) && m.inputImageUrls.length ? m.inputImageUrls : m.imageUrl ? [m.imageUrl] : [];
    const showThumbs = thumbs.slice(0, 3);
    for (let i = 0; i < showThumbs.length; i++) {
      const u = showThumbs[i]!;
      const thumb = document.createElement('img');
      thumb.src = toAppImageSrc(u);
      thumb.referrerPolicy = 'no-referrer';
      thumb.className =
        'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
      if (i === 1) thumb.style.left = '2.75rem';
      if (i === 2) thumb.style.left = '5.5rem';
      panel.appendChild(thumb);
    }
  }
  bindPreview(msg);
  return msg;
}

function renderVideoMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const taskId = m.taskId || '';
  const provider = String(m.provider || '').toUpperCase() || 'VIDEO';
  const rawSrc = m.videoUrl;
  const src = rawSrc ? toAppVideoSrc(rawSrc) : '';

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
              <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Video Pending</span>
              <span data-task-text="1" class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : provider}</span>
            </div>
          </div>
          <div class="text-[12px] font-black text-studio-accent"><span data-progress-text="1">${p}%</span></div>
        </div>
        <div class="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Prompt</div>
          <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        </div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
      </div>
    `;
    return msg;
  }

  const filename = `video-${Date.now()}.mp4`;
  msg.className = 'group animate-fade-in-up';
  msg.innerHTML = `
    <div class="glass-panel p-8 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Video Complete</span>
          <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : provider}</span>
        </div>
        <div class="flex items-center gap-2">
          <a href="${escapeHtml(src)}" download="${escapeHtml(filename)}"
            class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-studio-accent hover:border-studio-accent/40 transition-all flex items-center justify-center"
            title="Download">
            <i class="fas fa-download text-[11px]"></i>
          </a>
          <a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"
            class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all flex items-center justify-center"
            title="Open">
            <i class="fas fa-arrow-up-right-from-square text-[11px]"></i>
          </a>
        </div>
      </div>

      <div class="rounded-3xl overflow-hidden border border-white/10 bg-black/40">
        <video src="${escapeHtml(src)}" controls class="w-full h-auto block"></video>
      </div>

      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Prompt</div>
        <div class="text-[11px] font-mono opacity-70 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
      </div>
    </div>
  `;
  return msg;
}

function renderMessage(m: StreamMessage): HTMLElement {
  if (m.kind === 'deconstruct') return renderDeconstructMessage(m);
  if (m.kind === 'upscale') return renderUpscaleMessage(m);
  if (m.kind === 'pedit') return renderPeditMessage(m);
  if (m.kind === 'video') return renderVideoMessage(m);
  return renderGenerateMessage(m);
}

export function createStreamHistory(params: { store: Store<WorkflowState> }) {
  const stream = byId<HTMLElement>('productionStream');
  const rendered = new Map<string, HTMLElement>();
  const lastById = new Map<string, StreamMessage>();
  let lastIds: string[] = [];

  function resolveMessageImageUrl(m: StreamMessage, state: WorkflowState): StreamMessage {
    if (m.imageUrl) return m;
    if (!m.refId) return m;
    const ref = state.referenceImages.find((r) => r.id === m.refId);
    const url = ref?.cdnUrl || ref?.url || ref?.localUrl || ref?.dataUrl;
    if (!url) return m;
    return { ...m, imageUrl: url };
  }

  function mountMessage(m: StreamMessage, state: WorkflowState): HTMLElement {
    const resolved = resolveMessageImageUrl(m, state);
    const el = renderMessage(resolved);
    (el as any).dataset.messageId = resolved.id;
    return el;
  }

  function updatePendingCard(el: HTMLElement, m: StreamMessage) {
    const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
    const progressEl = el.querySelector<HTMLElement>('[data-progress-text="1"]');
    if (progressEl) progressEl.textContent = `${p}%`;

    const taskEl = el.querySelector<HTMLElement>('[data-task-text="1"]');
    if (taskEl) taskEl.textContent = m.taskId ? `TASK: ${m.taskId}` : 'Submitting...';

    const errEl = el.querySelector<HTMLElement>('[data-error-text="1"]');
    if (errEl) {
      const has = Boolean(m.error && m.error.trim());
      errEl.textContent = has ? m.error! : '';
      errEl.classList.toggle('hidden', !has);
    }
  }

  function reconcile(messages: StreamMessage[]) {
    const atBottom = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 200;
    const state = params.store.get();
    const hidden = new Set(state.desktopHiddenStreamMessageIds || []);
    const visibleMessages = messages.filter((m) => !hidden.has(m.id));
    const nextIds = visibleMessages.map((m) => m.id);
    const isAppend =
      nextIds.length >= lastIds.length && lastIds.every((id, i) => nextIds[i] === id);

    const nextSet = new Set(nextIds);

    // Remove deleted messages
    for (const [id, el] of rendered) {
      if (!nextSet.has(id)) {
        el.remove();
        rendered.delete(id);
        lastById.delete(id);
      }
    }

    // Add / update messages (order is append-only in this app)
    for (const m of visibleMessages) {
      const id = m.id;
      const resolved = resolveMessageImageUrl(m, state);
      const prev = lastById.get(id);
      const existing = rendered.get(id);

      if (!existing) {
        const el = mountMessage(resolved, state);
        rendered.set(id, el);
        lastById.set(id, resolved);
        stream.appendChild(el);
        continue;
      }

      if (!prev) {
        const el = mountMessage(resolved, state);
        existing.replaceWith(el);
        rendered.set(id, el);
        lastById.set(id, resolved);
        continue;
      }

      // Replace only on state transitions; otherwise patch progress text in-place.
      const generateTransition = prev.kind === 'generate' && prev.role === 'ai' && prev.gridImageUrl !== resolved.gridImageUrl;
      const upscaleTransition = prev.kind === 'upscale' && prev.role === 'ai' && prev.upscaledImageUrl !== resolved.upscaledImageUrl;
      const prevPeditSig =
        prev.kind === 'pedit'
          ? JSON.stringify((prev.peditImageUrls && prev.peditImageUrls.length ? prev.peditImageUrls : prev.peditImageUrl ? [prev.peditImageUrl] : []).slice(0, 6))
          : '';
      const nextPeditSig =
        resolved.kind === 'pedit'
          ? JSON.stringify(
              (resolved.peditImageUrls && resolved.peditImageUrls.length
                ? resolved.peditImageUrls
                : resolved.peditImageUrl
                  ? [resolved.peditImageUrl]
                  : []).slice(0, 6)
            )
          : '';
      const peditTransition = prev.kind === 'pedit' && prev.role === 'ai' && prevPeditSig !== nextPeditSig;
      const videoTransition = prev.kind === 'video' && prev.role === 'ai' && prev.videoUrl !== resolved.videoUrl;
      const kindChanged = prev.kind !== resolved.kind || prev.role !== resolved.role;
      const needsReplace =
        kindChanged ||
        generateTransition ||
        upscaleTransition ||
        peditTransition ||
        videoTransition ||
        (prev.kind === 'deconstruct' && (prev.text !== resolved.text || prev.imageUrl !== resolved.imageUrl)) ||
        (prev.kind === 'generate' && prev.role === 'user' && prev.text !== resolved.text) ||
        (prev.kind === 'upscale' && prev.role === 'user' && prev.text !== resolved.text) ||
        (prev.kind === 'pedit' && prev.role === 'user' && prev.text !== resolved.text);

      if (needsReplace) {
        const el = mountMessage(resolved, state);
        existing.replaceWith(el);
        rendered.set(id, el);
        lastById.set(id, resolved);
        continue;
      }

      if (
        resolved.role === 'ai' &&
        (resolved.kind === 'generate' || resolved.kind === 'upscale' || resolved.kind === 'pedit' || resolved.kind === 'video')
      ) {
        updatePendingCard(existing, resolved);
      }

      lastById.set(id, resolved);
    }

    ensureZeroState(stream, visibleMessages.length > 0);
    if (isAppend && atBottom) stream.scrollTop = stream.scrollHeight;
    lastIds = nextIds;
  }

  function clearDesktopUi() {
    params.store.update((s) => ({
      ...s,
      desktopHiddenStreamMessageIds: Array.from(new Set(s.streamMessages.map((m) => m.id))).slice(-400),
    }));
  }

  const clearUiBtn = document.getElementById('streamClearUiBtn') as HTMLButtonElement | null;
  clearUiBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDesktopUi();
  });

  reconcile(params.store.get().streamMessages);
  params.store.subscribe((s) => {
    reconcile(s.streamMessages);
  });
}

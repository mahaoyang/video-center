import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { dispatchStreamTileEvent } from '../atoms/stream-events';
import { setPromptInput } from '../atoms/prompt-input';
import { openImagePreview } from '../atoms/image-preview';
import { escapeHtml } from '../atoms/html';
import { toAppImageSrc } from '../atoms/image-src';
import { toAppVideoSrc } from '../atoms/video-src';
import { setTraceOpen } from '../atoms/overlays';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';

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
                    title="加入素材区并设为 PAD"
                    aria-label="加入素材区并设为 PAD"
		                class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all flex items-center justify-center pointer-events-auto">
		                <i class="fas fa-plus text-xs"></i>
		              </button>
                  <a href="/api/slice?src=${encodeURIComponent(src)}&index=${i}" download="mj-grid-${i}.png"
                    class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:text-white transition-all flex items-center justify-center pointer-events-auto"
                    title="Download">
                    <i class="fas fa-download text-xs"></i>
                  </a>
		              <button data-stream-action="upscale" data-index="${i}"
                    title="Upscale / 放大"
                    aria-label="Upscale / 放大"
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
              title="加入素材区"
              aria-label="加入素材区">
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

function safeDownloadName(name: string, fallback: string): string {
  const raw = String(name || '').trim();
  const cleaned = raw.replace(/[^\w.-]+/g, '_');
  return cleaned || fallback;
}

function renderPostprocessMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';

  const outputs = Array.isArray((m as any).postOutputs) ? ((m as any).postOutputs as any[]).slice(0, 24) : [];
  const pending = !outputs.length && !m.error && (typeof m.progress !== 'number' || m.progress < 100);
  const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));

  msg.className = 'group animate-fade-in-up';
  if (pending) {
    msg.innerHTML = `
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60">
        <div class="flex items-center gap-4 opacity-60">
          <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
          </div>
          <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase tracking-[0.3em]">Post Processing</span>
            <span class="text-[9px] font-mono opacity-40">处理中…（${p}%）</span>
          </div>
        </div>
        <div class="mt-6 text-[11px] font-mono opacity-70 whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
      </div>
    `;
    return msg;
  }

  const rows = outputs
    .map((o) => {
      const kind = o?.kind === 'audio' ? 'audio' : o?.kind === 'video' ? 'video' : 'image';
      const url = kind === 'image' ? toAppImageSrc(String(o?.url || '')) : toAppVideoSrc(String(o?.url || ''));
      const downloadName = safeDownloadName(
        String(o?.name || ''),
        kind === 'audio' ? 'audio_pro.wav' : kind === 'video' ? 'video_post.mp4' : 'image'
      );
      if (!url) return '';

      if (kind === 'audio') {
        return `
          <div class="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-50">Audio</div>
              <a href="${escapeHtml(url)}" download="${escapeHtml(downloadName)}"
                class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-studio-accent hover:border-studio-accent/40 transition-all text-[9px] font-black uppercase tracking-widest">
                Download
              </a>
            </div>
            <audio src="${escapeHtml(url)}" controls class="w-full"></audio>
            <div class="text-[10px] font-mono opacity-40 break-all">${escapeHtml(String(o?.url || ''))}</div>
          </div>
        `;
      }

      if (kind === 'video') {
        return `
          <div class="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-50">Video</div>
              <a href="${escapeHtml(url)}" download="${escapeHtml(downloadName)}"
                class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-studio-accent hover:border-studio-accent/40 transition-all text-[9px] font-black uppercase tracking-widest">
                Download
              </a>
            </div>
            <div class="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
              <video src="${escapeHtml(url)}" controls class="w-full h-auto block"></video>
            </div>
            <div class="text-[10px] font-mono opacity-40 break-all">${escapeHtml(String(o?.url || ''))}</div>
          </div>
        `;
      }

      return `
        <div class="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div class="text-[10px] font-black uppercase tracking-[0.25em] opacity-50">Image</div>
            <a href="${escapeHtml(url)}" download="${escapeHtml(downloadName)}"
              class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-studio-accent hover:border-studio-accent/40 transition-all text-[9px] font-black uppercase tracking-widest">
              Download
            </a>
          </div>
          <div class="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
            <img src="${escapeHtml(url)}" referrerpolicy="no-referrer" class="w-full h-auto block" />
          </div>
          <div class="text-[10px] font-mono opacity-40 break-all">${escapeHtml(String(o?.url || ''))}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  msg.innerHTML = `
    <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60 space-y-6">
      <div class="flex items-center justify-between gap-6">
        <div class="flex items-center gap-4 opacity-50">
          <i class="fas fa-wand-magic-sparkles text-studio-accent text-xs"></i>
          <span class="text-[10px] font-black uppercase tracking-[0.3em]">Postprocess Complete</span>
        </div>
      </div>
      <div class="space-y-4">
        ${rows || `<div class="text-[11px] font-mono opacity-60">无可用结果</div>`}
      </div>
      <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
    </div>
  `;

  bindPreview(msg);
  return msg;
}

function renderMessage(m: StreamMessage): HTMLElement {
  if (m.kind === 'deconstruct') return renderDeconstructMessage(m);
  if (m.kind === 'upscale') return renderUpscaleMessage(m);
  if (m.kind === 'pedit') return renderPeditMessage(m);
  if (m.kind === 'video') return renderVideoMessage(m);
  if (m.kind === 'postprocess') return renderPostprocessMessage(m);
  return renderGenerateMessage(m);
}

export function createStreamHistory(params: { store: Store<WorkflowState> }) {
  const stream = byId<HTMLElement>('productionStream');
  const rendered = new Map<string, HTMLElement>();
  const lastById = new Map<string, StreamMessage>();
  let lastIds: string[] = [];

  function backfillForBranch(messageId: string) {
    const s = params.store.get();
    const msg = (s.streamMessages || []).find((m) => m.id === messageId);
    if (!msg) return showError('找不到该记录');

    try {
      if (msg.kind === 'generate') {
        const prompt = (typeof msg.userPrompt === 'string' && msg.userPrompt.trim() ? msg.userPrompt.trim() : msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        const ids = [msg.mjPadRefId, msg.mjSrefRefId, msg.mjCrefRefId].filter(
          (x): x is string => typeof x === 'string' && x.trim()
        );
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'mj',
          mjPadRefId: typeof msg.mjPadRefId === 'string' ? msg.mjPadRefId : undefined,
          mjSrefRefId: typeof msg.mjSrefRefId === 'string' ? msg.mjSrefRefId : undefined,
          mjCrefRefId: typeof msg.mjCrefRefId === 'string' ? msg.mjCrefRefId : undefined,
          mjSrefImageUrl: typeof msg.mjSrefImageUrl === 'string' ? msg.mjSrefImageUrl : undefined,
          mjCrefImageUrl: typeof msg.mjCrefImageUrl === 'string' ? msg.mjCrefImageUrl : undefined,
          selectedReferenceIds: ids,
        }));
        setPromptInput(prompt);
        showMessage('已回填 MJ 入参（新分支）：编辑后点击发送（小飞机）执行');
        return;
      }

      if (msg.kind === 'upscale') {
        const srcTaskId = typeof msg.upscaleSourceTaskId === 'string' ? msg.upscaleSourceTaskId : '';
        const idx = typeof msg.upscaleIndex === 'number' ? msg.upscaleIndex : NaN;
        if (!srcTaskId || !Number.isFinite(idx)) return showError('该扩图记录缺少来源 taskId / index（无法回填）');
        const parent = (s.streamMessages || []).find((m) => m.kind === 'generate' && m.taskId === srcTaskId);
        params.store.update((st) => ({ ...st, traceHeadMessageId: parent?.id || st.traceHeadMessageId }));
        showMessage(`已定位到源 GRID（V${idx}），请在卡片上点 Upscale 重新扩图`);
        return;
      }

      if (msg.kind === 'deconstruct') {
        const refId = typeof msg.refId === 'string' ? msg.refId : '';
        if (!refId) return showError('该描述记录缺少 refId（无法回填）');
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'deconstruct',
          selectedReferenceIds: [refId],
          activeImageId: refId,
        }));
        showMessage('已回填 DESCRIBE 入参（新分支）：编辑后点击发送（小飞机）执行');
        return;
      }

      if (msg.kind === 'pedit') {
        const prompt = (msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        const refIds = (Array.isArray(msg.refIds) ? msg.refIds : msg.refId ? [msg.refId] : []).filter(Boolean);
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'pedit',
          selectedReferenceIds: refIds,
          gimageAspect: typeof msg.gimageAspect === 'string' ? msg.gimageAspect : st.gimageAspect,
          gimageSize: typeof msg.gimageSize === 'string' ? msg.gimageSize : st.gimageSize,
        }));
        setPromptInput(prompt);
        showMessage('已回填 GEMINI / IMAGE 入参（新分支）：编辑后点击发送（小飞机）执行');
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
          const mvAction = (msg as any).mvAction === 'clip' ? 'clip' : 'mv';

          const selectedRefIds = mvSeqRaw
            .map((it: any) => String(it?.refId || '').trim())
            .filter(Boolean)
            .slice(0, 24);

          const recipe: 'mv-mix' | 'mv-images' | 'mv-clip' | 'mv-subtitle' =
            mvSrt && mvSrt.trim()
              ? 'mv-subtitle'
              : mvAction === 'clip'
                ? mvVideoUrl
                  ? 'mv-clip'
                  : 'mv-images'
                : 'mv-mix';

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

            return {
              ...st,
              traceHeadMessageId: msg.id,
              commandMode: recipe,
              mediaAssets: mediaAssets.slice(-120),
              mvResolution: typeof msg.mvResolution === 'string' ? msg.mvResolution : st.mvResolution,
              mvFps: typeof msg.mvFps === 'number' ? msg.mvFps : st.mvFps,
              mvDurationSeconds: typeof msg.mvDurationSeconds === 'number' ? msg.mvDurationSeconds : st.mvDurationSeconds,
              mvSubtitleMode: msg.mvSubtitleMode === 'burn' ? 'burn' : 'soft',
              mvAction: mvAction,
              selectedReferenceIds: selectedRefIds,
              mvVideoAssetId: videoAssetId,
              mvAudioAssetId: audioAssetId,
              mvSubtitleAssetId: subtitleAssetId,
            };
          });

          setPromptInput(prompt);
          showMessage('已回填 MV 入参（新分支）：编辑素材/参数后点击发送（小飞机）执行');
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
        setPromptInput(prompt);
        showMessage('已回填 VIDEO 入参（新分支）：编辑后点击发送（小飞机）执行');
        return;
      }

      showError('该节点暂不支持回填');
    } catch (error) {
      console.error('stream backfill failed:', error);
      showError((error as Error)?.message || '回填失败');
    }
  }

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

    // Add Trace entry on every stream card (主流消息卡片).
    const panel = el.querySelector<HTMLElement>('.glass-panel') || el;
    panel.classList.add('relative');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.streamEdit = '1';
    edit.title = '回填编辑（分叉重生）';
    edit.className =
      'absolute top-4 right-[3.25rem] w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/30 hover:text-white transition-all flex items-center justify-center ' +
      'opacity-0 group-hover:opacity-100';
    edit.innerHTML = '<i class="fas fa-pen text-[11px]"></i>';
    panel.appendChild(edit);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.streamTrace = '1';
    btn.title = '链路追踪';
    btn.className =
      'absolute top-4 right-4 w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/30 hover:text-white transition-all flex items-center justify-center ' +
      'opacity-0 group-hover:opacity-100';
    btn.innerHTML = '<i class="fas fa-sitemap text-[11px]"></i>';
    panel.appendChild(btn);

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

  function isPostprocessPending(m: StreamMessage): boolean {
    if (m.kind !== 'postprocess') return false;
    const outputs = Array.isArray((m as any).postOutputs) ? ((m as any).postOutputs as any[]) : [];
    return !outputs.length && !m.error && (typeof m.progress !== 'number' || m.progress < 100);
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
      const postprocessTransition =
        prev.kind === 'postprocess' &&
        prev.role === 'ai' &&
        (isPostprocessPending(prev) !== isPostprocessPending(resolved) ||
          JSON.stringify(((prev as any).postOutputs || []).slice(0, 24)) !==
            JSON.stringify((((resolved as any).postOutputs || []) as any[]).slice(0, 24)) ||
          (prev.text || '') !== (resolved.text || '') ||
          (prev.error || '') !== (resolved.error || ''));
      const kindChanged = prev.kind !== resolved.kind || prev.role !== resolved.role;
      const needsReplace =
        kindChanged ||
        generateTransition ||
        upscaleTransition ||
        peditTransition ||
        videoTransition ||
        postprocessTransition ||
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

  stream.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const edit = target.closest<HTMLElement>('[data-stream-edit="1"]');
    if (edit) {
      e.preventDefault();
      e.stopPropagation();
      const card = edit.closest<HTMLElement>('[data-message-id]');
      const id = card?.dataset.messageId || '';
      if (!id) return;
      backfillForBranch(id);
      return;
    }

    const btn = target.closest<HTMLElement>('[data-stream-trace="1"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const card = btn.closest<HTMLElement>('[data-message-id]');
    const id = card?.dataset.messageId || '';
    if (!id) return;
    params.store.update((s) => ({ ...s, traceTarget: { type: 'message', id }, traceReturnTo: undefined }));
    setTraceOpen(true);
  });

  reconcile(params.store.get().streamMessages);
  params.store.subscribe((s) => {
    reconcile(s.streamMessages);
  });
}

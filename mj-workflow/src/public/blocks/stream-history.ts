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
import { bindDownloadProcessor } from '../atoms/download';
import { hideAllStreamMessagesUiOnly, hideStreamMessageUiOnly } from '../headless/conversation-actions';

function ensureZeroState(stream: HTMLElement, hasMessages: boolean) {
  const zero = stream.querySelector<HTMLElement>('#zeroState');
  if (!zero) return;
  if (hasMessages) zero.style.display = 'none';
  else zero.style.display = '';
}

function bindStreamTileActions(root: HTMLElement, ctx: { src?: string; taskId?: string }) {
  root.querySelectorAll<HTMLButtonElement>('button[data-stream-action]').forEach((btn) => {
    const action = btn.dataset.streamAction as 'pad' | 'upscale' | 'select' | 'selectUrl' | 'retryTask' | undefined;
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
      } else if (action === 'retryTask') {
        const messageId = String(btn.dataset.messageId || '').trim();
        if (!messageId) return;
        dispatchStreamTileEvent({ action: 'retryTask', messageId });
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
        <div data-retry-wrap="1" class="mt-4 ${m.error && taskId ? '' : 'hidden'}">
          <button
            data-stream-action="retryTask"
            data-message-id="${escapeHtml(m.id)}"
            type="button"
            class="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white/80 hover:text-studio-accent hover:border-studio-accent/40 transition-all text-[9px] font-black uppercase tracking-[0.18em]">
            重新拉取结果
          </button>
        </div>
      </div>
    `;
    bindStreamTileActions(msg, { taskId });
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
		              <button data-stream-action="select" data-index="${i}"
                    title="加入素材区并勾选"
                    aria-label="加入素材区并勾选"
		                class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all flex items-center justify-center pointer-events-auto">
		                <i class="fas fa-plus text-xs"></i>
		              </button>
                  <a href="/api/slice?src=${encodeURIComponent(src)}&index=${i}" data-dl-prefix="mj-grid-v${i}" data-dl-ext="png"
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
        <div data-retry-wrap="1" class="mt-4 ${m.error && taskId ? '' : 'hidden'}">
          <button
            data-stream-action="retryTask"
            data-message-id="${escapeHtml(m.id)}"
            type="button"
            class="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white/80 hover:text-studio-accent hover:border-studio-accent/40 transition-all text-[9px] font-black uppercase tracking-[0.18em]">
            重新拉取结果
          </button>
        </div>
      </div>
    `;
    bindStreamTileActions(msg, { taskId });
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
            <a href="${escapeHtml(src)}" data-dl-prefix="mj-upscale" data-dl-ext="png"
              class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:text-white transition-all flex items-center justify-center"
              title="Download">
              <i class="fas fa-download text-xs"></i>
            </a>
            <button data-stream-action="selectUrl"
              class="w-12 h-12 rounded-2xl bg-studio-accent text-studio-bg hover:scale-105 transition-all flex items-center justify-center"
              title="加入素材区并勾选"
              aria-label="加入素材区并勾选">
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
              <a href="${escapeHtml(u)}" data-dl-prefix="gemini-image" data-dl-ext="png"
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

  const videoExt = (() => {
    const raw = String(rawSrc || '').trim().toLowerCase();
    if (raw.includes('.webm')) return 'webm';
    if (raw.includes('.mov')) return 'mov';
    if (raw.includes('.mkv')) return 'mkv';
    return 'mp4';
  })();
  const providerKey = provider ? provider.toLowerCase() : 'video';
  msg.className = 'group animate-fade-in-up';
  msg.innerHTML = `
    <div class="glass-panel p-8 rounded-[2.5rem] border border-white/10 bg-studio-panel/60 shadow-2xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Video Complete</span>
          <span class="text-[9px] font-mono opacity-40">${taskId ? `TASK: ${escapeHtml(taskId)}` : provider}</span>
        </div>
        <div class="flex items-center gap-2">
          <a href="${escapeHtml(src)}" data-dl-prefix="${escapeHtml(providerKey)}-video" data-dl-ext="${escapeHtml(videoExt)}"
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

function parseSunoBlocks(text: string): { control: string; style: string } | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const controlMatch =
    raw.match(/CONTROL_PROMPT\s*:\s*/i) ||
    raw.match(/LYRICS_PROMPT\s*:\s*/i) ||
    raw.match(/LYRICS\s*:\s*/i);
  const styleMatch = raw.match(/STYLE_PROMPT\s*:\s*/i);
  if (!controlMatch || !styleMatch) return null;
  const i1 = controlMatch.index ?? -1;
  const i2 = styleMatch.index ?? -1;
  if (i1 < 0 || i2 < 0 || i2 <= i1) return null;
  const control = raw.slice(i1 + controlMatch[0].length, i2).trim();
  const style = raw.slice(i2 + styleMatch[0].length).trim();
  if (!control || !style) return null;
  return { control, style };
}

function parseYoutubeBlocks(text: string): { title: string; description: string } | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const titleMatch = raw.match(/(?:^|\n)\s*TITLE\s*:\s*/i);
  const descMatch = raw.match(/(?:^|\n)\s*DESCRIPTION\s*:\s*/i);
  if (!titleMatch || !descMatch) return null;
  const i1 = titleMatch.index ?? -1;
  const i2 = descMatch.index ?? -1;
  if (i1 < 0 || i2 < 0 || i2 <= i1) return null;
  const titleBlock = raw.slice(i1 + titleMatch[0].length, i2).trim();
  const title = titleBlock.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  const description = raw.slice(i2 + descMatch[0].length).trim();
  if (!title && !description) return null;
  return { title, description };
}

export function youtubeReconcileSignature(m: StreamMessage): string {
  if (m.kind !== 'youtube' || m.role !== 'ai') return '';
  const pending = !m.error && (typeof m.progress !== 'number' || m.progress < 100);
  const prompt = typeof (m as any).userPrompt === 'string' ? String((m as any).userPrompt || '').trim() : '';
  const thumbs = Array.isArray(m.inputImageUrls) ? m.inputImageUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 8) : [];
  return [
    pending ? 'pending' : 'done',
    String(m.progress || 0),
    String(m.error || ''),
    String(m.text || ''),
    prompt,
    JSON.stringify(thumbs),
  ].join('\n');
}

async function copyToClipboard(text: string): Promise<boolean> {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function renderYoutubeMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
  const pending = !m.error && (typeof m.progress !== 'number' || p < 100);
  const requirement = typeof (m as any).userPrompt === 'string' ? String((m as any).userPrompt || '').trim() : '';
  const thumbs = Array.isArray(m.inputImageUrls) ? m.inputImageUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 8) : [];

  msg.className = 'group animate-fade-in-up';
  if (pending) {
    msg.innerHTML = `
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4 opacity-60">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em]">YOUTUBE</span>
              <span class="text-[9px] font-mono opacity-40">生成中…（${p}%）</span>
            </div>
          </div>
        </div>
        <div class="mt-6 text-[11px] font-mono opacity-70 whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
      </div>
    `;
    const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
    if (panel && thumbs.length) {
      const showThumbs = thumbs.slice(0, 4);
      for (let i = 0; i < showThumbs.length; i++) {
        const u = showThumbs[i]!;
        const thumb = document.createElement('img');
        thumb.src = toAppImageSrc(u);
        thumb.referrerPolicy = 'no-referrer';
        thumb.className =
          'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
        if (i === 1) thumb.style.left = '2.75rem';
        if (i === 2) thumb.style.left = '5.5rem';
        if (i === 3) thumb.style.left = '8.25rem';
        panel.appendChild(thumb);
      }
      const extra = thumbs.length - showThumbs.length;
      if (extra > 0) {
        const badge = document.createElement('div');
        badge.className =
          'absolute -top-2 left-[10.9rem] px-2 py-1 rounded-xl bg-black/70 border border-white/10 text-[9px] font-black text-white/80 shadow-2xl';
        badge.textContent = `+${extra}`;
        panel.appendChild(badge);
      }
    }
    return msg;
  }

  const parsed = parseYoutubeBlocks(m.text || '');
  const title = parsed ? parsed.title : '';
  const description = parsed ? parsed.description : '';

  msg.innerHTML = `
    <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60 space-y-6">
      <div class="flex items-center justify-between gap-6">
        <div class="flex items-center gap-3 opacity-60">
          <i class="fas fa-pen-nib text-studio-accent text-[12px]"></i>
          <span class="text-[10px] font-black uppercase tracking-[0.3em]">YOUTUBE META</span>
        </div>
        <div class="flex items-center gap-2">
          <button data-yt-copy="title" type="button" ${title ? '' : 'disabled'}
            class="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">
            Copy Title
          </button>
          <button data-yt-copy="description" type="button" ${description ? '' : 'disabled'}
            class="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">
            Copy Desc
          </button>
        </div>
      </div>

      ${requirement ? `
        <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Input（你的输入）</div>
          <div class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(requirement)}</div>
        </div>
      ` : ''}

      <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Title（粘贴到 YouTube）</div>
        <div data-yt-title="1" class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(title || '')}</div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Description（粘贴到 YouTube）</div>
        <div data-yt-description="1" class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(description || '')}</div>
      </div>

      <div data-error-text="1" class="text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
    </div>
  `;

  const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
  if (panel && thumbs.length) {
    const showThumbs = thumbs.slice(0, 4);
    for (let i = 0; i < showThumbs.length; i++) {
      const u = showThumbs[i]!;
      const thumb = document.createElement('img');
      thumb.src = toAppImageSrc(u);
      thumb.referrerPolicy = 'no-referrer';
      thumb.className =
        'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
      if (i === 1) thumb.style.left = '2.75rem';
      if (i === 2) thumb.style.left = '5.5rem';
      if (i === 3) thumb.style.left = '8.25rem';
      panel.appendChild(thumb);
    }
    const extra = thumbs.length - showThumbs.length;
    if (extra > 0) {
      const badge = document.createElement('div');
      badge.className =
        'absolute -top-2 left-[10.9rem] px-2 py-1 rounded-xl bg-black/70 border border-white/10 text-[9px] font-black text-white/80 shadow-2xl';
      badge.textContent = `+${extra}`;
      panel.appendChild(badge);
    }
  }

  const copyBtns = Array.from(msg.querySelectorAll<HTMLButtonElement>('button[data-yt-copy]'));
  for (const btn of copyBtns) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const kind = String(btn.dataset.ytCopy || '').trim();
      const target =
        kind === 'title'
          ? msg.querySelector<HTMLElement>('[data-yt-title="1"]')?.textContent || ''
          : msg.querySelector<HTMLElement>('[data-yt-description="1"]')?.textContent || '';
      const ok = await copyToClipboard(target);
      if (ok) {
        const prev = btn.textContent || '';
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = prev), 1200);
      } else {
        showMessage(`复制失败，请手动复制：\n${target}`);
      }
    });
  }

  bindPreview(msg);
  return msg;
}

function renderSunoMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const p = Math.max(0, Math.min(100, Number.isFinite(m.progress as any) ? (m.progress as number) : 0));
  const pending = !m.error && (typeof m.progress !== 'number' || p < 100);
  const requirement = typeof (m as any).userPrompt === 'string' ? String((m as any).userPrompt || '').trim() : '';
  const thumbs = Array.isArray(m.inputImageUrls) ? m.inputImageUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 8) : [];

  msg.className = 'group animate-fade-in-up';
  if (pending) {
    msg.innerHTML = `
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60">
        <div class="flex items-center justify-between gap-6">
          <div class="flex items-center gap-4 opacity-60">
            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-[12px] text-studio-accent"></i>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.3em]">SUNO</span>
              <span class="text-[9px] font-mono opacity-40">生成中…（${p}%）</span>
            </div>
          </div>
        </div>
        <div class="mt-6 text-[11px] font-mono opacity-70 whitespace-pre-wrap break-words">${escapeHtml(m.text || '')}</div>
        <div data-error-text="1" class="mt-6 text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
      </div>
    `;
    const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
    if (panel) {
      const showThumbs = thumbs.slice(0, 4);
      for (let i = 0; i < showThumbs.length; i++) {
        const u = showThumbs[i]!;
        const thumb = document.createElement('img');
        thumb.src = toAppImageSrc(u);
        thumb.referrerPolicy = 'no-referrer';
        thumb.className =
          'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
        if (i === 1) thumb.style.left = '2.75rem';
        if (i === 2) thumb.style.left = '5.5rem';
        if (i === 3) thumb.style.left = '8.25rem';
        panel.appendChild(thumb);
      }
      const extra = thumbs.length - showThumbs.length;
      if (extra > 0) {
        const badge = document.createElement('div');
        badge.className =
          'absolute -top-2 left-[10.9rem] px-2 py-1 rounded-xl bg-black/70 border border-white/10 text-[9px] font-black text-white/80 shadow-2xl';
        badge.textContent = `+${extra}`;
        panel.appendChild(badge);
      }
    }
    return msg;
  }

  const parsed = parseSunoBlocks(m.text || '');
  const control = parsed ? parsed.control : String(m.text || '').trim();
  const style = parsed ? parsed.style : '';

  msg.innerHTML = `
    <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-visible bg-studio-panel/60 space-y-6">
      <div class="flex items-center justify-between gap-6">
        <div class="flex items-center gap-3 opacity-60">
          <i class="fas fa-music text-studio-accent text-[12px]"></i>
          <span class="text-[10px] font-black uppercase tracking-[0.3em]">SUNO PROMPTS</span>
        </div>
        <div class="flex items-center gap-2">
          <button data-suno-copy="control" type="button"
            class="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black uppercase tracking-widest">
            Copy Control
          </button>
          <button data-suno-copy="style" type="button" ${style ? '' : 'disabled'}
            class="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">
            Copy Style
          </button>
        </div>
      </div>

      ${requirement ? `
        <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Requirement（你的需求）</div>
          <div class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(requirement)}</div>
        </div>
      ` : ''}

      <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Control Prompt（粘贴到 Suno Lyrics）</div>
        <div data-suno-control="1" class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(control)}</div>
      </div>

      ${style ? `
        <div class="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div class="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-2">Style Prompt（粘贴到 Suno Style of Music）</div>
          <div data-suno-style="1" class="text-[11px] font-mono opacity-80 leading-relaxed whitespace-pre-wrap break-words select-text">${escapeHtml(style)}</div>
        </div>
      ` : ''}

      <div data-error-text="1" class="text-[11px] text-red-300/90 font-mono ${m.error ? '' : 'hidden'}">${escapeHtml(m.error || '')}</div>
    </div>
  `;

  const panel = msg.querySelector('.glass-panel') as HTMLElement | null;
  if (panel && thumbs.length) {
    const showThumbs = thumbs.slice(0, 4);
    for (let i = 0; i < showThumbs.length; i++) {
      const u = showThumbs[i]!;
      const thumb = document.createElement('img');
      thumb.src = toAppImageSrc(u);
      thumb.referrerPolicy = 'no-referrer';
      thumb.className =
        'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl bg-black/30';
      if (i === 1) thumb.style.left = '2.75rem';
      if (i === 2) thumb.style.left = '5.5rem';
      if (i === 3) thumb.style.left = '8.25rem';
      panel.appendChild(thumb);
    }
    const extra = thumbs.length - showThumbs.length;
    if (extra > 0) {
      const badge = document.createElement('div');
      badge.className =
        'absolute -top-2 left-[10.9rem] px-2 py-1 rounded-xl bg-black/70 border border-white/10 text-[9px] font-black text-white/80 shadow-2xl';
      badge.textContent = `+${extra}`;
      panel.appendChild(badge);
    }
  }

  const copyBtns = Array.from(msg.querySelectorAll<HTMLButtonElement>('button[data-suno-copy]'));
  for (const btn of copyBtns) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const kind = String(btn.dataset.sunoCopy || '').trim();
      const target =
        kind === 'control'
          ? msg.querySelector<HTMLElement>('[data-suno-control="1"]')?.textContent || ''
          : msg.querySelector<HTMLElement>('[data-suno-style="1"]')?.textContent || '';
      const ok = await copyToClipboard(target);
      if (ok) {
        const prev = btn.textContent || '';
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = prev), 1200);
      } else {
        showMessage(`复制失败，请手动复制：\n${target}`);
      }
    });
  }

  bindPreview(msg);
  return msg;
}

function renderMessage(m: StreamMessage): HTMLElement {
  if (m.kind === 'deconstruct') return renderDeconstructMessage(m);
  if (m.kind === 'upscale') return renderUpscaleMessage(m);
  if (m.kind === 'pedit') return renderPeditMessage(m);
  if (m.kind === 'video') return renderVideoMessage(m);
  if (m.kind === 'suno') return renderSunoMessage(m);
  if (m.kind === 'youtube') return renderYoutubeMessage(m);
  return renderGenerateMessage(m);
}

export function createStreamHistory(params: { store: Store<WorkflowState> }) {
  const stream = byId<HTMLElement>('productionStream');
  const scrollTopBtn = document.getElementById('streamScrollTopBtn') as HTMLButtonElement | null;
  const scrollBottomBtn = document.getElementById('streamScrollBottomBtn') as HTMLButtonElement | null;
  const rendered = new Map<string, HTMLElement>();
  const lastById = new Map<string, StreamMessage>();
  let lastIds: string[] = [];
  let didInitialAutoScroll = false;
  let followBottom = true;
  let settleRaf = 0;
  let stickQueued = false;

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!followBottom) return;
          queueStickToBottom();
        })
      : null;

  function isNearBottom(threshold = 120): boolean {
    return stream.scrollTop + stream.clientHeight >= stream.scrollHeight - threshold;
  }

  function scrollToBottom() {
    stream.scrollTop = stream.scrollHeight;
  }

  function updateScrollJumpButtons() {
    const hasOverflow = stream.scrollHeight > stream.clientHeight + 8;
    const nearTop = stream.scrollTop <= 24;
    const nearBottom = isNearBottom(24);

    if (scrollTopBtn) scrollTopBtn.classList.toggle('hidden', !hasOverflow || nearTop);
    if (scrollBottomBtn) scrollBottomBtn.classList.toggle('hidden', !hasOverflow || nearBottom);
  }

  function settleToBottom() {
    if (settleRaf) cancelAnimationFrame(settleRaf);
    let lastHeight = -1;
    let stableFrames = 0;
    let ticks = 0;
    const maxTicks = 36;
    const loop = () => {
      if (!followBottom) return;
      const h = stream.scrollHeight;
      if (h !== lastHeight) {
        lastHeight = h;
        stableFrames = 0;
        scrollToBottom();
      } else {
        if (!isNearBottom(2)) scrollToBottom();
        stableFrames += 1;
      }
      ticks += 1;
      if (stableFrames >= 3 || ticks >= maxTicks) return;
      settleRaf = requestAnimationFrame(loop);
    };
    settleRaf = requestAnimationFrame(loop);
  }

  function queueStickToBottom() {
    if (!followBottom || stickQueued) return;
    stickQueued = true;
    requestAnimationFrame(() => {
      stickQueued = false;
      if (!followBottom) return;
      scrollToBottom();
      settleToBottom();
    });
  }

  function bindAsyncLayoutStick(el: HTMLElement) {
    if (resizeObserver) resizeObserver.observe(el);

    const onMediaReady = () => {
      if (!followBottom) return;
      queueStickToBottom();
    };

    el.querySelectorAll('img').forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        onMediaReady();
      } else {
        img.addEventListener('load', onMediaReady, { once: true });
      }
    });

    el.querySelectorAll('video').forEach((video) => {
      const v = video as HTMLVideoElement;
      if (v.readyState >= 1) {
        onMediaReady();
      } else {
        v.addEventListener('loadedmetadata', onMediaReady, { once: true });
      }
    });
  }

  function backfillForBranch(messageId: string) {
    const s = params.store.get();
    const msg = (s.streamMessages || []).find((m) => m.id === messageId);
    if (!msg) return showError('找不到该记录');

    try {
      if (msg.kind === 'generate') {
        const prompt = (typeof msg.userPrompt === 'string' && msg.userPrompt.trim() ? msg.userPrompt.trim() : msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        const padRefIds = (Array.isArray(msg.mjPadRefIds) ? msg.mjPadRefIds : typeof msg.mjPadRefId === 'string' ? [msg.mjPadRefId] : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 12);
        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'mj',
          mjSrefRefId: typeof msg.mjSrefRefId === 'string' ? msg.mjSrefRefId : undefined,
          mjCrefRefId: typeof msg.mjCrefRefId === 'string' ? msg.mjCrefRefId : undefined,
          mjSrefImageUrl: typeof msg.mjSrefImageUrl === 'string' ? msg.mjSrefImageUrl : undefined,
          mjCrefImageUrl: typeof msg.mjCrefImageUrl === 'string' ? msg.mjCrefImageUrl : undefined,
          selectedReferenceIds: padRefIds,
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
          selectedReferenceIds: [refId].map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24),
          activeImageId: refId,
        }));
        showMessage('已回填 DESCRIBE 入参（新分支）：编辑后点击发送（小飞机）执行');
        return;
      }

      if (msg.kind === 'pedit') {
        const prompt = (msg.text || '').trim();
        if (!prompt) return showError('提示词为空');
        const refIds = (Array.isArray(msg.refIds) ? msg.refIds : msg.refId ? [msg.refId] : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 24);
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

        params.store.update((st) => ({
          ...st,
          traceHeadMessageId: msg.id,
          commandMode: 'video',
          videoProvider: msg.provider === 'sora' || msg.provider === 'gemini' ? (msg.provider as any) : st.videoProvider,
          videoModel: typeof msg.videoModel === 'string' ? msg.videoModel : st.videoModel,
          videoSeconds: typeof msg.videoSeconds === 'number' ? msg.videoSeconds : st.videoSeconds,
          videoMode: undefined,
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

    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.dataset.streamHide = '1';
    hideBtn.title = '从对话界面移除（不删除历史/本地数据）';
    hideBtn.className =
      'absolute -top-4 right-[5.5rem] w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-red-400/30 hover:text-red-200 transition-all flex items-center justify-center z-30 ' +
      'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto';
    hideBtn.innerHTML = '<i class="fas fa-trash text-[11px]"></i>';
    panel.appendChild(hideBtn);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.streamEdit = '1';
    edit.title = '回填编辑（分叉重生）';
    edit.className =
      'absolute -top-4 right-[3.25rem] w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/30 hover:text-white transition-all flex items-center justify-center z-30 ' +
      'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto';
    edit.innerHTML = '<i class="fas fa-pen text-[11px]"></i>';
    panel.appendChild(edit);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.streamTrace = '1';
    btn.title = '链路追踪';
    btn.className =
      'absolute -top-4 right-4 w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/30 hover:text-white transition-all flex items-center justify-center z-30 ' +
      'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto';
    btn.innerHTML = '<i class="fas fa-sitemap text-[11px]"></i>';
    panel.appendChild(btn);

    bindDownloadProcessor(el);
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

    const retryWrap = el.querySelector<HTMLElement>('[data-retry-wrap="1"]');
    if (retryWrap) {
      const canRetry = Boolean(m.taskId && m.taskId.trim() && m.error && m.error.trim());
      retryWrap.classList.toggle('hidden', !canRetry);
    }
  }

  function isSunoPending(m: StreamMessage): boolean {
    if (m.kind !== 'suno') return false;
    return !m.error && (typeof m.progress !== 'number' || m.progress < 100);
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
        if (resizeObserver) resizeObserver.unobserve(el);
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
        bindAsyncLayoutStick(el);
        rendered.set(id, el);
        lastById.set(id, resolved);
        stream.appendChild(el);
        continue;
      }

      if (!prev) {
        const el = mountMessage(resolved, state);
        if (resizeObserver) resizeObserver.unobserve(existing);
        bindAsyncLayoutStick(el);
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
      const sunoTransition =
        prev.kind === 'suno' &&
        prev.role === 'ai' &&
        (isSunoPending(prev) !== isSunoPending(resolved) ||
          (prev.text || '') !== (resolved.text || '') ||
          (prev.error || '') !== (resolved.error || '') ||
          (prev.progress || 0) !== (resolved.progress || 0) ||
          JSON.stringify((prev.inputImageUrls || []).slice(0, 8)) !== JSON.stringify((resolved.inputImageUrls || []).slice(0, 8)));
      const youtubeTransition =
        prev.kind === 'youtube' &&
        prev.role === 'ai' &&
        youtubeReconcileSignature(prev) !== youtubeReconcileSignature(resolved);
      const kindChanged = prev.kind !== resolved.kind || prev.role !== resolved.role;
      const needsReplace =
        kindChanged ||
        generateTransition ||
        upscaleTransition ||
        peditTransition ||
        videoTransition ||
        sunoTransition ||
        youtubeTransition ||
        (prev.kind === 'deconstruct' && (prev.text !== resolved.text || prev.imageUrl !== resolved.imageUrl)) ||
        (prev.kind === 'generate' && prev.role === 'user' && prev.text !== resolved.text) ||
        (prev.kind === 'upscale' && prev.role === 'user' && prev.text !== resolved.text) ||
        (prev.kind === 'pedit' && prev.role === 'user' && prev.text !== resolved.text);

      if (needsReplace) {
        const el = mountMessage(resolved, state);
        if (resizeObserver) resizeObserver.unobserve(existing);
        bindAsyncLayoutStick(el);
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
    if (!didInitialAutoScroll) {
      didInitialAutoScroll = true;
      if (visibleMessages.length > 0) {
        followBottom = true;
        queueStickToBottom();
      }
    } else if (isAppend && atBottom) {
      followBottom = true;
      queueStickToBottom();
    }
    updateScrollJumpButtons();
    lastIds = nextIds;
  }

  function clearDesktopUi() {
    params.store.update((s) => hideAllStreamMessagesUiOnly(s));
  }

  const clearUiBtn = document.getElementById('streamClearUiBtn') as HTMLButtonElement | null;
  clearUiBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDesktopUi();
  });

  scrollTopBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    followBottom = false;
    stream.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => updateScrollJumpButtons());
  });

  scrollBottomBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    followBottom = true;
    stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
    queueStickToBottom();
    requestAnimationFrame(() => updateScrollJumpButtons());
  });

  stream.addEventListener('scroll', () => {
    followBottom = isNearBottom(120);
    updateScrollJumpButtons();
  });

  window.addEventListener('resize', () => updateScrollJumpButtons());

  stream.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const hide = target.closest<HTMLElement>('[data-stream-hide="1"]');
    if (hide) {
      e.preventDefault();
      e.stopPropagation();
      const card = hide.closest<HTMLElement>('[data-message-id]');
      const id = card?.dataset.messageId || '';
      if (!id) return;
      params.store.update((s) => hideStreamMessageUiOnly(s, id));
      return;
    }

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
  updateScrollJumpButtons();
}

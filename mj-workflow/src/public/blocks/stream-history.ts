import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';

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
      <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden bg-studio-panel/60">
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
        const fn = (window as any).fillPrompt as ((text: string) => void) | undefined;
        if (fn && m.text) fn(m.text);
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
  const imageUrl = m.gridImageUrl || '';
  msg.className = 'group relative animate-fade-in-up';
  msg.innerHTML = `
    <div class="relative rounded-[3rem] overflow-hidden border border-white/5 shadow-3xl bg-black/40 backdrop-blur-sm">
      <img src="${escapeHtml(imageUrl)}" class="w-full grayscale group-hover:grayscale-0 transition-all duration-[6s] hover:scale-105" referrerpolicy="no-referrer" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 flex flex-col justify-end p-12">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-[11px] font-black uppercase tracking-[0.5em] text-studio-accent mb-2">Synthesis Finalized</span>
            <span class="text-[9px] font-mono opacity-40">FRAGMENT_ID: ${escapeHtml(taskId.slice(0, 8))} // STABLE_READY</span>
          </div>
          <div class="flex gap-3 p-2 glass-panel rounded-2xl border border-white/10" id="gridActions_${escapeHtml(taskId)}"></div>
        </div>
        <div class="mt-10 flex justify-end">
          <button id="upscaleBtn_${escapeHtml(taskId)}" disabled
            class="btn-studio btn-studio-primary !px-14 !h-16 !text-[11px] !rounded-2xl shadow-3xl scale-95 group-hover:scale-100 transition-all duration-500">
            INITIATE ENHANCEMENT <i class="fas fa-microchip ml-4"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  queueMicrotask(() => {
    const init = (window as any).initCardSelection as ((taskId: string, gridUrl: string) => void) | undefined;
    if (init && taskId && imageUrl) init(taskId, imageUrl);
  });

  return msg;
}

function renderUpscaleMessage(m: StreamMessage): HTMLElement {
  const msg = document.createElement('div');
  msg.dataset.streamMessage = '1';
  const id = m.taskId || m.id;
  const imageUrl = m.upscaledImageUrl || '';
  msg.className = 'group animate-fade-in-up space-y-12';
  msg.innerHTML = `
    <div class="flex items-center gap-4 opacity-40">
      <div class="w-8 h-8 rounded-full bg-studio-accent/10 flex items-center justify-center border border-studio-accent/20">
        <i class="fas fa-microchip text-[10px] text-studio-accent"></i>
      </div>
      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-[0.3em]">Neural Enhancement Complete</span>
        <span class="text-[8px] font-mono opacity-60">High-Fidelity Reconstruction Protocol</span>
      </div>
    </div>

    <div class="relative rounded-[3.5rem] overflow-hidden border border-white/5 shadow-3xl bg-black">
      <img src="${escapeHtml(imageUrl)}" class="w-full" referrerpolicy="no-referrer" />
      <div class="absolute top-8 right-8 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <button onclick="window.downloadTarget('${escapeHtml(imageUrl)}')"
          class="w-12 h-12 flex items-center justify-center rounded-2xl glass-panel border border-white/20 hover:bg-studio-accent hover:text-studio-bg transition-all">
          <i class="fas fa-download text-xs"></i>
        </button>
      </div>
    </div>

    <div class="max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
      <div class="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
        <i class="fas fa-bezier-curve text-8xl"></i>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
        <div class="lg:col-span-8 space-y-8">
          <div class="flex items-center gap-3">
            <span class="text-[9px] font-black uppercase tracking-widest opacity-30">AI Co-Processor</span>
            <div class="h-px flex-1 bg-white/5"></div>
          </div>
          <textarea id="editPrompt_${escapeHtml(id)}"
            class="w-full h-28 bg-white/[0.02] border border-white/5 rounded-3xl p-5 text-sm focus:border-studio-accent/50 transition-all resize-none placeholder:opacity-10"
            placeholder="Enter semantic refinement instructions..."></textarea>
          <button onclick="window.geminiEditCard('${escapeHtml(id)}', '${escapeHtml(imageUrl)}')"
            class="btn-studio btn-studio-outline w-full !py-5 !text-[10px] !rounded-[1.5rem] hover:bg-studio-accent/5">
            EXECUTE SEMANTIC PATCH
          </button>
        </div>
        <div class="lg:col-span-4 flex flex-col gap-4">
          <div class="p-6 rounded-3xl border border-white/5 bg-white/[0.01]">
            <span class="text-[8px] font-black uppercase tracking-widest opacity-20 block mb-4">Asset Specs</span>
            <div class="space-y-3">
              <div class="flex justify-between text-[8px] font-mono opacity-40"><span>FORMAT</span><span>PNG/RGBA</span></div>
              <div class="flex justify-between text-[8px] font-mono opacity-40"><span>UPSCALED</span><span>4X/STABLE</span></div>
            </div>
          </div>
        </div>
      </div>

      <div id="editResult_${escapeHtml(id)}" class="hidden pt-12 mt-12 border-t border-white/5 animate-fade-in-up"></div>
    </div>
  `;
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
  let lastSig = '';

  function resolveMessageImageUrl(m: StreamMessage, state: WorkflowState): StreamMessage {
    if (m.imageUrl) return m;
    if (!m.refId) return m;
    const ref = state.referenceImages.find((r) => r.id === m.refId);
    const url = ref?.cdnUrl || ref?.url || ref?.localUrl;
    if (!url) return m;
    return { ...m, imageUrl: url };
  }

  function renderAll(messages: StreamMessage[]) {
    clearRenderedMessages(stream);
    const state = params.store.get();
    for (const m of messages) {
      stream.appendChild(renderMessage(resolveMessageImageUrl(m, state)));
    }
    ensureZeroState(stream, messages.length > 0);
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
    const sig = `${s.streamMessages.length}:${s.streamMessages.at(-1)?.id || ''}`;
    if (sig !== lastSig) {
      lastSig = sig;
      renderAll(s.streamMessages);
    }
    const countEl = document.getElementById('conversationCount');
    if (countEl) countEl.textContent = String(s.streamMessages.length || 0);
  });

  return { renderAll, clearConversation, saveConversation };
}

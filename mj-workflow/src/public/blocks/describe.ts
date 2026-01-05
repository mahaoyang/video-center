import type { ApiClient } from '../adapters/api';
import type { Store } from '../state/store';
import type { ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';
import { pretty } from '../atoms/format';
import { byId, setDisabled, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import { pollTaskUntilFinalPrompt } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { urlToBase64 } from '../atoms/file';
import { randomId } from '../atoms/id';

function tryPrefillPrompt(store: Store<WorkflowState>) {
  const prompt = store.get().prompt;
  if (!prompt) return;
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;
  if (promptInput.value.trim()) return;
  promptInput.value = prompt;
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function getActiveImage(state: WorkflowState) {
  const id = state.activeImageId;
  if (id === '__none__') return undefined;
  const fromHistory = id ? state.referenceImages.find((r) => r.id === id) : undefined;
  const fallback = state.referenceImages.at(-1);
  return fromHistory || fallback;
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

function bestPreviewUrl(r: ReferenceImage): string {
  return r.dataUrl || r.cdnUrl || r.url || r.localUrl || '';
}

function pickPublicUrl(r: ReferenceImage): string | undefined {
  if (isHttpUrl(r.cdnUrl)) return r.cdnUrl;
  if (isHttpUrl(r.url)) return r.url;
  return undefined;
}

async function resolveBase64ForDescribe(r: ReferenceImage): Promise<string | undefined> {
  if (typeof r.base64 === 'string' && r.base64.trim()) return r.base64.trim();
  if (typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:')) {
    const b64 = r.dataUrl.split(',')[1] || '';
    if (b64) return b64;
  }
  if (typeof r.localUrl === 'string' && r.localUrl.trim()) {
    try {
      return await urlToBase64(r.localUrl);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function getActiveImageDataUrl(state: WorkflowState): string {
  const r = getActiveImage(state);
  if (!r) return '';
  if (r?.dataUrl) return r.dataUrl;
  const cdnUrl = r?.cdnUrl || r?.url;
  if (cdnUrl && (cdnUrl.startsWith('http://') || cdnUrl.startsWith('https://'))) return cdnUrl;
  if (r?.base64) return `data:image/png;base64,${r.base64}`;
  if (state.uploadedImageDataUrl) return state.uploadedImageDataUrl;
  if (state.uploadedImageUrl) return state.uploadedImageUrl;
  if (state.uploadedImageBase64) return `data:image/png;base64,${state.uploadedImageBase64}`;
  return '';
}

function toAbsoluteIfLocalPath(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return url;
}

export function createDescribeBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {

  function fillPrompt(text: string) {
    const input = byId<HTMLTextAreaElement>('promptInput');
    if (!input) return;
    input.value = text;
    input.focus();
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  (window as any).fillPrompt = fillPrompt;

  function persistPreviewUrl(r: ReferenceImage): string {
    return r.cdnUrl || r.url || r.localUrl || '';
  }

  async function appendToStream(type: 'user' | 'ai', content: string, imagePreviewUrl?: string) {
    const stream = byId('productionStream');
    if (!stream) return;

    // Hide zeroState if first message
    const zero = byId('zeroState');
    if (zero) zero.style.display = 'none';

    const msg = document.createElement('div');
    (msg as any).dataset.streamMessage = '1';
    if (type === 'user') {
      msg.className = 'flex justify-end animate-fade-in-up';
      const panel = document.createElement('div');
      panel.className =
        'max-w-xl glass-panel px-7 py-5 rounded-[2rem] border border-white/5 shadow-2xl bg-studio-panel/40 backdrop-blur-md relative';
      panel.innerHTML = `
        <div class="text-[9px] font-black uppercase tracking-[0.4em] text-studio-accent mb-3 opacity-60">Neural Inquiry</div>
        <p class="text-xs font-mono opacity-80 italic">Analyze context and deconstruct visual roots...</p>
      `;
      if (imagePreviewUrl) {
        const thumb = document.createElement('img');
        thumb.src = imagePreviewUrl;
        thumb.referrerPolicy = 'no-referrer';
        thumb.className = 'absolute -top-3 -left-3 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl';
        panel.appendChild(thumb);
      }
      msg.appendChild(panel);
    } else {
      msg.className = 'group animate-fade-in-up';
      const panel = document.createElement('div');
      panel.className =
        'max-w-4xl glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden bg-studio-panel/60';

      const header = document.createElement('div');
      header.className = 'flex items-center gap-4 mb-8 opacity-40';
      header.innerHTML = `
        <i class="fas fa-fingerprint text-studio-accent text-xs"></i>
        <span class="text-[10px] font-black uppercase tracking-[0.3em]">Deconstruction Complete</span>
      `;

      if (imagePreviewUrl) {
        const thumb = document.createElement('img');
        thumb.src = imagePreviewUrl;
        thumb.referrerPolicy = 'no-referrer';
        thumb.className = 'absolute top-6 left-6 w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-2xl';
        panel.appendChild(thumb);
      }

      const space = document.createElement('div');
      space.className = 'space-y-6';

      const chip = document.createElement('div');
      chip.className =
        'p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-studio-accent/30 transition-all cursor-pointer group/chip';
      chip.addEventListener('click', () => fillPrompt(content));

      const p = document.createElement('p');
      p.className = 'text-sm leading-relaxed opacity-90 group-hover/chip:text-studio-accent transition-colors';
      p.textContent = content;

      const hint = document.createElement('div');
      hint.className = 'mt-4 flex items-center justify-end gap-2 opacity-0 group-hover/chip:opacity-40 transition-opacity';
      hint.innerHTML = `
        <span class="text-[8px] font-black uppercase tracking-widest">Click to auto-fill</span>
        <i class="fas fa-arrow-right text-[8px]"></i>
      `;

      chip.appendChild(p);
      chip.appendChild(hint);
      space.appendChild(chip);
      panel.appendChild(header);
      panel.appendChild(space);
      msg.appendChild(panel);
    }
    stream.appendChild(msg);
    msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deconstructAssets() {
    const selector = byId<HTMLSelectElement>('describeEngineSelect');
    const engine = selector?.value || 'gemini';

    try {
      const s = params.store.get();
      const selected = s.selectedReferenceIds.length
        ? s.referenceImages.filter((r) => s.selectedReferenceIds.includes(r.id))
        : (() => {
            const one = getActiveImage(s);
            return one ? [one] : [];
          })();

      if (!selected.length) throw new Error('No assets detected in buffer');

      for (let i = 0; i < selected.length; i++) {
        const r = selected[i]!;
        const displayUrl = bestPreviewUrl(r);
        const persistedUrl = persistPreviewUrl(r);

        params.store.update((st) => ({
          ...st,
          streamMessages: [
            ...st.streamMessages,
            {
              id: randomId('msg'),
              createdAt: Date.now(),
              role: 'user',
              kind: 'deconstruct',
              imageUrl: persistedUrl || undefined,
              refId: r.id,
            } satisfies StreamMessage,
          ].slice(-200),
        }));
        await appendToStream('user', '', displayUrl);

        const publicUrl = pickPublicUrl(r);
        const base64 = await resolveBase64ForDescribe(r);
        if (!publicUrl && !base64) {
          await appendToStream('ai', '该图片无法读取（缺少可用 URL/base64），请重新上传。', previewUrl);
          continue;
        }

        let promptText = '';
        if (engine === 'mj') {
          const data = await params.api.describe({ base64, imageUrl: publicUrl });
          const upstreamError = getUpstreamErrorMessage(data);
          if (upstreamError) throw new Error(upstreamError);
          const taskId = getSubmitTaskId(data);
          if (!taskId) throw new Error(pretty(data) || 'MJ Describe failed');
          promptText = await pollTaskUntilFinalPrompt({ api: params.api, taskId });
        } else if (engine === 'gemini') {
          const imageUrl = publicUrl || (base64 ? `data:image/png;base64,${base64}` : '');
          const data = await params.api.geminiDescribe({ imageUrl });
          promptText = data.result?.prompt || '';
        } else if (engine.startsWith('vision:')) {
          const imageUrl = publicUrl || (base64 ? `data:image/png;base64,${base64}` : '');
          const data = await params.api.visionDescribe({
            imageUrl,
            question: 'Describe for MJ',
            model: engine.split(':')[1],
          });
          promptText = data.result?.text || '';
        }

        const aiText = promptText || 'Neural engine failed to deconstruct assets';
        params.store.update((st) => ({
          ...st,
          streamMessages: [
            ...st.streamMessages,
            {
              id: randomId('msg'),
              createdAt: Date.now(),
              role: 'ai',
              kind: 'deconstruct',
              text: aiText,
              imageUrl: persistedUrl || undefined,
              refId: r.id,
            } satisfies StreamMessage,
          ].slice(-200),
        }));
        await appendToStream('ai', aiText, displayUrl);
      }
    } catch (error) {
      console.error('Deconstruct error:', error);
      showError((error as Error)?.message);
    }
  }

  const trigger = byId('deconstructTrigger');
  if (trigger) {
    trigger.onclick = () => deconstructAssets();
  }

  return { deconstructAssets };
}

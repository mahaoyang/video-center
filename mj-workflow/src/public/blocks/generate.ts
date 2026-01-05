import type { ApiClient } from '../adapters/api';
import { pretty } from '../atoms/format';
import { byId, hide, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { randomId } from '../atoms/id';
import { buildMjPrompt } from '../atoms/mj-prompt';
import { pollTaskUntilImageUrl } from '../headless/tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../headless/upstream';

export function createGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  function escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isHttpUrl(value: string | undefined): value is string {
    if (!value) return false;
    return value.startsWith('http://') || value.startsWith('https://');
  }

  async function generateImage() {
    const promptInput = byId<HTMLTextAreaElement>('promptInput');
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showError('请输入提示词');
      return;
    }

    params.store.update((s) => ({ ...s, prompt }));
    const btn = byId<HTMLButtonElement>('step3Next');
    btn.disabled = true;

    params.activateStep(4);
    show(byId('streamPending'));
    const pt = document.getElementById('progressText');
    if (pt) pt.textContent = '0%';

    try {
      const s = params.store.get();
      const imageUrls: string[] = [];
      const extraArgs: string[] = [];

      const selected = s.referenceImages.filter((r) => s.selectedReferenceIds.includes(r.id));
      if (selected.length) {
        const missingPublic: string[] = [];
        for (const r of selected) {
          // MJ prompt images must be publicly accessible; prefer CDN URL, never relative local paths.
          const cdnUrl = (isHttpUrl(r.cdnUrl) ? r.cdnUrl : undefined) || (isHttpUrl(r.url) ? r.url : undefined);
          if (isHttpUrl(cdnUrl)) imageUrls.push(cdnUrl);
          else missingPublic.push(r.name || r.id);
        }
        if (missingPublic.length) {
          showError(`有 ${missingPublic.length} 张垫图没有 CDN 公网链接，已忽略：\n${missingPublic.slice(0, 6).join('\n')}${missingPublic.length > 6 ? '\n…' : ''}`);
        }
      }

      const finalPrompt = buildMjPrompt({
        basePrompt: prompt,
        padImages: imageUrls,
        srefImageUrl: s.mjSrefImageUrl,
        crefImageUrl: s.mjCrefImageUrl,
        extraArgs,
      });
      const imagine = await params.api.imagine({ prompt: finalPrompt });

      const upstreamError = getUpstreamErrorMessage(imagine);
      if (upstreamError) throw new Error(upstreamError);

      const taskId = getSubmitTaskId(imagine);
      if (!taskId) {
        throw new Error(pretty(imagine) || '生成失败：未返回任务ID');
      }
      params.store.update((s) => ({ ...s, taskId }));

      const imageUrl = await pollTaskUntilImageUrl({
        api: params.api,
        taskId,
        onProgress: (p) => {
          show(byId('streamPending'));
          const pt = document.getElementById('progressText');
          if (pt) pt.textContent = `${p}%`;
        },
      });

      params.store.update((s) => ({ ...s, gridImageUrl: imageUrl }));
      hide(byId('streamPending'));

      const stream = byId('productionStream');

      // 1. APPEND USER COMMAND CHIP (The 'Ask')
      const userMsg = document.createElement('div');
      userMsg.className = 'flex justify-end animate-fade-in-up';
      userMsg.innerHTML = `
        <div class="max-w-xl glass-panel px-7 py-5 rounded-[2rem] border border-white/5 shadow-2xl bg-studio-panel/40 backdrop-blur-md">
           <div class="text-[9px] font-black uppercase tracking-[0.4em] text-studio-accent mb-3 opacity-60">Neural Instruction Received</div>
           <p class="text-sm font-medium leading-relaxed opacity-90">${escapeHtml(prompt)}</p>
        </div>
      `;
      stream.appendChild(userMsg);

      // 2. APPEND AI CINEMATIC ASSET (The 'Result')
      const aiMsg = document.createElement('div');
      aiMsg.className = 'group relative animate-fade-in-up delay-300';
      aiMsg.innerHTML = `
        <div class="relative rounded-[3rem] overflow-hidden border border-white/5 shadow-3xl bg-black/40 backdrop-blur-sm">
           <img src="${imageUrl}" class="w-full grayscale group-hover:grayscale-0 transition-all duration-[6s] hover:scale-105" />
           
           <!-- THE HUD OVERLAY -->
           <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 flex flex-col justify-end p-12">
              <div class="flex items-center justify-between">
                 <div class="flex flex-col">
                    <span class="text-[11px] font-black uppercase tracking-[0.5em] text-studio-accent mb-2">Synthesis Finalized</span>
                    <span class="text-[9px] font-mono opacity-40">FRAGMENT_ID: ${taskId.substring(0, 8)} // STABLE_READY</span>
                 </div>
                 <div class="flex gap-3 p-2 glass-panel rounded-2xl border border-white/10" id="gridActions_${taskId}">
                    <!-- U-Buttons injected here -->
                 </div>
              </div>
              <div class="mt-10 flex justify-end">
                 <button id="upscaleBtn_${taskId}" disabled 
                   class="btn-studio btn-studio-primary !px-14 !h-16 !text-[11px] !rounded-2xl shadow-3xl scale-95 group-hover:scale-100 transition-all duration-500">
                   INITIATE ENHANCEMENT <i class="fas fa-microchip ml-4"></i>
                 </button>
              </div>
           </div>
        </div>
      `;
      stream.appendChild(aiMsg);

      // Focus
      aiMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Initialize selection logic
      (window as any).initCardSelection?.(taskId, imageUrl);

      const stateAfter = params.store.get();
      // ... history update remains same
      const selectedRefs = stateAfter.referenceImages
        .filter((r) => stateAfter.selectedReferenceIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt,
          url: r.url,
          cdnUrl: r.cdnUrl,
          localUrl: r.localUrl,
        }));

      params.store.update((prev) => ({
        ...prev,
        history: [
          ...prev.history,
          {
            id: randomId('hist'),
            createdAt: Date.now(),
            prompt: finalPrompt,
            taskId,
            gridImageUrl: imageUrl,
            references: selectedRefs,
            upscaledImages: [],
          },
        ].slice(-30),
      }));

      btn.disabled = false;
    } catch (error) {
      console.error('Generate error:', error);
      showError((error as Error)?.message || '生成图片失败，请重试');
      btn.disabled = false;
      hide(byId('streamPending'));
    }
  }

  return { generateImage, pollTaskUntilImageUrl };
}

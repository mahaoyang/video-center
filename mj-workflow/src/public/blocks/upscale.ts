import type { ApiClient } from '../adapters/api';
import { pretty } from '../atoms/format';
import { byId, hide, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';
import { pollTaskUntilImageUrl } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { randomId } from '../atoms/id';

export function createUpscaleBlock(params: { api: ApiClient; store: Store<WorkflowState>; activateStep: (step: any) => void }) {
  async function upscaleSelected() {
    const s = params.store.get();
    const selectedIndex = s.selectedIndices[0];
    if (!selectedIndex || !s.taskId) {
      showError('请先选择图片');
      return;
    }

    params.activateStep(6);
    show(byId('streamPending'));
    const pt = document.getElementById('progressText');
    if (pt) pt.textContent = '0%';

    try {
      const data = await params.api.upscale({ taskId: s.taskId, index: selectedIndex });
      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const upscaleTaskId = getSubmitTaskId(data);
      if (!upscaleTaskId) {
        throw new Error(pretty(data) || '扩图失败：未返回任务ID');
      }

      const imageUrl = await pollTaskUntilImageUrl({
        api: params.api,
        taskId: upscaleTaskId,
        onProgress: (p) => {
          show(byId('streamPending'));
          const pt = document.getElementById('progressText');
          if (pt) pt.textContent = `${p}%`;
        },
      });
      hide(byId('streamPending'));

      const stream = byId('productionStream');
      const card = document.createElement('div');
      card.id = `upscale_${upscaleTaskId}`;
      (card as any).dataset.streamMessage = '1';
      card.className = 'group animate-fade-in-up space-y-12';

      card.innerHTML = `
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
           <img src="${imageUrl}" class="w-full" />
           
           <!-- FLOATING HUD -->
           <div class="absolute top-8 right-8 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <button onclick="window.downloadTarget('${imageUrl}')" 
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
                 <textarea id="editPrompt_${upscaleTaskId}" 
                   class="w-full h-28 bg-white/[0.02] border border-white/5 rounded-3xl p-5 text-sm focus:border-studio-accent/50 transition-all resize-none placeholder:opacity-10"
                   placeholder="Enter semantic refinement instructions..."></textarea>
                 <button onclick="window.geminiEditCard('${upscaleTaskId}', '${imageUrl}')" 
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
           
           <div id="editResult_${upscaleTaskId}" class="hidden pt-12 mt-12 border-t border-white/5 animate-fade-in-up">
              <!-- Result will manifest here -->
           </div>
        </div>
      `;
      stream.appendChild(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });

      params.store.update((prev) => ({
        ...prev,
        streamMessages: [
          ...prev.streamMessages,
          { id: randomId('msg'), createdAt: Date.now(), role: 'ai', kind: 'upscale', taskId: upscaleTaskId, upscaledImageUrl: imageUrl } satisfies StreamMessage,
        ].slice(-200),
      }));

      params.store.update((prev) => {
        const nextUpscaled = [...prev.upscaledImages, imageUrl];
        const history = prev.history.map((h) =>
          h.taskId === prev.taskId ? { ...h, upscaledImages: [...h.upscaledImages, imageUrl] } : h
        );
        return { ...prev, upscaledImages: nextUpscaled, history };
      });
    } catch (error) {
      console.error('Upscale error:', error);
      showError((error as Error)?.message || '扩图失败，请重试');
      hide(byId('streamPending'));
    }
  }

  // Exposed to window for card-based action
  (window as any).geminiEditCard = async (cardId: string, imageUrl: string) => {
    const promptArea = byId<HTMLTextAreaElement>(`editPrompt_${cardId}`);
    const editPrompt = promptArea.value.trim();
    if (!editPrompt) {
      showError('请输入微调指令');
      return;
    }

    const resContainer = byId(`editResult_${cardId}`);
    resContainer.innerHTML = `<div class="p-10 flex flex-col items-center opacity-40"><i class="fas fa-spinner fa-spin mb-4"></i><span class="text-[9px] uppercase tracking-widest">Applying Patch...</span></div>`;
    show(resContainer);

    try {
      const data = await params.api.geminiEdit({ imageUrl, editPrompt });
      if (data.code === 0 && data.result?.imageDataUrl) {
        resContainer.innerHTML = `
            <div class="label-mono text-studio-accent text-[8px] mb-4">Patch Successful // Layer 9 Integration</div>
            <div class="rounded-xl overflow-hidden border border-studio-accent/30">
               <img src="${data.result.imageDataUrl}" class="w-full" />
            </div>
            <button onclick="window.downloadTarget('${data.result.imageDataUrl}')" class="mt-6 text-[9px] font-black uppercase text-studio-accent opacity-60 hover:opacity-100 transition-all underline underline-offset-8">Download Patched Artifact</button>
         `;
        return;
      }
      throw new Error(data.description || '微调失败');
    } catch (e) {
      showError((e as Error).message);
      resContainer.innerHTML = '';
      hide(resContainer);
    }
  };

  (window as any).downloadTarget = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `mj-asset-${Date.now()}.png`;
    a.click();
  };

  const result = { upscaleSelected };
  (window as any).triggerUpscale = upscaleSelected;
  return result;
}

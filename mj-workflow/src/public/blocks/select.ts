import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { byId, setDisabled } from '../atoms/ui';

export function createSelectionBlock(store: Store<WorkflowState>) {
  function updateStep5Buttons() {
    const hasSelection = store.get().selectedIndices.length > 0;
    const upscaleBtn = document.getElementById('step5Next') as HTMLButtonElement | null;
    if (!upscaleBtn) return;
    setDisabled(upscaleBtn, !hasSelection);
  }

  function renderSplitGrid() {
    const gridImageUrl = store.get().gridImageUrl;
    if (!gridImageUrl) return;

    store.update((s) => ({ ...s, selectedIndices: [] }));
    updateStep5Buttons();

    const container = byId<HTMLElement>('splitImages');
    container.innerHTML = '';

    for (let i = 0; i < 4; i++) {
      const idx = i + 1;
      const btn = document.createElement('button');
      btn.className = 'w-12 h-12 rounded-xl border border-studio-border flex items-center justify-center text-[10px] font-black hover:border-studio-accent hover:text-studio-accent transition-all';
      btn.textContent = `V${idx}`;

      btn.onclick = () => {
        store.update(s => {
          const already = s.selectedIndices.includes(idx);
          // MJ selection is usually one for upscale in this UX, but we can support multi
          const next = already ? [] : [idx];
          return { ...s, selectedIndices: next };
        });

        // Trigger visual update
        container.querySelectorAll('button').forEach((b, k) => {
          const isSel = store.get().selectedIndices.includes(k + 1);
          b.classList.toggle('bg-studio-accent', isSel);
          b.classList.toggle('text-black', isSel);
          b.classList.toggle('border-studio-accent', isSel);
        });

        updateStep5Buttons();
      };

      container.appendChild(btn);
    }
  }

  (window as any).refreshSelectionGrid = renderSplitGrid;

  (window as any).initCardSelection = (taskId: string, gridUrl: string) => {
    const container = byId(`gridActions_${taskId}`);
    const upscaleBtn = byId(`upscaleBtn_${taskId}`) as HTMLButtonElement;
    if (!container || !upscaleBtn) return;

    let localSelection: number | null = null;

    for (let i = 1; i <= 4; i++) {
      const btn = document.createElement('button');
      btn.className = 'w-10 h-10 rounded-lg border border-studio-border flex items-center justify-center text-[9px] font-black hover:border-studio-accent transition-all';
      btn.textContent = `V${i}`;

      btn.onclick = () => {
        localSelection = localSelection === i ? null : i;

        // Update visual state
        container.querySelectorAll('button').forEach((b, idx) => {
          const isSelected = localSelection === (idx + 1);
          b.classList.toggle('bg-studio-accent', isSelected);
          b.classList.toggle('text-black', isSelected);
          b.classList.toggle('border-studio-accent', isSelected);
        });

        // Update global store for UpscaleBlock to pick up
        store.update(s => ({ ...s, selectedIndices: localSelection ? [localSelection] : [], taskId }));
        upscaleBtn.disabled = !localSelection;
      };

      container.appendChild(btn);
    }

    upscaleBtn.onclick = () => {
      // Trigger the global upscaleSelected function
      (window as any).triggerUpscale?.();
    };
  };

  (window as any).triggerUpscale = () => {
    // This will be handled by the createUpscaleBlock return
  };

  return { renderSplitGrid };
}

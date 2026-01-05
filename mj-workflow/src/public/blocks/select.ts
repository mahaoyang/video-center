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
      const div = document.createElement('div');
      div.className = 'image-grid-item group';
      div.dataset.index = String(i + 1);

      const img = document.createElement('img');
      img.src = gridImageUrl;
      img.className = 'transition-all duration-700 grayscale-[0.3] group-hover:grayscale-0';
      // True 2x2 split: cut at horizontal/vertical midlines.
      img.style.position = 'absolute';
      img.style.left = '0';
      img.style.top = '0';
      img.style.width = '200%';
      img.style.height = '200%';
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.objectFit = 'cover';
      const tx = i % 2 === 0 ? '0%' : '-50%';
      const ty = i < 2 ? '0%' : '-50%';
      img.style.transform = `translate(${tx}, ${ty})`;

      div.appendChild(img);

      // Selection indicator
      const check = document.createElement('div');
      check.className = 'absolute top-3 right-3 w-6 h-6 rounded-full bg-brand-green text-white flex items-center justify-center opacity-0 scale-50 transition-all duration-300 z-10';
      check.innerHTML = '<i class="fas fa-check text-[10px]"></i>';
      div.appendChild(check);

      div.addEventListener('click', () => {
        const idx = i + 1;
        store.update((s) => {
          const selected = [...s.selectedIndices];
          const pos = selected.indexOf(idx);
          if (pos === -1) selected.push(idx);
          else selected.splice(pos, 1);
          return { ...s, selectedIndices: selected };
        });

        const isSelected = store.get().selectedIndices.includes(idx);
        if (isSelected) {
          div.classList.add('selected');
          check.classList.remove('opacity-0', 'scale-50');
          check.classList.add('opacity-100', 'scale-100');
        } else {
          div.classList.remove('selected');
          check.classList.add('opacity-0', 'scale-50');
          check.classList.remove('opacity-100', 'scale-100');
        }

        updateStep5Buttons();
      });

      container.appendChild(div);
    }
  }

  return { renderSplitGrid };
}

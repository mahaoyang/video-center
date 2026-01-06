import { toAppImageSrc } from './image-src';

function ensureModal(): {
  overlay: HTMLDivElement;
  img: HTMLImageElement;
  closeBtn: HTMLButtonElement;
} {
  const existing = document.getElementById('imagePreviewOverlay') as HTMLDivElement | null;
  if (existing) {
    return {
      overlay: existing,
      img: existing.querySelector('img') as HTMLImageElement,
      closeBtn: existing.querySelector('[data-action="close"]') as HTMLButtonElement,
    };
  }

  const overlay = document.createElement('div');
  overlay.id = 'imagePreviewOverlay';
  overlay.className = 'fixed inset-0 z-[9999] hidden';

  overlay.innerHTML = `
    <div class="absolute inset-0 bg-black/70 backdrop-blur-md"></div>
    <div class="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
      <div class="relative w-[96vw] h-[92vh] max-w-none glass-panel rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden bg-studio-panel/70">
        <button data-action="close" type="button"
          class="absolute top-4 right-4 w-10 h-10 rounded-2xl bg-black/40 border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all flex items-center justify-center z-10">
          <i class="fas fa-times text-[12px]"></i>
        </button>
        <div class="w-full h-full bg-black/30">
          <img id="imagePreviewImg" class="w-full h-full object-contain block" referrerpolicy="no-referrer" />
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('[data-action="close"]') as HTMLButtonElement;
  const img = overlay.querySelector('#imagePreviewImg') as HTMLImageElement;

  const close = () => overlay.classList.add('hidden');
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).id === 'imagePreviewOverlay') close();
  });
  overlay.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') close();
  });

  return { overlay, img, closeBtn };
}

export function openImagePreview(src: string) {
  const { overlay, img } = ensureModal();
  img.src = toAppImageSrc(src);
  overlay.classList.remove('hidden');
}

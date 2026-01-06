type OverlayKey = 'vault' | 'matrix' | 'planner';

const IDS: Record<OverlayKey, { overlay: string; panel: string; backdrop: string }> = {
  vault: { overlay: 'historyOverlay', panel: 'historyPanel', backdrop: 'historyBackdrop' },
  matrix: { overlay: 'matrixOverlay', panel: 'matrixPanel', backdrop: 'matrixBackdrop' },
  planner: { overlay: 'plannerOverlay', panel: 'plannerPanel', backdrop: 'plannerBackdrop' },
};

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id) as HTMLElement | null;
}

export function setOverlayOpen(key: OverlayKey, open: boolean) {
  const ids = IDS[key];
  const overlay = getEl(ids.overlay);
  const panel = getEl(ids.panel);
  const backdrop = getEl(ids.backdrop);
  if (!overlay || !panel || !backdrop) return;

  if (open) {
    overlay.classList.remove('pointer-events-none');
    panel.classList.remove('translate-x-full');
    backdrop.classList.add('opacity-100');
    document.body.style.overflow = 'hidden';
  } else {
    overlay.classList.add('pointer-events-none');
    panel.classList.add('translate-x-full');
    backdrop.classList.remove('opacity-100');
    document.body.style.overflow = '';
  }
}

export function setVaultOpen(open: boolean) {
  setOverlayOpen('vault', open);
}

export function setMatrixOpen(open: boolean) {
  setOverlayOpen('matrix', open);
}

export function setPlannerOpen(open: boolean) {
  setOverlayOpen('planner', open);
}


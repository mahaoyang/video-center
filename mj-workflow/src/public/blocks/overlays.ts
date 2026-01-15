import { setMatrixOpen, setPlannerOpen, setTraceOpen, setVaultOpen } from '../atoms/overlays';

function byId(id: string): HTMLElement | null {
  return document.getElementById(id) as HTMLElement | null;
}

function bindOpen(id: string, open: () => void) {
  const el = byId(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open();
  });
}

function bindClose(id: string, close: () => void) {
  const el = byId(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
}

export function initOverlays() {
  bindOpen('vaultOpenTrigger', () => setVaultOpen(true));
  bindOpen('matrixOpenTrigger', () => setMatrixOpen(true));
  bindOpen('plannerOpenTrigger', () => setPlannerOpen(true));
  bindOpen('padMatrixBtn', () => setMatrixOpen(true));

  bindClose('historyBackdrop', () => setVaultOpen(false));
  bindClose('vaultCloseBtn', () => setVaultOpen(false));
  bindClose('matrixBackdrop', () => setMatrixOpen(false));
  bindClose('matrixCloseBtn', () => setMatrixOpen(false));
  bindClose('plannerBackdrop', () => setPlannerOpen(false));
  bindClose('plannerCloseBtn', () => setPlannerOpen(false));
}

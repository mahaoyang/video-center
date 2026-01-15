import { byId } from '../atoms/ui';

export function keepStreamBottomPaddingClear(params?: { extraPx?: number }) {
  const stream = byId<HTMLElement>('productionStream');
  const hub = byId<HTMLElement>('commandHub');

  const extra = typeof params?.extraPx === 'number' ? params.extraPx : 24;
  const basePadding = Number.parseFloat(getComputedStyle(stream).paddingBottom || '0') || 0;

  function apply() {
    const rect = hub.getBoundingClientRect();
    const obscured = Math.max(0, window.innerHeight - rect.top);
    const next = Math.max(basePadding, obscured + extra);
    stream.style.paddingBottom = `${Math.round(next)}px`;
  }

  apply();
  window.addEventListener('resize', apply, { passive: true });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => apply());
    ro.observe(hub);
  }
}


export function setupScrollArea(root: Element | null) {
  if (!root) return;
  const el = root as HTMLElement;
  if (el.dataset.rtScrollAreaInitialized === 'true') {
    const update = (el as any).__rtScrollAreaUpdate;
    if (typeof update === 'function') update();
    return;
  }

  const viewport = el.querySelector<HTMLElement>('.rt-ScrollAreaViewport');
  const verticalBar = el.querySelector<HTMLElement>(".rt-ScrollAreaScrollbar[data-orientation='vertical']");
  const horizontalBar = el.querySelector<HTMLElement>(".rt-ScrollAreaScrollbar[data-orientation='horizontal']");
  if (!viewport) return;

  el.dataset.rtScrollAreaInitialized = 'true';
  const minThumbSize =
    parseFloat(getComputedStyle(el).getPropertyValue('--scrollarea-thumb-min-size')) || 16;

  const updateBar = (
    bar: HTMLElement | null,
    scrollPos: number,
    viewSize: number,
    scrollSize: number,
    orientation: 'vertical' | 'horizontal'
  ) => {
    if (!bar) return;
    const thumb = bar.querySelector<HTMLElement>('.rt-ScrollAreaThumb');
    if (!thumb) return;

    const hasOverflow = scrollSize - viewSize > 0.5;
    bar.style.display = hasOverflow ? 'flex' : 'none';
    bar.dataset.state = hasOverflow ? 'visible' : 'hidden';
    if (!hasOverflow) return;

    const trackSize = orientation === 'vertical' ? bar.clientHeight : bar.clientWidth;
    const thumbSize = Math.max(minThumbSize, (viewSize / scrollSize) * trackSize);
    const maxScroll = Math.max(scrollSize - viewSize, 1);
    const maxOffset = Math.max(trackSize - thumbSize, 0);
    const scrollRatio = Math.min(Math.max(scrollPos / maxScroll, 0), 1);
    const offset = maxOffset * scrollRatio;

    if (orientation === 'vertical') {
      thumb.style.height = `${thumbSize}px`;
      thumb.style.transform = `translateY(${offset}px)`;
    } else {
      thumb.style.width = `${thumbSize}px`;
      thumb.style.transform = `translateX(${offset}px)`;
    }
  };

  const update = () => {
    updateBar(verticalBar, viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight, 'vertical');
    updateBar(horizontalBar, viewport.scrollLeft, viewport.clientWidth, viewport.scrollWidth, 'horizontal');
  };
  (el as any).__rtScrollAreaUpdate = update;

  const attachDragging = (bar: HTMLElement | null, orientation: 'vertical' | 'horizontal') => {
    if (!bar) return;
    const thumb = bar.querySelector<HTMLElement>('.rt-ScrollAreaThumb');
    if (!thumb) return;

    const scrollProp = orientation === 'vertical' ? 'scrollTop' : 'scrollLeft';
    const pointerProp = orientation === 'vertical' ? 'clientY' : 'clientX';
    const sizeProp = orientation === 'vertical' ? 'clientHeight' : 'clientWidth';
    const scrollSizeProp = orientation === 'vertical' ? 'scrollHeight' : 'scrollWidth';

    thumb.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      thumb.setPointerCapture(event.pointerId);

      const trackSize = (bar as any)[sizeProp] as number;
      const thumbSize =
        (thumb as any)[sizeProp === 'clientHeight' ? 'offsetHeight' : 'offsetWidth'] as number;
      const maxScroll = Math.max((viewport as any)[scrollSizeProp] - (viewport as any)[sizeProp], 0);
      const maxOffset = Math.max(trackSize - thumbSize, 0);
      const startPointer = (event as any)[pointerProp] as number;
      const startScroll = (viewport as any)[scrollProp] as number;
      const startOffset = maxScroll ? (startScroll / maxScroll) * maxOffset : 0;

      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        const delta = (moveEvent as any)[pointerProp] - startPointer;
        const nextOffset = Math.min(Math.max(startOffset + delta, 0), maxOffset);
        const nextScroll = maxScroll ? (nextOffset / maxOffset) * maxScroll : 0;
        (viewport as any)[scrollProp] = nextScroll;
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    });

    // Jump on track click.
    bar.addEventListener('pointerdown', (event) => {
      if (event.target === thumb) return;
      const rect = bar.getBoundingClientRect();
      const thumbPixels =
        (thumb as any)[sizeProp === 'clientHeight' ? 'offsetHeight' : 'offsetWidth'] as number;
      const pointerPos =
        (orientation === 'vertical' ? event.clientY - rect.top : event.clientX - rect.left) - thumbPixels / 2;
      const trackSize = (bar as any)[sizeProp] as number;
      const maxOffset = Math.max(trackSize - thumbPixels, 1);
      const ratio = Math.min(Math.max(pointerPos / maxOffset, 0), 1);
      const maxScroll = Math.max((viewport as any)[scrollSizeProp] - (viewport as any)[sizeProp], 0);
      (viewport as any)[scrollProp] = maxScroll * ratio;
    });
  };

  viewport.addEventListener('scroll', update);
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);
    const content = viewport.querySelector<HTMLElement>('.rt-ScrollAreaContent') ?? viewport.firstElementChild;
    if (content) resizeObserver.observe(content);
  } else {
    window.addEventListener('resize', update);
  }

  attachDragging(verticalBar, 'vertical');
  attachDragging(horizontalBar, 'horizontal');
  update();
}

export function setupScrollAreas(container: ParentNode = document) {
  container.querySelectorAll('.rt-ScrollAreaRoot').forEach((root) => setupScrollArea(root));
}

export function scrollAreaViewport(root: Element): HTMLElement {
  const viewport = root.querySelector<HTMLElement>('.rt-ScrollAreaViewport');
  if (!viewport) throw new Error('缺少 .rt-ScrollAreaViewport');
  const content = viewport.querySelector<HTMLElement>('.rt-ScrollAreaContent');
  if (content) return content;
  return viewport;
}

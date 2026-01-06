export function createPopoverMenu(params: {
  button: HTMLElement;
  menu: HTMLElement;
  onOpenChange?: (open: boolean) => void;
}) {
  let open = false;

  function setOpen(next: boolean) {
    open = next;
    params.menu.classList.toggle('hidden', !open);
    params.button.setAttribute('aria-expanded', open ? 'true' : 'false');
    params.onOpenChange?.(open);
  }

  function toggle() {
    setOpen(!open);
  }

  params.button.setAttribute('aria-haspopup', 'menu');
  params.button.setAttribute('aria-expanded', 'false');

  params.button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  document.addEventListener('mousedown', (e) => {
    if (!open) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (params.button.contains(t) || params.menu.contains(t)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') setOpen(false);
  });

  return {
    get open() {
      return open;
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle,
  };
}


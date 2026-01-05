export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少元素 #${id}`);
  return el as T;
}

export function show(el: HTMLElement) {
  el.classList.remove('hidden');
}

export function hide(el: HTMLElement) {
  el.classList.add('hidden');
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, disabled: boolean) {
  el.disabled = disabled;
}

export function scrollIntoView(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


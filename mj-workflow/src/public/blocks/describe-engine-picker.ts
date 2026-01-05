import { byId } from '../atoms/ui';

type EngineValue = 'gemini' | 'mj' | 'vision:gpt-4o';

const LABELS: Record<EngineValue, string> = {
  gemini: 'Gemini Pro',
  mj: 'MJ Describe',
  'vision:gpt-4o': 'GPT‑4o Vision',
};

function show(el: HTMLElement) {
  el.classList.remove('hidden');
}

function hide(el: HTMLElement) {
  el.classList.add('hidden');
}

export function createDescribeEnginePicker() {
  const select = byId<HTMLSelectElement>('describeEngineSelect');
  const btn = byId<HTMLButtonElement>('describeEngineBtn');
  const label = byId<HTMLElement>('describeEngineLabel');
  const menu = byId<HTMLElement>('describeEngineMenu');

  function setValue(value: EngineValue) {
    select.value = value;
    label.textContent = LABELS[value] || value;
  }

  function open() {
    show(menu);
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    hide(menu);
    btn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (menu.classList.contains('hidden')) open();
    else close();
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  menu.querySelectorAll<HTMLButtonElement>('button[data-engine]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = b.dataset.engine as EngineValue | undefined;
      if (!v) return;
      setValue(v);
      close();
    });
  });

  document.addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Initialize from persisted/native select value if present.
  const initial = (select.value as EngineValue) || 'gemini';
  setValue(initial in LABELS ? (initial as EngineValue) : 'gemini');
  close();

  return { setValue, close, open };
}


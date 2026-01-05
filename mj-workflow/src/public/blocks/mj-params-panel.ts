import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { clearAspectRatio, parseMjParams, removeMjParams, setAspectRatio } from '../atoms/mj-params';
import { getPreferredMjAspectRatio, setPreferredMjAspectRatio } from '../atoms/mj-preferences';

function formatParam(name: string, value: string | true): string {
  if (value === true) return `--${name}`;
  return `--${name} ${value}`.trim();
}

function getPromptText(promptInput: HTMLTextAreaElement, state: WorkflowState): string {
  return (promptInput.value || state.prompt || '').trim();
}

function applyToPrompt(promptInput: HTMLTextAreaElement, next: string) {
  promptInput.value = next;
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
}

export function createMjParamsPanel(store: Store<WorkflowState>) {
  const promptInput = byId<HTMLTextAreaElement>('promptInput');
  const arCurrent = document.getElementById('mjArCurrent') as HTMLElement | null;
  const detected = document.getElementById('mjDetectedParams') as HTMLElement | null;
  const clearArBtn = document.getElementById('mjClearArBtn') as HTMLButtonElement | null;
  const arButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mj-ar-btn'));

  const activeArClasses = ['bg-studio-accent', 'text-studio-bg', 'ring-2', 'ring-studio-accent'];

  function setActiveArButton(ar: string | null) {
    for (const btn of arButtons) {
      const isActive = Boolean(ar && btn.getAttribute('data-ar') === ar);
      for (const c of activeArClasses) btn.classList.toggle(c, isActive);
    }
  }

  function applyArToPrompt(ar: string) {
    const next = setAspectRatio(getPromptText(promptInput, store.get()), ar);
    applyToPrompt(promptInput, next);
  }

  function ensureDefaultPreference() {
    const existing = getPreferredMjAspectRatio();
    if (existing) return existing;
    const fallback = '1:1';
    setPreferredMjAspectRatio(fallback);
    return fallback;
  }

  function render(state: WorkflowState) {
    if (!detected) return;
    const prompt = getPromptText(promptInput, state);
    const parsed = parseMjParams(prompt);
    const ar = parsed.map['ar'] ?? parsed.map['aspect'];
    const preferredAr = ensureDefaultPreference();
    const currentAr = typeof ar === 'string' ? ar : preferredAr;
    if (typeof ar === 'string') setPreferredMjAspectRatio(ar);
    if (arCurrent) arCurrent.textContent = currentAr ? `--ar ${currentAr}` : '';
    setActiveArButton(currentAr || null);

    detected.innerHTML = '';
    for (const p of parsed.params) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className =
        'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all';
      chip.textContent = `${formatParam(p.name, p.value)} ×`;
      chip.addEventListener('click', () => {
        const next = removeMjParams(getPromptText(promptInput, store.get()), [p.name]);
        applyToPrompt(promptInput, next);
      });
      detected.appendChild(chip);
    }
  }

  for (const btn of arButtons) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ar = btn.getAttribute('data-ar');
      if (!ar) return;
      setPreferredMjAspectRatio(ar);
      applyArToPrompt(ar);
      setActiveArButton(ar);
      if (arCurrent) arCurrent.textContent = `--ar ${ar}`;
    });
  }

  clearArBtn?.addEventListener('click', () => {
    const next = clearAspectRatio(getPromptText(promptInput, store.get()));
    applyToPrompt(promptInput, next);
    // Reset to default ratio (and keep a stable preference for gemini/generation).
    const fallback = '1:1';
    setPreferredMjAspectRatio(fallback);
    setActiveArButton(fallback);
    if (arCurrent) arCurrent.textContent = `--ar ${fallback}`;
  });

  render(store.get());
  store.subscribe(render);
}

import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { clearAspectRatio, parseMjParams, removeMjParams, setAspectRatio } from '../atoms/mj-params';

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

  function render(state: WorkflowState) {
    if (!detected) return;
    const prompt = getPromptText(promptInput, state);
    const parsed = parseMjParams(prompt);
    const ar = parsed.map['ar'] ?? parsed.map['aspect'];
    if (arCurrent) arCurrent.textContent = typeof ar === 'string' ? `当前：${ar}` : '';

    detected.innerHTML = '';
    for (const p of parsed.params) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className =
        'px-3 py-1 rounded-full text-[11px] font-semibold bg-white/70 border border-brand-green/10 hover:border-brand-green/30 transition-colors';
      chip.textContent = `${formatParam(p.name, p.value)} ×`;
      chip.addEventListener('click', () => {
        const next = removeMjParams(getPromptText(promptInput, store.get()), [p.name]);
        applyToPrompt(promptInput, next);
      });
      detected.appendChild(chip);
    }
  }

  document.querySelectorAll<HTMLButtonElement>('.mj-ar-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ratio = btn.dataset.ar;
      if (!ratio) return;
      const next = setAspectRatio(getPromptText(promptInput, store.get()), ratio);
      applyToPrompt(promptInput, next);
    });
  });

  clearArBtn?.addEventListener('click', () => {
    const next = clearAspectRatio(getPromptText(promptInput, store.get()));
    applyToPrompt(promptInput, next);
  });

  render(store.get());
  store.subscribe(render);
}


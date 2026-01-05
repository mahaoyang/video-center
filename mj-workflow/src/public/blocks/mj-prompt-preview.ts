import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { buildMjPrompt } from '../atoms/mj-prompt';

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

export function createMjPromptPreview(store: Store<WorkflowState>) {
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;

  const preview = document.getElementById('mjPromptPreview') as HTMLElement | null;
  const stats = document.getElementById('mjWrapperStats') as HTMLElement | null;

  function compute(state: WorkflowState): string {
    const basePrompt = (promptInput.value.trim() || (state.prompt || '').trim()).trim();

    const padRef = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
    const padUrl = isHttpUrl(padRef?.cdnUrl) ? padRef?.cdnUrl : isHttpUrl(padRef?.url) ? padRef?.url : undefined;

    return buildMjPrompt({
      basePrompt,
      padImages: padUrl ? [padUrl] : [],
      srefImageUrl: state.mjSrefImageUrl,
      crefImageUrl: state.mjCrefImageUrl,
    });
  }

  function render(state: WorkflowState) {
    const text = compute(state);
    if (preview) preview.textContent = text;

    if (stats) {
      const padRef = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
      const hasPadUrl = Boolean(isHttpUrl(padRef?.cdnUrl || padRef?.url));
      const sref = isHttpUrl(state.mjSrefImageUrl) ? state.mjSrefImageUrl : '';
      const cref = isHttpUrl(state.mjCrefImageUrl) ? state.mjCrefImageUrl : '';
      stats.textContent =
        `PAD(URL): ${hasPadUrl ? 1 : 0}  PAD(base64): -` +
        (sref ? `  SREF: ✓` : `  SREF: -`) +
        (cref ? `  CREF: ✓` : `  CREF: -`);
    }
  }

  promptInput.addEventListener('input', () => {
    const p = promptInput.value;
    store.update((s) => ({ ...s, prompt: p }));
  });

  render(store.get());
  store.subscribe(render);
}

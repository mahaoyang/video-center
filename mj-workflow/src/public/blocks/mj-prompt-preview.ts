import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { buildMjPrompt } from '../atoms/mj-prompt';
import { isHttpUrl } from '../atoms/url';

export function createMjPromptPreview(store: Store<WorkflowState>) {
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;

  const preview = document.getElementById('mjPromptPreview') as HTMLElement | null;
  const stats = document.getElementById('mjWrapperStats') as HTMLElement | null;

  function compute(state: WorkflowState): string {
    const basePrompt = (promptInput.value.trim() || (state.prompt || '').trim()).trim();

    const padRef = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
    const padUrl = isHttpUrl(padRef?.cdnUrl) ? padRef?.cdnUrl : isHttpUrl(padRef?.url) ? padRef?.url : undefined;

    const srefRef = state.mjSrefRefId ? state.referenceImages.find((r) => r.id === state.mjSrefRefId) : undefined;
    const crefRef = state.mjCrefRefId ? state.referenceImages.find((r) => r.id === state.mjCrefRefId) : undefined;
    const srefUrl =
      (isHttpUrl(srefRef?.cdnUrl) ? srefRef?.cdnUrl : isHttpUrl(srefRef?.url) ? srefRef?.url : undefined) ||
      (isHttpUrl(state.mjSrefImageUrl) ? state.mjSrefImageUrl : undefined);
    const crefUrl =
      (isHttpUrl(crefRef?.cdnUrl) ? crefRef?.cdnUrl : isHttpUrl(crefRef?.url) ? crefRef?.url : undefined) ||
      (isHttpUrl(state.mjCrefImageUrl) ? state.mjCrefImageUrl : undefined);

    return buildMjPrompt({
      basePrompt,
      padImages: padUrl ? [padUrl] : [],
      srefImageUrl: srefUrl,
      crefImageUrl: crefUrl,
    });
  }

  function render(state: WorkflowState) {
    const text = compute(state);
    if (preview) preview.textContent = text;

    if (stats) {
      const padRef = state.mjPadRefId ? state.referenceImages.find((r) => r.id === state.mjPadRefId) : undefined;
      const hasPadUrl = Boolean(isHttpUrl(padRef?.cdnUrl || padRef?.url));
      const srefRef = state.mjSrefRefId ? state.referenceImages.find((r) => r.id === state.mjSrefRefId) : undefined;
      const crefRef = state.mjCrefRefId ? state.referenceImages.find((r) => r.id === state.mjCrefRefId) : undefined;
      const hasSrefUrl = Boolean(isHttpUrl(srefRef?.cdnUrl || srefRef?.url) || isHttpUrl(state.mjSrefImageUrl));
      const hasCrefUrl = Boolean(isHttpUrl(crefRef?.cdnUrl || crefRef?.url) || isHttpUrl(state.mjCrefImageUrl));
      const hasSrefSelected = Boolean(state.mjSrefRefId || isHttpUrl(state.mjSrefImageUrl));
      const hasCrefSelected = Boolean(state.mjCrefRefId || isHttpUrl(state.mjCrefImageUrl));
      stats.textContent =
        `PAD(URL): ${hasPadUrl ? 1 : 0}  PAD(base64): -` +
        (hasSrefSelected ? `  SREF: ${hasSrefUrl ? '✓' : '…'}` : `  SREF: -`) +
        (hasCrefSelected ? `  CREF: ${hasCrefUrl ? '✓' : '…'}` : `  CREF: -`);
    }
  }

  promptInput.addEventListener('input', () => {
    const p = promptInput.value;
    store.update((s) => ({ ...s, prompt: p }));
  });

  render(store.get());
  store.subscribe(render);
}

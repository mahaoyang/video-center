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

  const preview = document.getElementById('mjPromptPreview') as HTMLTextAreaElement | null;
  const stats = document.getElementById('mjWrapperStats') as HTMLElement | null;

  function compute(state: WorkflowState): string {
    const basePrompt = (promptInput.value.trim() || (state.prompt || '').trim()).trim();

    const selectedRefs = state.referenceImages.filter((r) => state.selectedReferenceIds.includes(r.id));
    const refUrls = selectedRefs.map((r) => r.cdnUrl || r.url).filter(isHttpUrl);

    return buildMjPrompt({
      basePrompt,
      padImages: refUrls,
      srefImageUrl: state.mjSrefImageUrl,
      crefImageUrl: state.mjCrefImageUrl,
    });
  }

  function render(state: WorkflowState) {
    const text = compute(state);
    if (preview) preview.value = text;

    if (stats) {
      const selectedRefs = state.referenceImages.filter((r) => state.selectedReferenceIds.includes(r.id));
      const urlCount = selectedRefs.filter((r) => isHttpUrl(r.cdnUrl || r.url)).length;
      const base64Count = selectedRefs.filter((r) => !isHttpUrl(r.cdnUrl || r.url) && Boolean(r.base64)).length;
      const sref = isHttpUrl(state.mjSrefImageUrl) ? state.mjSrefImageUrl : '';
      const cref = isHttpUrl(state.mjCrefImageUrl) ? state.mjCrefImageUrl : '';
      stats.textContent =
        `PAD(URL): ${urlCount}  PAD(base64): ${base64Count}` +
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

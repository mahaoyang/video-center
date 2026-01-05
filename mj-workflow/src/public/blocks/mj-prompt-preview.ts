import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { buildMjPrompt } from '../atoms/mj-prompt';
import { byId } from '../atoms/ui';
import { showError } from '../atoms/notify';

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

export function createMjPromptPreview(store: Store<WorkflowState>) {
  const promptInput = byId<HTMLTextAreaElement>('promptInput');
  const preview = byId<HTMLTextAreaElement>('mjPromptPreview');
  const copyBtn = document.getElementById('copyMjPromptBtn') as HTMLButtonElement | null;

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
    preview.value = compute(state);
  }

  promptInput.addEventListener('input', () => {
    const p = promptInput.value;
    store.update((s) => ({ ...s, prompt: p }));
  });

  copyBtn?.addEventListener('click', async () => {
    const text = preview.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('clipboard failed:', err);
      showError('复制失败：浏览器不允许访问剪贴板');
    }
  });

  render(store.get());
  store.subscribe(render);
}

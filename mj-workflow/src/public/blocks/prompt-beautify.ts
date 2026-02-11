import type { ApiClient } from '../adapters/api';
import { beautifyPromptBodyZh } from '../adapters/mj-prompt-ai';
import { showError } from '../atoms/notify';
import { byId, hide, setDisabled, show } from '../atoms/ui';

export function createPromptBeautifyBlock(params: { api: ApiClient }) {
  const btn = document.getElementById('promptBeautifyBtn') as HTMLButtonElement | null;
  const popover = document.getElementById('promptBeautifyPopover') as HTMLDivElement | null;
  const hintInput = document.getElementById('promptBeautifyHint') as HTMLInputElement | null;
  const cancel = document.getElementById('promptBeautifyCancel') as HTMLButtonElement | null;
  const apply = document.getElementById('promptBeautifyApply') as HTMLButtonElement | null;
  const spinner = document.getElementById('promptBeautifySpinner') as HTMLDivElement | null;

  if (!btn || !popover || !hintInput || !cancel || !apply || !spinner) return;
  const triggerBtn = btn;
  const popoverEl = popover;
  const hintEl = hintInput;
  const cancelBtn = cancel;
  const applyBtn = apply;
  const spinnerEl = spinner;

  let open = false;

  function setOpen(next: boolean) {
    open = next;
    if (open) {
      show(popoverEl);
      requestAnimationFrame(() => hintEl.focus());
    } else {
      hide(popoverEl);
      hintEl.value = '';
    }
  }

  function setLoading(loading: boolean) {
    if (loading) show(spinnerEl);
    else hide(spinnerEl);
  }

  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open);
  });

  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  });

  async function doBeautify() {
    const promptInput = byId<HTMLTextAreaElement>('promptInput');
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showError('请输入提示词');
      return;
    }

    const hint = hintEl.value.trim();
    setOpen(false);
    setLoading(true);
    setDisabled(triggerBtn, true);
    setDisabled(applyBtn, true);
    setDisabled(cancelBtn, true);
    setDisabled(hintEl, true);
    try {
      try {
        const next = await beautifyPromptBodyZh({ api: params.api, prompt, hint });
        if (next && next.trim()) {
          promptInput.value = next.trim();
          promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (error) {
        showError((error as Error)?.message || '提示词美化失败');
      }
    } finally {
      setDisabled(triggerBtn, false);
      setDisabled(applyBtn, false);
      setDisabled(cancelBtn, false);
      setDisabled(hintEl, false);
      setLoading(false);
    }
  }

  applyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void doBeautify();
  });

  hintEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void doBeautify();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!open) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (popoverEl.contains(target) || triggerBtn.contains(target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') setOpen(false);
  });
}

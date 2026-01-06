import type { ApiClient } from '../adapters/api';
import { beautifyPromptBodyZh } from '../atoms/mj-prompt-ai';
import { createPopoverMenu } from '../atoms/popover-menu';
import { showError } from '../atoms/notify';
import { byId, hide, setDisabled, show } from '../atoms/ui';
import type { Store } from '../state/store';
import type { CommandMode, WorkflowState } from '../state/workflow';

function normalizeSpaces(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function createCommandModeBlock(params: {
  api: ApiClient;
  store: Store<WorkflowState>;
  generate: { generateImage: () => void };
  describe: { deconstructAssets: () => void | Promise<void> };
  pedit: { applyEdit: () => void | Promise<void> };
  video: { setVisible: (visible: boolean) => void; generateVideoFromCurrentPrompt: () => void | Promise<void> };
}) {
  const modeBtn = byId<HTMLElement>('commandModeBtn');
  const modeMenu = byId<HTMLElement>('commandModeMenu');
  const executeBtn = byId<HTMLButtonElement>('step3Next');
  const modeBadge = byId<HTMLElement>('commandModeBadge');

  const extraPanel = byId<HTMLElement>('commandExtraPanel');
  const beautifyPanel = byId<HTMLElement>('commandBeautifyPanel');
  const videoPanel = byId<HTMLElement>('commandVideoPanel');
  const beautifyHint = byId<HTMLInputElement>('commandBeautifyHint');
  const beautifySpinner = byId<HTMLElement>('promptBeautifySpinner');

  const modePopover = createPopoverMenu({ button: modeBtn, menu: modeMenu });

  function readMode(): CommandMode {
    const m = params.store.get().commandMode;
    return m === 'mj' || m === 'video' || m === 'deconstruct' || m === 'pedit' || m === 'beautify' ? m : 'mj';
  }

  function setMode(next: CommandMode) {
    params.store.update((s) => ({ ...s, commandMode: next }));
  }

  function applyModeUi(mode: CommandMode) {
    modeBadge.textContent =
      mode === 'mj' ? 'MJ' : mode === 'video' ? 'VID' : mode === 'deconstruct' ? 'DESC' : mode === 'pedit' ? 'EDIT' : 'POL';
    modeMenu.querySelectorAll<HTMLElement>('button[data-command-mode]').forEach((el) => {
      const v = String((el as any).dataset?.commandMode || '').trim();
      el.classList.toggle('bg-white/5', v === mode);
    });

    // Reset panels
    hide(beautifyPanel);
    hide(videoPanel);
    params.video.setVisible(false);

    if (mode === 'beautify') {
      show(extraPanel);
      show(beautifyPanel);
      hide(videoPanel);
      params.video.setVisible(false);
      requestAnimationFrame(() => beautifyHint.focus());
      return;
    }

    if (mode === 'video') {
      show(extraPanel);
      hide(beautifyPanel);
      show(videoPanel);
      params.video.setVisible(true);
      return;
    }

    hide(extraPanel);
  }

  modeMenu.querySelectorAll<HTMLButtonElement>('button[data-command-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.commandMode || '').trim();
      const next: CommandMode =
        v === 'mj' || v === 'video' || v === 'deconstruct' || v === 'pedit' || v === 'beautify' ? (v as any) : 'mj';
      setMode(next);
      applyModeUi(next);
      modePopover.close();
    });
  });

  let busy = false;
  async function execute() {
    if (busy) return;
    const mode = readMode();

    if (mode === 'beautify') {
      const promptInput = byId<HTMLTextAreaElement>('promptInput');
      const prompt = normalizeSpaces(promptInput.value);
      if (!prompt) {
        showError('请输入提示词');
        return;
      }
    }

    busy = true;
    setDisabled(executeBtn, true);
    try {
      const modeNow = readMode();
      if (modeNow === 'mj') {
        params.generate.generateImage();
        return;
      }
      if (modeNow === 'deconstruct') {
        await params.describe.deconstructAssets();
        return;
      }
      if (modeNow === 'pedit') {
        await params.pedit.applyEdit();
        return;
      }
      if (modeNow === 'video') {
        await params.video.generateVideoFromCurrentPrompt();
        return;
      }
      if (modeNow === 'beautify') {
        const promptInput = byId<HTMLTextAreaElement>('promptInput');
        const prompt = normalizeSpaces(promptInput.value);
        if (!prompt) {
          showError('请输入提示词');
          return;
        }

        const hint = beautifyHint.value.trim();
        show(beautifySpinner);
        const next = await beautifyPromptBodyZh({ api: params.api, prompt, hint });
        if (next && next.trim()) {
          promptInput.value = next.trim();
          promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
    } finally {
      hide(beautifySpinner);
      setDisabled(executeBtn, false);
      busy = false;
    }
  }

  // Initial UI
  applyModeUi(readMode());
  params.store.subscribe((s) => {
    const m = s.commandMode;
    if (m === 'mj' || m === 'video' || m === 'deconstruct' || m === 'pedit' || m === 'beautify') {
      applyModeUi(m);
    }
  });

  return { execute };
}

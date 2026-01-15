import type { ApiClient } from '../adapters/api';
import { beautifyPromptBodyZh } from '../adapters/mj-prompt-ai';
import { createPopoverMenu } from '../atoms/popover-menu';
import { showError, showMessage } from '../atoms/notify';
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
  mv: { cook: (recipe: CommandMode) => void | Promise<void> };
  post: { run: () => void | Promise<void> };
}) {
  const modeBtn = byId<HTMLElement>('commandModeBtn');
  const modeMenu = byId<HTMLElement>('commandModeMenu');
  const modeSearch = document.getElementById('commandModeSearch') as HTMLInputElement | null;
  const modeEmpty = document.getElementById('commandModeEmpty') as HTMLElement | null;
  const executeBtn = byId<HTMLButtonElement>('step3Next');
  const modeBadge = byId<HTMLElement>('commandModeBadge');
  const beautifySpinner = byId<HTMLElement>('promptBeautifySpinner');

  let lastNonBeautifyMode: CommandMode = 'mj';

  function normalizeQuery(q: string): string {
    return normalizeSpaces(q).toLowerCase();
  }

  function applyModeFilter() {
    if (!modeSearch) return;
    const q = normalizeQuery(modeSearch.value);
    const buttons = Array.from(modeMenu.querySelectorAll<HTMLButtonElement>('button[data-command-mode]'));
    let shown = 0;
    for (const btn of buttons) {
      const keywords = String(btn.dataset.commandModeKeywords || '');
      const hay = normalizeQuery(`${btn.textContent || ''} ${keywords}`);
      const ok = !q || hay.includes(q);
      btn.classList.toggle('hidden', !ok);
      if (ok) shown += 1;
    }

    const groups = Array.from(modeMenu.querySelectorAll<HTMLElement>('[data-command-mode-group]'));
    for (const g of groups) {
      const has = Array.from(g.querySelectorAll<HTMLButtonElement>('button[data-command-mode]')).some((b) => !b.classList.contains('hidden'));
      g.classList.toggle('hidden', !has);
    }
    if (modeEmpty) modeEmpty.classList.toggle('hidden', shown > 0);
  }

  const modePopover = createPopoverMenu({
    button: modeBtn,
    menu: modeMenu,
    onOpenChange: (open) => {
      if (!open) return;
      if (modeSearch) {
        modeSearch.value = '';
        applyModeFilter();
        modeSearch.focus();
        try {
          modeSearch.setSelectionRange(modeSearch.value.length, modeSearch.value.length);
        } catch {
          // ignore
        }
      }
    },
  });

  function readMode(): CommandMode {
    const raw = String(params.store.get().commandMode || '').trim();
    // Backward compat: old persisted "mv*" -> "mv-mix"
    if (
      raw === 'mv' ||
      raw === 'mv-assets' ||
      raw === 'mv-settings' ||
      raw === 'mv-subtitles' ||
      raw === 'mv-text' ||
      raw === 'mv-plan' ||
      raw === 'mv-submit' ||
      raw === 'mv-track'
    ) {
      return 'mv-mix';
    }
    if (raw === 'mv-sub-soft' || raw === 'mv-sub-burn') return 'mv-subtitle';
    return raw === 'mj' ||
      raw === 'video' ||
      raw === 'deconstruct' ||
      raw === 'pedit' ||
      raw === 'beautify' ||
      raw === 'post' ||
      raw === 'mv-mix' ||
      raw === 'mv-images' ||
      raw === 'mv-clip' ||
      raw === 'mv-subtitle'
      ? (raw as any)
      : 'mj';
  }

  function setMode(next: CommandMode) {
    params.store.update((s) => ({ ...s, commandMode: next }));
    if (next !== 'beautify') lastNonBeautifyMode = next;
  }

  function applyModeUi(mode: CommandMode) {
    const isMv = String(mode).startsWith('mv');
    modeBadge.textContent =
      mode === 'mj'
        ? 'MJ'
        : mode === 'video'
          ? 'VID'
          : isMv
            ? 'MV'
            : mode === 'deconstruct'
              ? 'DESC'
              : mode === 'pedit'
                ? 'IMG'
                : mode === 'beautify'
                  ? 'POL'
                  : 'POST';
    modeMenu.querySelectorAll<HTMLElement>('button[data-command-mode]').forEach((el) => {
      const v = String((el as any).dataset?.commandMode || '').trim();
      el.classList.toggle('bg-white/5', v === mode);
    });
  }

  modeSearch?.addEventListener('input', () => applyModeFilter());

  modeMenu.querySelectorAll<HTMLButtonElement>('button[data-command-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.commandMode || '').trim();
      const next: CommandMode =
        v === 'mj' ||
        v === 'video' ||
        v === 'deconstruct' ||
        v === 'pedit' ||
        v === 'beautify' ||
        v === 'post' ||
        v === 'mv-mix' ||
        v === 'mv-images' ||
        v === 'mv-clip' ||
        v === 'mv-subtitle'
          ? (v as any)
          : 'mj';
      if (next === 'mv-images' || next === 'mv-clip') {
        params.store.update((s) => ({ ...s, mvAction: 'clip' }));
      } else if (next === 'mv-mix') {
        params.store.update((s) => ({ ...s, mvAction: 'mv' }));
      } else if (next === 'mv-subtitle') {
        params.store.update((s) => ({ ...s, mvAction: 'mv' }));
      }
      setMode(next);
      applyModeUi(next);
      if (modeSearch) {
        modeSearch.value = '';
        applyModeFilter();
      }
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
      if (modeNow === 'mv-mix' || modeNow === 'mv-images' || modeNow === 'mv-clip' || modeNow === 'mv-subtitle') {
        await params.mv.cook(modeNow);
        return;
      }
      if (modeNow === 'post') {
        await params.post.run();
        return;
      }
      if (modeNow === 'beautify') {
        const promptInput = byId<HTMLTextAreaElement>('promptInput');
        const prompt = normalizeSpaces(promptInput.value);
        if (!prompt) {
          showError('请输入提示词');
          return;
        }

        const hint = typeof params.store.get().beautifyHint === 'string' ? params.store.get().beautifyHint!.trim() : '';
        show(beautifySpinner);
        try {
          const next = await beautifyPromptBodyZh({ api: params.api, prompt, hint });
          if (next && next.trim()) {
            const trimmed = next.trim();
            const changed = normalizeSpaces(trimmed) !== normalizeSpaces(prompt);
            promptInput.value = trimmed;
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            showMessage(changed ? '提示词已美化（已更新输入框）' : '提示词已美化（无明显变化）');
          }
        } catch (error) {
          showError((error as Error)?.message || '提示词美化失败');
        }
        // UX: beautify is typically a pre-step; switch back to the last working mode so "send" can continue.
        const back = lastNonBeautifyMode === 'beautify' ? 'mj' : lastNonBeautifyMode;
        setMode(back);
        applyModeUi(back);
        return;
      }
    } finally {
      hide(beautifySpinner);
      setDisabled(executeBtn, false);
      busy = false;
    }
  }

  // Initial UI
  if (String(params.store.get().commandMode || '').startsWith('mv')) setMode(readMode());
  const initialMode = readMode();
  if (initialMode !== 'beautify') lastNonBeautifyMode = initialMode;
  applyModeUi(initialMode);
  applyModeFilter();
  params.store.subscribe((s) => {
    const m = s.commandMode;
    if (
      m === 'mj' ||
      m === 'video' ||
      m === 'deconstruct' ||
      m === 'pedit' ||
      m === 'beautify' ||
      m === 'post' ||
      m === 'mv-mix' ||
      m === 'mv-images' ||
      m === 'mv-clip' ||
      m === 'mv-subtitle' ||
      String(m || '').startsWith('mv')
    ) {
      applyModeUi(readMode());
    }
  });

  return { execute };
}

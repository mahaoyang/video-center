import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { clearAspectRatio, parseMjParams, removeMjParams, setAspectRatio, upsertMjParam } from '../atoms/mj-params';
import { getPreferredMjAspectRatio, setPreferredMjAspectRatio } from '../atoms/mj-preferences';
import { createPopoverMenu } from '../atoms/popover-menu';
import { scrollAreaViewport, setupScrollArea } from '../atoms/scroll-area';

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
  const arBtn = document.getElementById('mjArBtn') as HTMLButtonElement | null;
  const arLabel = document.getElementById('mjArLabel') as HTMLElement | null;
  const arMenu = document.getElementById('mjArMenu') as HTMLElement | null;
  const styleBtn = document.getElementById('mjStyleBtn') as HTMLButtonElement | null;
  const styleLabel = document.getElementById('mjStyleLabel') as HTMLElement | null;
  const styleMenu = document.getElementById('mjStyleMenu') as HTMLElement | null;
  const stylizeBtn = document.getElementById('mjStylizeBtn') as HTMLButtonElement | null;
  const stylizeLabel = document.getElementById('mjStylizeLabel') as HTMLElement | null;
  const stylizeMenu = document.getElementById('mjStylizeMenu') as HTMLElement | null;
  const chaosBtn = document.getElementById('mjChaosBtn') as HTMLButtonElement | null;
  const chaosLabel = document.getElementById('mjChaosLabel') as HTMLElement | null;
  const chaosMenu = document.getElementById('mjChaosMenu') as HTMLElement | null;
  const qualityBtn = document.getElementById('mjQualityBtn') as HTMLButtonElement | null;
  const qualityLabel = document.getElementById('mjQualityLabel') as HTMLElement | null;
  const qualityMenu = document.getElementById('mjQualityMenu') as HTMLElement | null;
  const weirdBtn = document.getElementById('mjWeirdBtn') as HTMLButtonElement | null;
  const weirdLabel = document.getElementById('mjWeirdLabel') as HTMLElement | null;
  const weirdMenu = document.getElementById('mjWeirdMenu') as HTMLElement | null;
  const stopBtn = document.getElementById('mjStopBtn') as HTMLButtonElement | null;
  const stopLabel = document.getElementById('mjStopLabel') as HTMLElement | null;
  const stopMenu = document.getElementById('mjStopMenu') as HTMLElement | null;
  const seedBtn = document.getElementById('mjSeedBtn') as HTMLButtonElement | null;
  const seedLabel = document.getElementById('mjSeedLabel') as HTMLElement | null;
  const seedMenu = document.getElementById('mjSeedMenu') as HTMLElement | null;
  const tileBtn = document.getElementById('mjTileBtn') as HTMLButtonElement | null;
  const arPopover =
    arBtn && arMenu
      ? createPopoverMenu({
          button: arBtn,
          menu: arMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(arMenu);
          },
        })
      : null;
  const stylePopover =
    styleBtn && styleMenu
      ? createPopoverMenu({
          button: styleBtn,
          menu: styleMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(styleMenu);
          },
        })
      : null;
  const stylizePopover =
    stylizeBtn && stylizeMenu
      ? createPopoverMenu({
          button: stylizeBtn,
          menu: stylizeMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(stylizeMenu);
          },
        })
      : null;
  const chaosPopover =
    chaosBtn && chaosMenu
      ? createPopoverMenu({
          button: chaosBtn,
          menu: chaosMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(chaosMenu);
          },
        })
      : null;
  const qualityPopover =
    qualityBtn && qualityMenu
      ? createPopoverMenu({
          button: qualityBtn,
          menu: qualityMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(qualityMenu);
          },
        })
      : null;
  const weirdPopover =
    weirdBtn && weirdMenu
      ? createPopoverMenu({
          button: weirdBtn,
          menu: weirdMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(weirdMenu);
          },
        })
      : null;
  const stopPopover =
    stopBtn && stopMenu
      ? createPopoverMenu({
          button: stopBtn,
          menu: stopMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(stopMenu);
          },
        })
      : null;
  const seedPopover =
    seedBtn && seedMenu
      ? createPopoverMenu({
          button: seedBtn,
          menu: seedMenu,
          onOpenChange: (open) => {
            if (open) setupScrollArea(seedMenu);
          },
        })
      : null;

  const arOptions = ['1:1', '16:9', '9:16', '2:3', '3:2', '4:3', '3:4', '21:9'];

  function applyArToPrompt(ar: string) {
    const next = setAspectRatio(getPromptText(promptInput, store.get()), ar);
    applyToPrompt(promptInput, next);
  }

  function applyParam(name: string, value: string | true) {
    const next = upsertMjParam(getPromptText(promptInput, store.get()), name, value);
    applyToPrompt(promptInput, next);
  }

  function clearParam(name: string) {
    const next = removeMjParams(getPromptText(promptInput, store.get()), [name]);
    applyToPrompt(promptInput, next);
  }

  function buildMenu(params: {
    menu: HTMLElement;
    current: string;
    options: string[];
    onPick: (value: string) => void;
    onClear?: () => void;
  }) {
    const viewport = scrollAreaViewport(params.menu);
    viewport.innerHTML = '';
    for (const opt of params.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === params.current ? 'bg-white/5' : ''}`;
      b.textContent = opt;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.onPick(opt);
      });
      viewport.appendChild(b);
    }
    if (params.onClear) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '使用默认';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.onClear?.();
      });
      viewport.appendChild(clear);
    }
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
    if (arLabel) arLabel.textContent = currentAr || preferredAr;

    if (arMenu) {
      const viewport = scrollAreaViewport(arMenu);
      viewport.innerHTML = '';
      for (const opt of arOptions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === currentAr ? 'bg-white/5' : ''}`;
        b.textContent = opt;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setPreferredMjAspectRatio(opt);
          applyArToPrompt(opt);
          arPopover?.close();
        });
        viewport.appendChild(b);
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '移除 --ar（继续使用偏好）';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = clearAspectRatio(getPromptText(promptInput, store.get()));
        applyToPrompt(promptInput, next);
        arPopover?.close();
      });
      viewport.appendChild(clear);
    }

    const style = typeof parsed.map['style'] === 'string' ? String(parsed.map['style']).trim() : '';
    if (styleLabel) styleLabel.textContent = `Style ${style || '默认'}`;
    if (styleMenu) {
      buildMenu({
        menu: styleMenu,
        current: style,
        options: ['raw'],
        onPick: (v) => {
          applyParam('style', v);
          stylePopover?.close();
        },
        onClear: () => {
          clearParam('style');
          stylePopover?.close();
        },
      });
    }

    const stylize = typeof parsed.map['stylize'] === 'string' ? String(parsed.map['stylize']).trim() : '';
    if (stylizeLabel) stylizeLabel.textContent = `Stylize ${stylize || '默认'}`;
    if (stylizeMenu) {
      buildMenu({
        menu: stylizeMenu,
        current: stylize,
        options: ['0', '50', '100', '250', '500', '750', '1000'],
        onPick: (v) => {
          applyParam('stylize', v);
          stylizePopover?.close();
        },
        onClear: () => {
          clearParam('stylize');
          stylizePopover?.close();
        },
      });
    }

    const chaos = typeof parsed.map['chaos'] === 'string' ? String(parsed.map['chaos']).trim() : '';
    if (chaosLabel) chaosLabel.textContent = `Chaos ${chaos || '默认'}`;
    if (chaosMenu) {
      buildMenu({
        menu: chaosMenu,
        current: chaos,
        options: ['0', '5', '10', '20', '30', '50', '60', '80', '100'],
        onPick: (v) => {
          applyParam('chaos', v);
          chaosPopover?.close();
        },
        onClear: () => {
          clearParam('chaos');
          chaosPopover?.close();
        },
      });
    }

    const quality = typeof parsed.map['quality'] === 'string' ? String(parsed.map['quality']).trim() : '';
    if (qualityLabel) qualityLabel.textContent = `Quality ${quality || '默认'}`;
    if (qualityMenu) {
      buildMenu({
        menu: qualityMenu,
        current: quality,
        options: ['0.25', '0.5', '1', '2'],
        onPick: (v) => {
          applyParam('quality', v);
          qualityPopover?.close();
        },
        onClear: () => {
          clearParam('quality');
          qualityPopover?.close();
        },
      });
    }

    const weird = typeof parsed.map['weird'] === 'string' ? String(parsed.map['weird']).trim() : '';
    if (weirdLabel) weirdLabel.textContent = `Weird ${weird || '默认'}`;
    if (weirdMenu) {
      buildMenu({
        menu: weirdMenu,
        current: weird,
        options: ['0', '50', '100', '250', '500', '750', '1000'],
        onPick: (v) => {
          applyParam('weird', v);
          weirdPopover?.close();
        },
        onClear: () => {
          clearParam('weird');
          weirdPopover?.close();
        },
      });
    }

    const stop = typeof parsed.map['stop'] === 'string' ? String(parsed.map['stop']).trim() : '';
    if (stopLabel) stopLabel.textContent = `Stop ${stop || '默认'}`;
    if (stopMenu) {
      buildMenu({
        menu: stopMenu,
        current: stop,
        options: ['10', '25', '50', '75', '90', '100'],
        onPick: (v) => {
          applyParam('stop', v);
          stopPopover?.close();
        },
        onClear: () => {
          clearParam('stop');
          stopPopover?.close();
        },
      });
    }

    const seed = typeof parsed.map['seed'] === 'string' ? String(parsed.map['seed']).trim() : '';
    if (seedLabel) seedLabel.textContent = `Seed ${seed || '随机'}`;
    if (seedMenu) {
      const viewport = scrollAreaViewport(seedMenu);
      viewport.innerHTML = '';
      const rand = document.createElement('button');
      rand.type = 'button';
      rand.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
      rand.textContent = '随机 Seed';
      rand.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextSeed = String(Math.floor(Math.random() * 4_000_000_000));
        applyParam('seed', nextSeed);
        seedPopover?.close();
      });
      viewport.appendChild(rand);
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '清除 Seed';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearParam('seed');
        seedPopover?.close();
      });
      viewport.appendChild(clear);
    }

    if (tileBtn) {
      const on = Boolean(parsed.map['tile']);
      tileBtn.classList.toggle('bg-studio-accent', on);
      tileBtn.classList.toggle('text-studio-bg', on);
      tileBtn.classList.toggle('border-studio-accent/40', on);
    }

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

  clearArBtn?.addEventListener('click', () => {
    const next = clearAspectRatio(getPromptText(promptInput, store.get()));
    applyToPrompt(promptInput, next);
    // Reset to default ratio (and keep a stable preference for gemini/generation).
    const fallback = '1:1';
    setPreferredMjAspectRatio(fallback);
    if (arCurrent) arCurrent.textContent = `--ar ${fallback}`;
    if (arLabel) arLabel.textContent = fallback;
    applyArToPrompt(fallback);
  });

  tileBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = getPromptText(promptInput, store.get());
    const parsed = parseMjParams(current);
    const on = Boolean(parsed.map['tile']);
    const next = on ? removeMjParams(current, ['tile']) : upsertMjParam(current, 'tile', true);
    applyToPrompt(promptInput, next);
  });

  render(store.get());
  store.subscribe(render);
}

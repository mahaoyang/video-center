import type { Store } from '../state/store';
import type { CommandMode, WorkflowState } from '../state/workflow';
import { byId } from '../atoms/ui';
import { createPopoverMenu } from '../atoms/popover-menu';
import { clearAspectRatio, parseMjParams, removeMjParams, setAspectRatio, upsertMjParam } from '../atoms/mj-params';
import { getPreferredMjAspectRatio, setPreferredMjAspectRatio } from '../atoms/mj-preferences';
import { scrollAreaViewport, setupScrollArea } from '../atoms/scroll-area';
import { setTraceOpen } from '../atoms/overlays';
import { showError } from '../atoms/notify';
import { readSelectedReferenceIds } from '../state/material';

function readMode(state: WorkflowState): CommandMode {
  const m = state.commandMode;
  if (typeof m === 'string' && m.startsWith('mv')) return 'mv';
  return m === 'mj' || m === 'suno' || m === 'youtube' || m === 'video' || m === 'deconstruct' || m === 'pedit' || m === 'beautify' || m === 'post' ? m : 'mj';
}

function getPromptInput(): HTMLTextAreaElement | null {
  return document.getElementById('promptInput') as HTMLTextAreaElement | null;
}

function applyToPrompt(promptInput: HTMLTextAreaElement, next: string) {
  promptInput.value = next;
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function promptText(state: WorkflowState, promptInput: HTMLTextAreaElement | null): string {
  const v = promptInput?.value;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof state.prompt === 'string' && state.prompt.trim()) return state.prompt.trim();
  return '';
}

function prettyVideoModel(model: string): string {
  const m = String(model || '').trim();
  if (!m) return '默认';
  if (m === 'jimeng-video-3.0') return 'Jimeng 3.0';
  if (m === 'kling-v2-6') return 'Kling 2.6';
  if (m === 'veo-3.0-fast-generate-001') return 'Veo 3 Fast';
  if (m === 'veo-3.0-generate-001') return 'Veo 3';
  if (m === 'veo-3.1-fast-generate-preview') return 'Veo 3.1 Fast';
  if (m === 'veo-3.1-generate-preview') return 'Veo 3.1';
  return m.length > 22 ? `${m.slice(0, 10)}…${m.slice(-6)}` : m;
}

function mkBtn(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-[0.18em] text-white/70 hover:border-studio-accent/40 hover:text-white transition-all flex items-center gap-2';
  btn.textContent = label;
  return btn;
}

function mkSegBtn(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-[0.16em] text-white/70 hover:border-studio-accent/40 hover:text-white transition-all';
  btn.textContent = label;
  return btn;
}

function mkIconBtn(title: string, iconClass: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = title;
  btn.className =
    'w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:border-studio-accent/40 hover:text-white transition-all flex items-center justify-center';
  btn.innerHTML = `<i class="${iconClass} text-[10px]"></i>`;
  return btn;
}

function mkMenu(): HTMLDivElement {
  const menu = document.createElement('div');
  menu.className =
    'command-footer-menu hidden fixed max-h-80 rounded-2xl bg-black/85 border border-white/10 backdrop-blur-xl shadow-2xl z-[500] rt-ScrollAreaRoot';

  const viewport = document.createElement('div');
  viewport.className = 'rt-ScrollAreaViewport max-h-80 overflow-auto';
  const content = document.createElement('div');
  content.className = 'rt-ScrollAreaContent';
  viewport.appendChild(content);
  menu.appendChild(viewport);

  const vbar = document.createElement('div');
  vbar.className = 'rt-ScrollAreaScrollbar rt-r-size-1';
  vbar.dataset.orientation = 'vertical';
  const vthumb = document.createElement('div');
  vthumb.className = 'rt-ScrollAreaThumb';
  vbar.appendChild(vthumb);
  menu.appendChild(vbar);
  return menu;
}

export function createCommandFooterControls(store: Store<WorkflowState>) {
  const root = byId<HTMLElement>('commandFooterChips');
  root.innerHTML = '';
  root.classList.add('relative');
  root.classList.add('flex', 'items-center', 'gap-2', 'justify-between', 'flex-nowrap');
  root.classList.remove('justify-end');
  root.classList.remove('overflow-x-auto', 'scrollbar-hide');

  const modeLabel = document.createElement('div');
  modeLabel.className =
    'px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-[0.2em] text-white/55 hidden flex-shrink-0';
  modeLabel.textContent = 'MV';

  const chips = document.createElement('div');
  chips.className = 'flex items-center gap-2 flex-nowrap justify-end overflow-x-auto scrollbar-hide';

  root.appendChild(modeLabel);
  root.appendChild(chips);

  function positionFooterMenu(button: HTMLElement, menu: HTMLElement) {
    const gap = 8;
    const br = button.getBoundingClientRect();

    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.maxHeight = '320px';

    const mr = menu.getBoundingClientRect();

    const aboveTop = br.top - mr.height - gap;
    const belowTop = br.bottom + gap;
    const top = aboveTop >= gap ? aboveTop : belowTop;

    let left = br.left;
    const maxLeft = window.innerWidth - mr.width - gap;
    if (left > maxLeft) left = maxLeft;
    if (left < gap) left = gap;

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function createFooterPopover(params: { button: HTMLElement; menu: HTMLElement }) {
    const originalParent = params.menu.parentElement;
    const originalNextSibling = params.menu.nextSibling;

    const restoreMenu = () => {
      if (!originalParent) return;
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(params.menu, originalNextSibling);
      } else {
        originalParent.appendChild(params.menu);
      }
    };

    const popover = createPopoverMenu({
      button: params.button,
      menu: params.menu,
      onOpenChange: (open) => {
        if (open) {
          // NOTE: `#commandHub` uses transforms; a `position: fixed` child will be positioned relative to
          // that transformed ancestor. Portal the menu to `document.body` to ensure viewport positioning.
          if (params.menu.parentElement !== document.body) document.body.appendChild(params.menu);
          positionFooterMenu(params.button, params.menu);
          setupScrollArea(params.menu);
          return;
        }

        restoreMenu();
      },
    });

    const onLayout = () => {
      if (!popover.open) return;
      positionFooterMenu(params.button, params.menu);
    };
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);

    return popover;
  }

  const mj = document.createElement('div');
  mj.className = 'flex items-center gap-2 flex-nowrap';

  const suno = document.createElement('div');
  suno.className = 'flex items-center gap-2 flex-nowrap hidden';

  const pedit = document.createElement('div');
  pedit.className = 'flex items-center gap-2 flex-nowrap hidden';

  const video = document.createElement('div');
  video.className = 'flex items-center gap-2 flex-nowrap hidden';

  const post = document.createElement('div');
  post.className = 'flex items-center gap-2 flex-nowrap hidden';

  const mv = document.createElement('div');
  mv.className = 'flex items-center gap-2 flex-nowrap hidden';

  // --- MV controls (ffmpeg compose)
  const mvHeadBtn = mkBtn('HEAD');
  const mvTraceBtn = mkIconBtn('选择分支（Trace）', 'fas fa-sitemap');

  const mvResWrap = document.createElement('div');
  mvResWrap.className = 'relative';
  const mvResBtn = mkBtn('Res');
  const mvResMenu = mkMenu();
  mvResWrap.appendChild(mvResBtn);
  mvResWrap.appendChild(mvResMenu);
  const mvResPopover = createFooterPopover({ button: mvResBtn, menu: mvResMenu });

  const mvFpsWrap = document.createElement('div');
  mvFpsWrap.className = 'relative';
  const mvFpsBtn = mkBtn('FPS');
  const mvFpsMenu = mkMenu();
  mvFpsWrap.appendChild(mvFpsBtn);
  mvFpsWrap.appendChild(mvFpsMenu);
  const mvFpsPopover = createFooterPopover({ button: mvFpsBtn, menu: mvFpsMenu });

  const mvDurWrap = document.createElement('div');
  mvDurWrap.className = 'relative';
  const mvDurBtn = mkBtn('Dur');
  const mvDurMenu = mkMenu();
  mvDurWrap.appendChild(mvDurBtn);
  mvDurWrap.appendChild(mvDurMenu);
  const mvDurPopover = createFooterPopover({ button: mvDurBtn, menu: mvDurMenu });

  const mvSubWrap = document.createElement('div');
  mvSubWrap.className = 'relative';
  const mvSubBtn = mkBtn('Sub');
  const mvSubMenu = mkMenu();
  mvSubWrap.appendChild(mvSubBtn);
  mvSubWrap.appendChild(mvSubMenu);
  const mvSubPopover = createFooterPopover({ button: mvSubBtn, menu: mvSubMenu });

  mv.appendChild(mvHeadBtn);
  mv.appendChild(mvTraceBtn);
  mv.appendChild(mvResWrap);
  mv.appendChild(mvFpsWrap);
  mv.appendChild(mvDurWrap);
  mv.appendChild(mvSubWrap);

  function shortId(id: string): string {
    const s = String(id || '').trim();
    if (!s) return '-';
    if (s.length <= 14) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }

  function prettyResolution(value: string): string {
    const v = String(value || '').trim();
    if (!v || v === 'source') return 'Source';
    if (v === '1280x720') return '720P';
    if (v === '1920x1080') return '1080P';
    return v;
  }

  function prettySubtitleMode(value: string): string {
    return value === 'burn' ? 'Burn' : 'Soft';
  }

  mvHeadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const st = store.get();
    const head = typeof st.traceHeadMessageId === 'string' ? st.traceHeadMessageId.trim() : '';
    if (!head) return showError('当前没有 HEAD');
    store.update((s) => ({ ...s, traceTarget: { type: 'message', id: head }, traceReturnTo: undefined }));
    setTraceOpen(true);
  });

  mvTraceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const st = store.get();
    const head = typeof st.traceHeadMessageId === 'string' ? st.traceHeadMessageId.trim() : '';
    const fallback = (st.streamMessages || []).filter((m) => m.role === 'ai').at(-1)?.id || '';
    const targetId = head || fallback;
    if (!targetId) return showError('暂无可追踪记录');
    store.update((s) => ({ ...s, traceTarget: { type: 'message', id: targetId }, traceReturnTo: undefined }));
    setTraceOpen(true);
  });

  const beautify = document.createElement('div');
  beautify.className = 'flex items-center gap-2 flex-nowrap hidden';

  // --- SUNO controls
  const sunoModeWrap = document.createElement('div');
  sunoModeWrap.className = 'relative';
  const sunoModeBtn = mkBtn('Mode');
  const sunoModeMenu = mkMenu();
  sunoModeWrap.appendChild(sunoModeBtn);
  sunoModeWrap.appendChild(sunoModeMenu);
  const sunoModePopover = createFooterPopover({ button: sunoModeBtn, menu: sunoModeMenu });

  const sunoLangWrap = document.createElement('div');
  sunoLangWrap.className = 'relative';
  const sunoLangBtn = mkBtn('Lang');
  const sunoLangMenu = mkMenu();
  sunoLangWrap.appendChild(sunoLangBtn);
  sunoLangWrap.appendChild(sunoLangMenu);
  const sunoLangPopover = createFooterPopover({ button: sunoLangBtn, menu: sunoLangMenu });

  suno.appendChild(sunoModeWrap);
  suno.appendChild(sunoLangWrap);

  const deconstruct = document.createElement('div');
  deconstruct.className = 'flex items-center gap-2 flex-nowrap hidden';

  // --- MJ controls: single-choice params use dropdowns
  const mjArWrap = document.createElement('div');
  mjArWrap.className = 'relative';
  const mjArBtn = mkBtn('AR');
  const mjArMenu = mkMenu();
  mjArWrap.appendChild(mjArBtn);
  mjArWrap.appendChild(mjArMenu);
  const mjArPopover = createFooterPopover({ button: mjArBtn, menu: mjArMenu });
  const mjMoreWrap = document.createElement('div');
  mjMoreWrap.className = 'relative';
  const mjMoreBtn = mkBtn('更多');
  const mjMoreMenu = mkMenu();
  mjMoreWrap.appendChild(mjMoreBtn);
  mjMoreWrap.appendChild(mjMoreMenu);
  const mjMorePopover = createFooterPopover({ button: mjMoreBtn, menu: mjMoreMenu });

  const mjParamsWrap = document.createElement('div');
  mjParamsWrap.className = 'relative';
  const mjParamsBtn = mkBtn('参数');
  const mjParamsMenu = mkMenu();
  mjParamsWrap.appendChild(mjParamsBtn);
  mjParamsWrap.appendChild(mjParamsMenu);
  const mjParamsPopover = createFooterPopover({ button: mjParamsBtn, menu: mjParamsMenu });

  const mjStyleWrap = document.createElement('div');
  mjStyleWrap.className = 'relative';
  const mjStyleBtn = mkBtn('Style');
  const mjStyleMenu = mkMenu();
  mjStyleWrap.appendChild(mjStyleBtn);
  mjStyleWrap.appendChild(mjStyleMenu);
  const mjStylePopover = createFooterPopover({ button: mjStyleBtn, menu: mjStyleMenu });

  const mjStylizeWrap = document.createElement('div');
  mjStylizeWrap.className = 'relative';
  const mjStylizeBtn = mkBtn('Stylize');
  const mjStylizeMenu = mkMenu();
  mjStylizeWrap.appendChild(mjStylizeBtn);
  mjStylizeWrap.appendChild(mjStylizeMenu);
  const mjStylizePopover = createFooterPopover({ button: mjStylizeBtn, menu: mjStylizeMenu });

  const mjChaosWrap = document.createElement('div');
  mjChaosWrap.className = 'relative';
  const mjChaosBtn = mkBtn('Chaos');
  const mjChaosMenu = mkMenu();
  mjChaosWrap.appendChild(mjChaosBtn);
  mjChaosWrap.appendChild(mjChaosMenu);
  const mjChaosPopover = createFooterPopover({ button: mjChaosBtn, menu: mjChaosMenu });

  const mjQualityWrap = document.createElement('div');
  mjQualityWrap.className = 'relative';
  const mjQualityBtn = mkBtn('Quality');
  const mjQualityMenu = mkMenu();
  mjQualityWrap.appendChild(mjQualityBtn);
  mjQualityWrap.appendChild(mjQualityMenu);
  const mjQualityPopover = createFooterPopover({ button: mjQualityBtn, menu: mjQualityMenu });

  const mjWeirdWrap = document.createElement('div');
  mjWeirdWrap.className = 'relative';
  const mjWeirdBtn = mkBtn('Weird');
  const mjWeirdMenu = mkMenu();
  mjWeirdWrap.appendChild(mjWeirdBtn);
  mjWeirdWrap.appendChild(mjWeirdMenu);
  const mjWeirdPopover = createFooterPopover({ button: mjWeirdBtn, menu: mjWeirdMenu });

  const mjStopWrap = document.createElement('div');
  mjStopWrap.className = 'relative';
  const mjStopBtn = mkBtn('Stop');
  const mjStopMenu = mkMenu();
  mjStopWrap.appendChild(mjStopBtn);
  mjStopWrap.appendChild(mjStopMenu);
  const mjStopPopover = createFooterPopover({ button: mjStopBtn, menu: mjStopMenu });

  const mjSeedWrap = document.createElement('div');
  mjSeedWrap.className = 'relative';
  const mjSeedBtn = mkBtn('Seed');
  const mjSeedMenu = mkMenu();
  mjSeedWrap.appendChild(mjSeedBtn);
  mjSeedWrap.appendChild(mjSeedMenu);
  const mjSeedPopover = createFooterPopover({ button: mjSeedBtn, menu: mjSeedMenu });

  const mjTileBtn = mkSegBtn('TILE');

  const mjClearBtn = mkIconBtn('清空参数', 'fas fa-trash');

  function buildSingleSelectMenu(params: {
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

  mj.appendChild(mjArWrap);
  mj.appendChild(mjStyleWrap);
  mj.appendChild(mjStylizeWrap);
  mj.appendChild(mjChaosWrap);
  mj.appendChild(mjQualityWrap);
  mj.appendChild(mjWeirdWrap);
  mj.appendChild(mjStopWrap);
  mj.appendChild(mjSeedWrap);
  mj.appendChild(mjTileBtn);
  mj.appendChild(mjMoreWrap);
  mj.appendChild(mjParamsWrap);
  mj.appendChild(mjClearBtn);

  function renderMj(state: WorkflowState) {
    const promptInput = getPromptInput();
    const prompt = promptText(state, promptInput);
    const parsed = parseMjParams(prompt);

    const preferredAr = getPreferredMjAspectRatio() || '1:1';
    const ar = (typeof parsed.map['ar'] === 'string' ? parsed.map['ar'] : undefined) || preferredAr;
    const arOptions = ['1:1', '16:9', '9:16', '2:3', '3:2', '4:3', '3:4', '21:9'];
    mjArBtn.textContent = `AR ${ar}`;
    const mjArViewport = scrollAreaViewport(mjArMenu);
    mjArViewport.innerHTML = '';
    for (const opt of arOptions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === ar ? 'bg-white/5' : ''}`;
      b.textContent = opt;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setPreferredMjAspectRatio(opt);
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, setAspectRatio(promptText(store.get(), input), opt));
        mjArPopover.close();
      });
      mjArViewport.appendChild(b);
    }
    const clearAr = document.createElement('button');
    clearAr.type = 'button';
    clearAr.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
    clearAr.textContent = '移除 --ar（继续使用偏好）';
    clearAr.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = getPromptInput();
      if (!input) return;
      applyToPrompt(input, clearAspectRatio(promptText(store.get(), input)));
      mjArPopover.close();
    });
    mjArViewport.appendChild(clearAr);

    const mjMoreViewport = scrollAreaViewport(mjMoreMenu);
    mjMoreViewport.innerHTML = '';
    const section = (title: string) => {
      const h = document.createElement('div');
      h.className = 'px-4 py-2 text-[9px] font-black uppercase tracking-[0.25em] opacity-40 border-b border-white/10';
      h.textContent = title;
      mjMoreViewport.appendChild(h);
    };

    section('Aspect Ratio');
    for (const opt of arOptions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === ar ? 'bg-white/5' : ''}`;
      b.textContent = opt;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setPreferredMjAspectRatio(opt);
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, setAspectRatio(promptText(store.get(), input), opt));
        mjMorePopover.close();
      });
      mjMoreViewport.appendChild(b);
    }

    section('Quick Params');
    const quickParams: Array<{ label: string; name: string; value: string | true }> = [
      { label: '--style raw', name: 'style', value: 'raw' },
      { label: '--stylize 250', name: 'stylize', value: '250' },
      { label: '--stylize 500', name: 'stylize', value: '500' },
      { label: '--stylize 750', name: 'stylize', value: '750' },
      { label: '--stylize 1000', name: 'stylize', value: '1000' },
      { label: '--chaos 0', name: 'chaos', value: '0' },
      { label: '--chaos 10', name: 'chaos', value: '10' },
      { label: '--chaos 30', name: 'chaos', value: '30' },
      { label: '--chaos 60', name: 'chaos', value: '60' },
      { label: '--chaos 100', name: 'chaos', value: '100' },
      { label: '--quality 0.5', name: 'quality', value: '0.5' },
      { label: '--quality 1', name: 'quality', value: '1' },
      { label: '--quality 2', name: 'quality', value: '2' },
      { label: '--weird 250', name: 'weird', value: '250' },
      { label: '--weird 750', name: 'weird', value: '750' },
      { label: '--stop 75', name: 'stop', value: '75' },
      { label: '--stop 90', name: 'stop', value: '90' },
      { label: '--tile', name: 'tile', value: true },
    ];
    for (const qp of quickParams) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
      b.textContent = qp.label;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), qp.name, qp.value));
        mjMorePopover.close();
      });
      mjMoreViewport.appendChild(b);
    }

    const filtered = parsed.params.filter((p) => p.name !== 'ar' && p.name !== 'aspect');
    mjParamsBtn.textContent = filtered.length ? `参数 ${filtered.length}` : '参数';

    // --- Dropdown single-choice parameters
    const style = typeof parsed.map['style'] === 'string' ? String(parsed.map['style']).trim() : '';
    mjStyleBtn.textContent = `Style ${style || '默认'}`;
    buildSingleSelectMenu({
      menu: mjStyleMenu,
      current: style,
      options: ['raw'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'style', v));
        mjStylePopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['style']));
        mjStylePopover.close();
      },
    });

    const stylize = typeof parsed.map['stylize'] === 'string' ? String(parsed.map['stylize']).trim() : '';
    mjStylizeBtn.textContent = `Stylize ${stylize || '默认'}`;
    buildSingleSelectMenu({
      menu: mjStylizeMenu,
      current: stylize,
      options: ['0', '50', '100', '250', '500', '750', '1000'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'stylize', v));
        mjStylizePopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['stylize']));
        mjStylizePopover.close();
      },
    });

    const chaos = typeof parsed.map['chaos'] === 'string' ? String(parsed.map['chaos']).trim() : '';
    mjChaosBtn.textContent = `Chaos ${chaos || '默认'}`;
    buildSingleSelectMenu({
      menu: mjChaosMenu,
      current: chaos,
      options: ['0', '5', '10', '20', '30', '50', '60', '80', '100'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'chaos', v));
        mjChaosPopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['chaos']));
        mjChaosPopover.close();
      },
    });

    const quality = typeof parsed.map['quality'] === 'string' ? String(parsed.map['quality']).trim() : '';
    mjQualityBtn.textContent = `Quality ${quality || '默认'}`;
    buildSingleSelectMenu({
      menu: mjQualityMenu,
      current: quality,
      options: ['0.25', '0.5', '1', '2'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'quality', v));
        mjQualityPopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['quality']));
        mjQualityPopover.close();
      },
    });

    const weird = typeof parsed.map['weird'] === 'string' ? String(parsed.map['weird']).trim() : '';
    mjWeirdBtn.textContent = `Weird ${weird || '默认'}`;
    buildSingleSelectMenu({
      menu: mjWeirdMenu,
      current: weird,
      options: ['0', '50', '100', '250', '500', '750', '1000'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'weird', v));
        mjWeirdPopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['weird']));
        mjWeirdPopover.close();
      },
    });

    const stop = typeof parsed.map['stop'] === 'string' ? String(parsed.map['stop']).trim() : '';
    mjStopBtn.textContent = `Stop ${stop || '默认'}`;
    buildSingleSelectMenu({
      menu: mjStopMenu,
      current: stop,
      options: ['10', '25', '50', '75', '90', '100'],
      onPick: (v) => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'stop', v));
        mjStopPopover.close();
      },
      onClear: () => {
        const input = getPromptInput();
        if (!input) return;
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['stop']));
        mjStopPopover.close();
      },
    });

    const seed = typeof parsed.map['seed'] === 'string' ? String(parsed.map['seed']).trim() : '';
    mjSeedBtn.textContent = `Seed ${seed || '随机'}`;
    const mjSeedViewport = scrollAreaViewport(mjSeedMenu);
    mjSeedViewport.innerHTML = '';
    const seedRand = document.createElement('button');
    seedRand.type = 'button';
    seedRand.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
    seedRand.textContent = '随机 Seed';
    seedRand.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = getPromptInput();
      if (!input) return;
      const nextSeed = String(Math.floor(Math.random() * 4_000_000_000));
      applyToPrompt(input, upsertMjParam(promptText(store.get(), input), 'seed', nextSeed));
      mjSeedPopover.close();
    });
    mjSeedViewport.appendChild(seedRand);
    const seedClear = document.createElement('button');
    seedClear.type = 'button';
    seedClear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
    seedClear.textContent = '清除 Seed';
    seedClear.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = getPromptInput();
      if (!input) return;
      applyToPrompt(input, removeMjParams(promptText(store.get(), input), ['seed']));
      mjSeedPopover.close();
    });
    mjSeedViewport.appendChild(seedClear);

    const tileOn = Boolean(parsed.map['tile']);
    mjTileBtn.classList.toggle('bg-studio-accent', tileOn);
    mjTileBtn.classList.toggle('text-studio-bg', tileOn);
    mjTileBtn.classList.toggle('border-studio-accent/40', tileOn);

    const mjParamsViewport = scrollAreaViewport(mjParamsMenu);
    mjParamsViewport.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'px-4 py-4 text-[10px] font-mono opacity-40';
      empty.textContent = '当前提示词没有可移除的参数';
      mjParamsViewport.appendChild(empty);
    } else {
      const clearAll = document.createElement('button');
      clearAll.type = 'button';
      clearAll.className =
        'w-full px-4 py-3 text-left text-[12px] hover:bg-red-500/20 hover:text-red-200 transition-all border-b border-white/10';
      clearAll.textContent = '清空全部参数（保留 AR）';
      clearAll.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = getPromptInput();
        if (!input) return;
        const names = Array.from(new Set(filtered.map((p) => p.name)));
        applyToPrompt(input, removeMjParams(promptText(store.get(), input), names));
        mjParamsPopover.close();
      });
      mjParamsViewport.appendChild(clearAll);

      for (const p of filtered) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all flex items-center justify-between gap-4';
        b.innerHTML = `<span class="truncate">--${p.name}${p.value === true ? '' : ` ${p.value}`}</span><span class="opacity-40">×</span>`;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const input = getPromptInput();
          if (!input) return;
          applyToPrompt(input, removeMjParams(promptText(store.get(), input), [p.name]));
        });
        mjParamsViewport.appendChild(b);
      }
    }
  }

  mjClearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = getPromptInput();
    if (!input) return;
    const current = promptText(store.get(), input);
    const parsed = parseMjParams(current);
    const names = Array.from(new Set(parsed.params.map((p) => p.name))).filter((n) => n !== 'ar' && n !== 'aspect');
    let next = current;
    if (names.length) next = removeMjParams(next, names);
    next = clearAspectRatio(next);
    applyToPrompt(input, next);
  });

  mjTileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = getPromptInput();
    if (!input) return;
    const current = promptText(store.get(), input);
    const parsed = parseMjParams(current);
    const on = Boolean(parsed.map['tile']);
    const next = on ? removeMjParams(current, ['tile']) : upsertMjParam(current, 'tile', true);
    applyToPrompt(input, next);
  });

  // --- PEDIT controls: single-choice params use dropdowns
  const peditArWrap = document.createElement('div');
  peditArWrap.className = 'relative';
  const peditArBtn = mkBtn('AR');
  const peditArMenu = mkMenu();
  peditArWrap.appendChild(peditArBtn);
  peditArWrap.appendChild(peditArMenu);
  const peditArPopover = createFooterPopover({ button: peditArBtn, menu: peditArMenu });

  const peditSizeWrap = document.createElement('div');
  peditSizeWrap.className = 'relative';
  const peditSizeBtn = mkBtn('Size');
  const peditSizeMenu = mkMenu();
  peditSizeWrap.appendChild(peditSizeBtn);
  peditSizeWrap.appendChild(peditSizeMenu);
  const peditSizePopover = createFooterPopover({ button: peditSizeBtn, menu: peditSizeMenu });
  const peditClearSelected = mkIconBtn('清空参考图选择', 'fas fa-ban');
  peditClearSelected.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    store.update((s) => ({ ...s, selectedReferenceIds: [] }));
  });

  pedit.appendChild(peditArWrap);
  pedit.appendChild(peditSizeWrap);
  pedit.appendChild(peditClearSelected);

  function renderPedit(state: WorkflowState) {
    const ar = typeof state.gimageAspect === 'string' && state.gimageAspect.trim() ? state.gimageAspect.trim() : '16:9';
    const size = typeof state.gimageSize === 'string' && state.gimageSize.trim() ? state.gimageSize.trim() : '2K';
    peditArBtn.textContent = `AR ${ar}`;
    buildSingleSelectMenu({
      menu: peditArMenu,
      current: ar,
      options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
      onPick: (v) => {
        store.update((s) => ({ ...s, gimageAspect: v }));
        peditArPopover.close();
      },
      onClear: () => {
        store.update((s) => ({ ...s, gimageAspect: undefined }));
        peditArPopover.close();
      },
    });

    peditSizeBtn.textContent = `Size ${size}`;
    buildSingleSelectMenu({
      menu: peditSizeMenu,
      current: size,
      options: ['1K', '2K', '4K'],
      onPick: (v) => {
        store.update((s) => ({ ...s, gimageSize: v }));
        peditSizePopover.close();
      },
      onClear: () => {
        store.update((s) => ({ ...s, gimageSize: undefined }));
        peditSizePopover.close();
      },
    });
  }

  // --- VIDEO controls: single-choice params use dropdowns
  const videoProviderWrap = document.createElement('div');
  videoProviderWrap.className = 'relative';
  const videoProviderBtn = mkBtn('Provider');
  const videoProviderMenu = mkMenu();
  videoProviderWrap.appendChild(videoProviderBtn);
  videoProviderWrap.appendChild(videoProviderMenu);
  const videoProviderPopover = createFooterPopover({ button: videoProviderBtn, menu: videoProviderMenu });

  const videoModelWrap = document.createElement('div');
  videoModelWrap.className = 'relative';
  const videoModelBtn = mkBtn('Model');
  const videoModelMenu = mkMenu();
  videoModelWrap.appendChild(videoModelBtn);
  videoModelWrap.appendChild(videoModelMenu);
  const videoModelPopover = createFooterPopover({ button: videoModelBtn, menu: videoModelMenu });

  const videoModeWrap = document.createElement('div');
  videoModeWrap.className = 'relative';
  const videoModeBtn = mkBtn('Mode');
  const videoModeMenu = mkMenu();
  videoModeWrap.appendChild(videoModeBtn);
  videoModeWrap.appendChild(videoModeMenu);
  const videoModePopover = createFooterPopover({ button: videoModeBtn, menu: videoModeMenu });

  const videoSecondsWrap = document.createElement('div');
  videoSecondsWrap.className = 'relative';
  const videoSecondsBtn = mkBtn('时长');
  const videoSecondsMenu = mkMenu();
  videoSecondsWrap.appendChild(videoSecondsBtn);
  videoSecondsWrap.appendChild(videoSecondsMenu);
  const videoSecondsPopover = createFooterPopover({ button: videoSecondsBtn, menu: videoSecondsMenu });

  const videoAspectWrap = document.createElement('div');
  videoAspectWrap.className = 'relative';
  const videoAspectBtn = mkBtn('画幅');
  const videoAspectMenu = mkMenu();
  videoAspectWrap.appendChild(videoAspectBtn);
  videoAspectWrap.appendChild(videoAspectMenu);
  const videoAspectPopover = createFooterPopover({ button: videoAspectBtn, menu: videoAspectMenu });

  const videoSizeWrap = document.createElement('div');
  videoSizeWrap.className = 'relative';
  const videoSizeBtn = mkBtn('尺寸');
  const videoSizeMenu = mkMenu();
  videoSizeWrap.appendChild(videoSizeBtn);
  videoSizeWrap.appendChild(videoSizeMenu);
  const videoSizePopover = createFooterPopover({ button: videoSizeBtn, menu: videoSizeMenu });

  const videoStartWrap = document.createElement('div');
  videoStartWrap.className = 'relative';
  const videoStartBtn = mkBtn('Start');
  const videoStartMenu = mkMenu();
  videoStartWrap.appendChild(videoStartBtn);
  videoStartWrap.appendChild(videoStartMenu);
  const videoStartPopover = createFooterPopover({ button: videoStartBtn, menu: videoStartMenu });

  const videoEndWrap = document.createElement('div');
  videoEndWrap.className = 'relative';
  const videoEndBtn = mkBtn('End');
  const videoEndMenu = mkMenu();
  videoEndWrap.appendChild(videoEndBtn);
  videoEndWrap.appendChild(videoEndMenu);
  const videoEndPopover = createFooterPopover({ button: videoEndBtn, menu: videoEndMenu });

  video.appendChild(videoProviderWrap);
  video.appendChild(videoModelWrap);
  video.appendChild(videoModeWrap);
  video.appendChild(videoSecondsWrap);
  video.appendChild(videoAspectWrap);
  video.appendChild(videoSizeWrap);
  video.appendChild(videoStartWrap);
  video.appendChild(videoEndWrap);

  function renderVideo(state: WorkflowState) {
    const provider = state.videoProvider === 'kling' ? 'kling' : state.videoProvider === 'gemini' ? 'gemini' : 'jimeng';

    const providerLabel = provider === 'jimeng' ? 'Jimeng' : provider === 'kling' ? 'Kling' : 'Gemini';
    videoProviderBtn.textContent = `Provider ${providerLabel}`;
    buildSingleSelectMenu({
      menu: videoProviderMenu,
      current: providerLabel,
      options: ['Jimeng', 'Kling', 'Gemini'],
      onPick: (v) => {
        const nextProvider = v === 'Kling' ? 'kling' : v === 'Gemini' ? 'gemini' : 'jimeng';
        store.update((s) => ({
          ...s,
          videoProvider: nextProvider,
          videoModel:
            nextProvider === 'gemini'
              ? 'veo-3.0-fast-generate-001'
              : nextProvider === 'kling'
                ? 'kling-v2-6'
                : 'jimeng-video-3.0',
          videoMode:
            nextProvider === 'kling'
              ? typeof s.videoMode === 'string' && s.videoMode.trim()
                ? s.videoMode.trim()
                : 'std'
              : undefined,
          videoSeconds: nextProvider === 'jimeng' ? undefined : s.videoSeconds,
        }));
        videoProviderPopover.close();
      },
    });

    // Model options (dropdown)
    const models: string[] =
      provider === 'jimeng'
        ? ['jimeng-video-3.0']
        : provider === 'kling'
          ? ['kling-v2-6']
          : ['veo-3.0-fast-generate-001', 'veo-3.0-generate-001', 'veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'];

    const currentModel = typeof state.videoModel === 'string' && state.videoModel.trim() ? state.videoModel.trim() : models[0]!;
    videoModelBtn.textContent = `Model ${prettyVideoModel(currentModel)}`;
    {
      const viewport = scrollAreaViewport(videoModelMenu);
      viewport.innerHTML = '';
      for (const m of models) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${m === currentModel ? 'bg-white/5' : ''}`;
        b.innerHTML = `<div class="flex items-center justify-between gap-4"><span class="truncate">${prettyVideoModel(m)}</span><span class="opacity-40 text-[10px] font-mono">${m}</span></div>`;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.update((s) => ({ ...s, videoModel: m }));
          videoModelPopover.close();
        });
        viewport.appendChild(b);
      }
      setupScrollArea(videoModelMenu);
    }

    // Kling mode (dropdown)
    const showMode = provider === 'kling';
    videoModeWrap.classList.toggle('hidden', !showMode);
    const mode = typeof state.videoMode === 'string' && state.videoMode.trim() ? state.videoMode.trim() : 'std';
    videoModeBtn.textContent = `Mode ${mode.toUpperCase()}`;
    buildSingleSelectMenu({
      menu: videoModeMenu,
      current: mode.toUpperCase(),
      options: ['STD', 'PRO'],
      onPick: (v) => {
        store.update((s) => ({ ...s, videoMode: v.toLowerCase() as any }));
        videoModePopover.close();
      },
    });

    // Seconds
    const secondsSupported = provider !== 'jimeng';
    videoSecondsWrap.classList.toggle('hidden', !secondsSupported);
    const seconds = typeof state.videoSeconds === 'number' && Number.isFinite(state.videoSeconds) ? state.videoSeconds : undefined;
    videoSecondsBtn.textContent = secondsSupported ? `时长 ${seconds ? `${seconds}s` : '默认'}` : '时长';
    const videoSecondsViewport = scrollAreaViewport(videoSecondsMenu);
    videoSecondsViewport.innerHTML = '';
    if (secondsSupported) {
      const opts = provider === 'kling' ? [5, 10] : [5, 10, 15];
      for (const s of opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${seconds === s ? 'bg-white/5' : ''}`;
        b.textContent = `${s} 秒`;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.update((st) => ({ ...st, videoSeconds: s }));
          videoSecondsPopover.close();
        });
        videoSecondsViewport.appendChild(b);
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '使用默认';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        store.update((st) => ({ ...st, videoSeconds: undefined }));
        videoSecondsPopover.close();
      });
      videoSecondsViewport.appendChild(clear);
    }

    // Aspect/Size (supported by jimeng/gemini; kling doesn't support in backend)
    const supportsAspectSize = provider !== 'kling';
    videoAspectWrap.classList.toggle('hidden', !supportsAspectSize);
    videoSizeWrap.classList.toggle('hidden', !supportsAspectSize);
    const aspect = typeof state.videoAspect === 'string' && state.videoAspect.trim() ? state.videoAspect.trim() : '';
    videoAspectBtn.textContent = supportsAspectSize ? `画幅 ${aspect || '默认'}` : '画幅';
    const videoAspectViewport = scrollAreaViewport(videoAspectMenu);
    videoAspectViewport.innerHTML = '';
    if (supportsAspectSize) {
      for (const opt of ['16:9', '9:16', '1:1', '2:3', '3:2', '4:3', '3:4']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${aspect === opt ? 'bg-white/5' : ''}`;
        b.textContent = opt;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.update((st) => ({ ...st, videoAspect: opt }));
          videoAspectPopover.close();
        });
        videoAspectViewport.appendChild(b);
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '使用默认';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        store.update((st) => ({ ...st, videoAspect: undefined }));
        videoAspectPopover.close();
      });
      videoAspectViewport.appendChild(clear);
    }

    const size = typeof state.videoSize === 'string' && state.videoSize.trim() ? state.videoSize.trim() : '';
    videoSizeBtn.textContent = supportsAspectSize ? `尺寸 ${size || '默认'}` : '尺寸';
    const videoSizeViewport = scrollAreaViewport(videoSizeMenu);
    videoSizeViewport.innerHTML = '';
    if (supportsAspectSize) {
      const sizeOptions = provider === 'jimeng' ? ['1080P', '720P'] : ['large', 'medium', 'small', '1080P', '720P'];
      for (const opt of sizeOptions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${size === opt ? 'bg-white/5' : ''}`;
        b.textContent = opt;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.update((st) => ({ ...st, videoSize: opt }));
          videoSizePopover.close();
        });
        videoSizeViewport.appendChild(b);
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
      clear.textContent = '使用默认';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        store.update((st) => ({ ...st, videoSize: undefined }));
        videoSizePopover.close();
      });
      videoSizeViewport.appendChild(clear);
    }

    // Start/End frame pickers
    const options = (state.referenceImages || [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, label: `${r.name || r.id}` }));
    const startId = typeof state.videoStartRefId === 'string' ? state.videoStartRefId : '';
    const endId = typeof state.videoEndRefId === 'string' ? state.videoEndRefId : '';
    videoStartBtn.textContent = `Start ${startId ? options.find((o) => o.id === startId)?.label || '✓' : '（无）'}`;
    videoEndBtn.textContent = `End ${endId ? options.find((o) => o.id === endId)?.label || '✓' : '（无）'}`;

    const rebuildMenu = (menu: HTMLElement, which: 'start' | 'end') => {
      const viewport = scrollAreaViewport(menu);
      viewport.innerHTML = '';
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
      none.textContent = '（无）';
      none.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        store.update((st) => ({ ...st, [which === 'start' ? 'videoStartRefId' : 'videoEndRefId']: undefined }));
        if (which === 'start') videoStartPopover.close();
        else videoEndPopover.close();
      });
      viewport.appendChild(none);

      for (const o of options.slice(0, 24)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
        b.textContent = o.label;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.update((st) => ({ ...st, [which === 'start' ? 'videoStartRefId' : 'videoEndRefId']: o.id }));
          if (which === 'start') videoStartPopover.close();
          else videoEndPopover.close();
        });
        viewport.appendChild(b);
      }
    };
    rebuildMenu(videoStartMenu, 'start');
    rebuildMenu(videoEndMenu, 'end');
  }

  // --- POST controls: video postprocess (ffmpeg)
  const postAuto = mkBtn('AUTO');
  postAuto.title = '后处理参数由程序自动选择';
  post.appendChild(postAuto);

  function renderPost(_state: WorkflowState) {
    // Intentionally no user-facing knobs: backend auto-tunes.
    postAuto.textContent = 'AUTO';
  }

  // --- BEAUTIFY controls: hint input (synced with settings overlay input)
  const beautifyHint = document.createElement('input');
  beautifyHint.type = 'text';
  beautifyHint.placeholder = '美化建议（可选）';
  beautifyHint.className =
    'w-72 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[12px] font-medium text-white/80 placeholder:text-white/20 focus:border-studio-accent/50 transition-all';
  beautify.appendChild(beautifyHint);

  const overlayHint = document.getElementById('commandBeautifyHint') as HTMLInputElement | null;
  const syncHintToStore = (value: string) => {
    const next = value.trim();
    store.update((s) => ({ ...s, beautifyHint: next || undefined }));
  };

  beautifyHint.addEventListener('input', () => syncHintToStore(beautifyHint.value));
  overlayHint?.addEventListener('input', () => syncHintToStore(overlayHint.value));

  function renderBeautify(state: WorkflowState) {
    const v = typeof state.beautifyHint === 'string' ? state.beautifyHint : '';
    if (beautifyHint.value !== v) beautifyHint.value = v;
    if (overlayHint && overlayHint.value !== v) overlayHint.value = v;
  }

  function renderMv(state: WorkflowState) {
    const cmd = String(state.commandMode || '').trim();
    const recipe =
      cmd === 'mv-mix' || cmd === 'mv-images' || cmd === 'mv-clip' || cmd === 'mv-subtitle' ? (cmd as any) : ('mv' as const);

    const head = typeof state.traceHeadMessageId === 'string' ? state.traceHeadMessageId.trim() : '';
    mvHeadBtn.textContent = `HEAD ${shortId(head)}`;

    const hasImages = readSelectedReferenceIds(state, 24).length > 0;
    const showFps = recipe === 'mv-images' || (recipe === 'mv-mix' && hasImages);
    const showDur = recipe === 'mv-clip' || recipe === 'mv-images' || (recipe === 'mv-mix' && hasImages);
    const showSub = recipe === 'mv-mix' || recipe === 'mv-subtitle';
    mvFpsWrap.classList.toggle('hidden', !showFps);
    mvDurWrap.classList.toggle('hidden', !showDur);
    mvSubWrap.classList.toggle('hidden', !showSub);

    const currentRes = typeof state.mvResolution === 'string' && state.mvResolution.trim() ? state.mvResolution.trim() : '1280x720';
    mvResBtn.textContent = `Res ${prettyResolution(currentRes)}`;
    buildSingleSelectMenu({
      menu: mvResMenu,
      current: prettyResolution(currentRes),
      options: ['Source', '720P', '1080P'],
      onPick: (v) => {
        const next = v === 'Source' ? 'source' : v === '1080P' ? '1920x1080' : '1280x720';
        store.update((s) => ({ ...s, mvResolution: next }));
        mvResPopover.close();
      },
    });

    if (showFps) {
      const fps = typeof state.mvFps === 'number' && Number.isFinite(state.mvFps) ? state.mvFps : 25;
      mvFpsBtn.textContent = `FPS ${fps}`;
      buildSingleSelectMenu({
        menu: mvFpsMenu,
        current: String(fps),
        options: ['24', '25', '30', '60'],
        onPick: (v) => {
          store.update((s) => ({ ...s, mvFps: Number(v) }));
          mvFpsPopover.close();
        },
      });
    }

    if (showDur) {
      const dur = typeof state.mvDurationSeconds === 'number' && Number.isFinite(state.mvDurationSeconds) ? state.mvDurationSeconds : 5;
      mvDurBtn.textContent = recipe === 'mv-clip' ? `Trim ${dur}s` : `Dur ${dur}s`;

      const opts = recipe === 'mv-clip' ? ['5', '10', '15', '30', '60', '120'] : ['2', '3', '5', '8', '10', '15'];
      buildSingleSelectMenu({
        menu: mvDurMenu,
        current: String(dur),
        options: opts,
        onPick: (v) => {
          store.update((s) => ({ ...s, mvDurationSeconds: Number(v) }));
          mvDurPopover.close();
        },
      });
    }

    if (showSub) {
      const mode = state.mvSubtitleMode === 'burn' ? 'burn' : 'soft';
      mvSubBtn.textContent = `Sub ${prettySubtitleMode(mode)}`;
      buildSingleSelectMenu({
        menu: mvSubMenu,
        current: prettySubtitleMode(mode),
        options: ['Soft', 'Burn'],
        onPick: (v) => {
          store.update((s) => ({ ...s, mvSubtitleMode: v === 'Burn' ? 'burn' : 'soft' }));
          mvSubPopover.close();
        },
      });
    }
  }

  // --- DECONSTRUCT controls: keep empty (avoid non-actionable labels)
  const clearSelected = mkIconBtn('清空参考图选择', 'fas fa-ban');
  clearSelected.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    store.update((s) => ({ ...s, selectedReferenceIds: [] }));
  });
  deconstruct.appendChild(clearSelected);

  chips.appendChild(mj);
  chips.appendChild(suno);
  chips.appendChild(pedit);
  chips.appendChild(video);
  chips.appendChild(post);
  chips.appendChild(mv);
  chips.appendChild(beautify);
  chips.appendChild(deconstruct);

  function applyModeVisibility(state: WorkflowState) {
    const mode = readMode(state);
    mj.classList.toggle('hidden', mode !== 'mj');
    suno.classList.toggle('hidden', mode !== 'suno');
    pedit.classList.toggle('hidden', mode !== 'pedit');
    video.classList.toggle('hidden', mode !== 'video');
    post.classList.toggle('hidden', mode !== 'post');
    mv.classList.toggle('hidden', mode !== 'mv');
    beautify.classList.toggle('hidden', mode !== 'beautify');
    deconstruct.classList.toggle('hidden', mode !== 'deconstruct');

    const cmd = String(state.commandMode || '').trim();
    const mvLabel =
      cmd === 'mv-images'
        ? 'MV 图片→视频'
        : cmd === 'mv-clip'
          ? 'MV 视频剪辑'
          : cmd === 'mv-subtitle'
            ? 'MV 字幕'
            : cmd.startsWith('mv')
              ? 'MV 合成'
              : '';
    if (mvLabel) {
      modeLabel.textContent = mvLabel;
      modeLabel.classList.remove('hidden');
    } else {
      modeLabel.textContent = '';
      modeLabel.classList.add('hidden');
    }
  }

  function prettySunoMode(v: string): string {
    const m = String(v || '').trim().toLowerCase();
    if (m === 'instrumental') return 'Instrumental';
    if (m === 'lyrics') return 'Lyrics';
    return 'Auto';
  }

  function prettySunoLang(v: string): string {
    const m = String(v || '').trim().toLowerCase();
    if (m === 'zh-cn') return '简体';
    if (m === 'zh-tw') return '繁体';
    if (m === 'ja') return '日本語';
    if (m === 'ko') return '한국어';
    if (m === 'en') return 'EN';
    return 'Auto';
  }

  function renderSuno(state: WorkflowState) {
    const mode = typeof (state as any).sunoMode === 'string' ? String((state as any).sunoMode || '').trim() : 'auto';
    const lang = typeof (state as any).sunoLanguage === 'string' ? String((state as any).sunoLanguage || '').trim() : 'auto';

    sunoModeBtn.textContent = `Mode ${prettySunoMode(mode)}`;
    buildSingleSelectMenu({
      menu: sunoModeMenu,
      current: prettySunoMode(mode),
      options: ['Auto', 'Instrumental', 'Lyrics'],
      onPick: (label) => {
        const next = label === 'Instrumental' ? 'instrumental' : label === 'Lyrics' ? 'lyrics' : 'auto';
        store.update((s) => ({ ...s, sunoMode: next as any }));
        sunoModePopover.close();
      },
      onClear: () => {
        store.update((s) => ({ ...s, sunoMode: 'auto' as any }));
        sunoModePopover.close();
      },
    });

    sunoLangBtn.textContent = `Lang ${prettySunoLang(lang)}`;
    buildSingleSelectMenu({
      menu: sunoLangMenu,
      current: prettySunoLang(lang),
      options: ['Auto', 'EN', '简体', '繁体', '日本語', '한국어'],
      onPick: (label) => {
        const next =
          label === 'EN'
            ? 'en'
            : label === '简体'
              ? 'zh-cn'
              : label === '繁体'
                ? 'zh-tw'
                : label === '日本語'
                  ? 'ja'
                  : label === '한국어'
                    ? 'ko'
                    : 'auto';
        store.update((s) => ({ ...s, sunoLanguage: next as any }));
        sunoLangPopover.close();
      },
      onClear: () => {
        store.update((s) => ({ ...s, sunoLanguage: 'auto' as any }));
        sunoLangPopover.close();
      },
    });
  }

  function render(state: WorkflowState) {
    applyModeVisibility(state);
    const mode = readMode(state);
    if (mode === 'mj') renderMj(state);
    else if (mode === 'suno') renderSuno(state);
    else if (mode === 'pedit') renderPedit(state);
    else if (mode === 'video') renderVideo(state);
    else if (mode === 'post') renderPost(state);
    else if (mode === 'mv') renderMv(state);
    else if (mode === 'beautify') renderBeautify(state);
  }

  render(store.get());
  store.subscribe(render);
  getPromptInput()?.addEventListener('input', () => {
    const state = store.get();
    if (readMode(state) === 'mj') renderMj(state);
  });
}

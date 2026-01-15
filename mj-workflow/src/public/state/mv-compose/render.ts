import { scrollAreaViewport } from '../../atoms/scroll-area';
import { hide, show } from '../../atoms/ui';
import type { WorkflowState } from '../workflow';
import type { MvComposeCtx } from './types';
import { prettyResolution, prettySubtitleMode } from './utils';

function shortId(id: string): string {
  const s = String(id || '').trim();
  if (!s) return '-';
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function applyMvComposeModeVisibility(ctx: MvComposeCtx, state: WorkflowState) {
  const raw = String(state.commandMode || '').trim();
  if (raw.startsWith('mv')) show(ctx.dom.panel);
  else hide(ctx.dom.panel);
}

export function renderMvComposeMenus(ctx: MvComposeCtx, state: WorkflowState) {
  const head = typeof state.traceHeadMessageId === 'string' ? state.traceHeadMessageId : '';
  ctx.dom.headLabel.textContent = shortId(head);

  const mode = String(state.commandMode || '').trim();
  const showFps = mode === 'mv-mix' || mode === 'mv-images';
  const showDuration = mode === 'mv-mix' || mode === 'mv-images' || mode === 'mv-clip';
  const showSubtitles = mode === 'mv-mix' || mode === 'mv-subtitle';
  show(ctx.dom.resolutionWrap);
  if (showFps) show(ctx.dom.fpsWrap);
  else hide(ctx.dom.fpsWrap);
  if (showDuration) show(ctx.dom.durationWrap);
  else hide(ctx.dom.durationWrap);
  if (showSubtitles) show(ctx.dom.subtitleModeWrap);
  else hide(ctx.dom.subtitleModeWrap);

  const currentResolution = typeof state.mvResolution === 'string' ? state.mvResolution : '1280x720';
  ctx.dom.resolutionLabel.textContent = prettyResolution(currentResolution);
  const resViewport = scrollAreaViewport(ctx.dom.resolutionMenu);
  resViewport.innerHTML = '';
  const resolutions = [
    { label: 'Source', value: 'source' },
    { label: '720P (1280x720)', value: '1280x720' },
    { label: '1080P (1920x1080)', value: '1920x1080' },
  ];
  for (const opt of resolutions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt.value === currentResolution ? 'bg-white/5' : ''}`;
    b.textContent = opt.label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.store.update((s) => ({ ...s, mvResolution: opt.value }));
      ctx.popovers.resolutionPopover.close();
    });
    resViewport.appendChild(b);
  }

  const currentFps = typeof state.mvFps === 'number' && Number.isFinite(state.mvFps) ? state.mvFps : 25;
  ctx.dom.fpsLabel.textContent = String(currentFps);
  const fpsViewport = scrollAreaViewport(ctx.dom.fpsMenu);
  fpsViewport.innerHTML = '';
  for (const opt of [24, 25, 30, 60]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === currentFps ? 'bg-white/5' : ''}`;
    b.textContent = String(opt);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.store.update((s) => ({ ...s, mvFps: opt }));
      ctx.popovers.fpsPopover.close();
    });
    fpsViewport.appendChild(b);
  }

  const currentDuration = typeof state.mvDurationSeconds === 'number' && Number.isFinite(state.mvDurationSeconds) ? state.mvDurationSeconds : 5;
  ctx.dom.durationLabel.textContent = `${currentDuration}s`;
  const durViewport = scrollAreaViewport(ctx.dom.durationMenu);
  durViewport.innerHTML = '';
  for (const opt of [2, 3, 5, 8, 10, 15]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === currentDuration ? 'bg-white/5' : ''}`;
    b.textContent = `${opt} 秒`;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.store.update((s) => ({ ...s, mvDurationSeconds: opt }));
      ctx.popovers.durationPopover.close();
    });
    durViewport.appendChild(b);
  }

  const subtitleMode = state.mvSubtitleMode === 'burn' ? 'burn' : 'soft';
  ctx.dom.subtitleModeLabel.textContent = prettySubtitleMode(subtitleMode);
  const subViewport = scrollAreaViewport(ctx.dom.subtitleModeMenu);
  subViewport.innerHTML = '';
  for (const opt of [
    { label: 'Soft (mov_text)', value: 'soft' as const },
    { label: 'Burn (libass)', value: 'burn' as const },
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt.value === subtitleMode ? 'bg-white/5' : ''}`;
    b.textContent = opt.label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.store.update((s) => ({ ...s, mvSubtitleMode: opt.value }));
      ctx.popovers.subtitleModePopover.close();
    });
    subViewport.appendChild(b);
  }
}

import { createPopoverMenu } from '../../atoms/popover-menu';
import { setupScrollArea } from '../../atoms/scroll-area';
import { byId } from '../../atoms/ui';
import type { MvComposeDom, MvComposePopovers } from './types';

export function createMvComposeDom(): { dom: MvComposeDom; popovers: MvComposePopovers } {
  const panel = byId<HTMLElement>('mvInlinePanel');
  const promptInput = byId<HTMLTextAreaElement>('promptInput');

  const headLabel = byId<HTMLElement>('mvHeadLabel');
  const openTraceBtn = byId<HTMLButtonElement>('mvOpenTraceBtn');

  const resolutionWrap = byId<HTMLElement>('mvResolutionWrap');
  const resolutionBtn = byId<HTMLButtonElement>('mvResolutionBtn');
  const resolutionLabel = byId<HTMLElement>('mvResolutionLabel');
  const resolutionMenu = byId<HTMLElement>('mvResolutionMenu');

  const fpsWrap = byId<HTMLElement>('mvFpsWrap');
  const fpsBtn = byId<HTMLButtonElement>('mvFpsBtn');
  const fpsLabel = byId<HTMLElement>('mvFpsLabel');
  const fpsMenu = byId<HTMLElement>('mvFpsMenu');

  const durationWrap = byId<HTMLElement>('mvDurationWrap');
  const durationBtn = byId<HTMLButtonElement>('mvDurationBtn');
  const durationLabel = byId<HTMLElement>('mvDurationLabel');
  const durationMenu = byId<HTMLElement>('mvDurationMenu');

  const subtitleModeWrap = byId<HTMLElement>('mvSubtitleModeWrap');
  const subtitleModeBtn = byId<HTMLButtonElement>('mvSubtitleModeBtn');
  const subtitleModeLabel = byId<HTMLElement>('mvSubtitleModeLabel');
  const subtitleModeMenu = byId<HTMLElement>('mvSubtitleModeMenu');

  const resolutionPopover = createPopoverMenu({
    button: resolutionBtn,
    menu: resolutionMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(resolutionMenu);
    },
  });
  const fpsPopover = createPopoverMenu({
    button: fpsBtn,
    menu: fpsMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(fpsMenu);
    },
  });
  const durationPopover = createPopoverMenu({
    button: durationBtn,
    menu: durationMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(durationMenu);
    },
  });
  const subtitleModePopover = createPopoverMenu({
    button: subtitleModeBtn,
    menu: subtitleModeMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(subtitleModeMenu);
    },
  });

  return {
    dom: {
      panel,
      promptInput,
      headLabel,
      openTraceBtn,
      resolutionWrap,
      resolutionBtn,
      resolutionLabel,
      resolutionMenu,
      fpsWrap,
      fpsBtn,
      fpsLabel,
      fpsMenu,
      durationWrap,
      durationBtn,
      durationLabel,
      durationMenu,
      subtitleModeWrap,
      subtitleModeBtn,
      subtitleModeLabel,
      subtitleModeMenu,
    },
    popovers: {
      resolutionPopover,
      fpsPopover,
      durationPopover,
      subtitleModePopover,
    },
  };
}

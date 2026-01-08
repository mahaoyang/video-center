import type { ApiClient } from '../adapters/api';
import { randomId } from '../atoms/id';
import { showError } from '../atoms/notify';
import { byId, hide, show } from '../atoms/ui';
import { createPopoverMenu } from '../atoms/popover-menu';
import { pollVideoUntilReady } from '../atoms/video-tasks';
import type { Store } from '../state/store';
import type { StreamMessage, VideoProvider, WorkflowState } from '../state/workflow';
import { isHttpUrl } from '../atoms/url';
import { scrollAreaViewport, setupScrollArea } from '../atoms/scroll-area';

function normalizeSpaces(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
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

export function createVideoGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const extraPanel = byId<HTMLElement>('commandExtraPanel');
  const panel = byId<HTMLElement>('commandVideoPanel');

  const providerBtn = byId<HTMLButtonElement>('videoProviderBtn');
  const providerMenu = byId<HTMLElement>('videoProviderMenu');
  const providerLabel = byId<HTMLElement>('videoProviderLabel');
  const modelBtn = byId<HTMLButtonElement>('videoModelBtn');
  const modelLabel = byId<HTMLElement>('videoModelLabel');
  const modelMenu = byId<HTMLElement>('videoModelMenu');

  const secondsWrap = byId<HTMLElement>('videoSecondsWrap');
  const secondsBtn = byId<HTMLButtonElement>('videoSecondsBtn');
  const secondsLabel = byId<HTMLElement>('videoSecondsLabel');
  const secondsMenu = byId<HTMLElement>('videoSecondsMenu');

  const modeWrap = byId<HTMLElement>('videoModeWrap');
  const modeBtn = byId<HTMLButtonElement>('videoModeBtn');
  const modeLabel = byId<HTMLElement>('videoModeLabel');
  const modeMenu = byId<HTMLElement>('videoModeMenu');

  const aspectWrap = byId<HTMLElement>('videoAspectWrap');
  const aspectBtn = byId<HTMLButtonElement>('videoAspectBtn');
  const aspectLabel = byId<HTMLElement>('videoAspectLabel');
  const aspectMenu = byId<HTMLElement>('videoAspectMenu');

  const sizeWrap = byId<HTMLElement>('videoSizeWrap');
  const sizeBtn = byId<HTMLButtonElement>('videoSizeBtn');
  const sizeLabel = byId<HTMLElement>('videoSizeLabel');
  const sizeMenu = byId<HTMLElement>('videoSizeMenu');

  const startBtn = byId<HTMLButtonElement>('videoStartRefBtn');
  const startLabel = byId<HTMLElement>('videoStartRefLabel');
  const startMenu = byId<HTMLElement>('videoStartRefMenu');
  const endBtn = byId<HTMLButtonElement>('videoEndRefBtn');
  const endLabel = byId<HTMLElement>('videoEndRefLabel');
  const endMenu = byId<HTMLElement>('videoEndRefMenu');

  const providerPopover = createPopoverMenu({
    button: providerBtn,
    menu: providerMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(providerMenu);
    },
  });
  const modelPopover = createPopoverMenu({
    button: modelBtn,
    menu: modelMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(modelMenu);
    },
  });
  const startPopover = createPopoverMenu({
    button: startBtn,
    menu: startMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(startMenu);
    },
  });
  const endPopover = createPopoverMenu({
    button: endBtn,
    menu: endMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(endMenu);
    },
  });
  const secondsPopover = createPopoverMenu({
    button: secondsBtn,
    menu: secondsMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(secondsMenu);
    },
  });
  const aspectPopover = createPopoverMenu({
    button: aspectBtn,
    menu: aspectMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(aspectMenu);
    },
  });
  const sizePopover = createPopoverMenu({
    button: sizeBtn,
    menu: sizeMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(sizeMenu);
    },
  });
  const modePopover = createPopoverMenu({
    button: modeBtn,
    menu: modeMenu,
    onOpenChange: (open) => {
      if (open) setupScrollArea(modeMenu);
    },
  });

  function modelsForProvider(provider: VideoProvider): string[] {
    if (provider === 'jimeng') return ['jimeng-video-3.0'];
    if (provider === 'kling') return ['kling-v2-6'];
    return ['veo-3.0-fast-generate-001', 'veo-3.0-generate-001', 'veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'];
  }

  function defaultModelForProvider(provider: VideoProvider): string {
    return modelsForProvider(provider)[0]!;
  }

  function setProvider(next: VideoProvider) {
    params.store.update((s) => ({
      ...s,
      videoProvider: next,
      videoModel: defaultModelForProvider(next),
      videoMode: next === 'kling' ? (typeof s.videoMode === 'string' && s.videoMode.trim() ? s.videoMode.trim() : 'std') : undefined,
      videoSeconds: next === 'jimeng' ? undefined : s.videoSeconds,
      videoAspect: next === 'kling' ? undefined : s.videoAspect,
      videoSize: next === 'kling' ? undefined : s.videoSize,
    }));
  }

  function readProvider(): VideoProvider {
    const fromStore = params.store.get().videoProvider;
    if (fromStore === 'jimeng' || fromStore === 'kling' || fromStore === 'gemini') return fromStore;
    return 'jimeng';
  }

  function refreshProviderLabel(state: WorkflowState) {
    const provider = readProvider();
    providerLabel.textContent = provider === 'jimeng' ? 'Jimeng' : provider === 'kling' ? 'Kling' : 'Gemini（自定义模型）';
    providerMenu.querySelectorAll<HTMLElement>('[data-video-provider]').forEach((el) => {
      const v = String(el.dataset.videoProvider || '').trim();
      el.classList.toggle('bg-white/5', v === provider);
    });
    renderModel(state);
  }

  function renderModel(state: WorkflowState) {
    const provider = readProvider();
    const models = modelsForProvider(provider);
    const current = typeof state.videoModel === 'string' && state.videoModel.trim() ? state.videoModel.trim() : models[0]!;
    modelLabel.textContent = prettyVideoModel(current);
    const viewport = scrollAreaViewport(modelMenu);
    viewport.innerHTML = '';
    for (const m of models) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${m === current ? 'bg-white/5' : ''}`;
      b.innerHTML = `<div class="flex items-center justify-between gap-4"><span class="truncate">${prettyVideoModel(m)}</span><span class="opacity-40 text-[10px] font-mono">${m}</span></div>`;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((s) => ({ ...s, videoModel: m }));
        modelPopover.close();
      });
      viewport.appendChild(b);
    }
  }

  function ensureValidState(state: WorkflowState) {
    const provider = readProvider();
    const models = modelsForProvider(provider);
    const model = typeof state.videoModel === 'string' ? state.videoModel.trim() : '';
    const patch: Partial<WorkflowState> = {};

    if (!model || !models.includes(model)) patch.videoModel = models[0]!;

    if (provider === 'jimeng') {
      if (state.videoSeconds !== undefined) patch.videoSeconds = undefined;
      if (state.videoMode !== undefined) patch.videoMode = undefined;
      if (!(typeof state.videoAspect === 'string' && state.videoAspect.trim())) patch.videoAspect = '16:9';
      if (!(typeof state.videoSize === 'string' && state.videoSize.trim())) patch.videoSize = '1080P';
    } else if (provider === 'kling') {
      if (!(typeof state.videoMode === 'string' && (state.videoMode === 'std' || state.videoMode === 'pro'))) patch.videoMode = 'std';
      if (!(typeof state.videoSeconds === 'number' && Number.isFinite(state.videoSeconds))) patch.videoSeconds = 5;
      if (state.videoAspect !== undefined) patch.videoAspect = undefined;
      if (state.videoSize !== undefined) patch.videoSize = undefined;
    } else {
      // gemini
      if (state.videoMode !== undefined) patch.videoMode = undefined;
    }

    const keys = Object.keys(patch);
    if (!keys.length) return;
    params.store.update((s) => ({ ...s, ...patch }));
  }

  function renderSeconds(state: WorkflowState) {
    const provider = readProvider();
    const supports = provider !== 'jimeng';
    secondsWrap.classList.toggle('hidden', !supports);
    const secondsViewport = scrollAreaViewport(secondsMenu);
    secondsViewport.innerHTML = '';
    if (!supports) return;

    const current = typeof state.videoSeconds === 'number' && Number.isFinite(state.videoSeconds) ? state.videoSeconds : undefined;
    secondsLabel.textContent = current ? `${current}s` : '默认';
    const opts = provider === 'kling' ? [5, 10] : [5, 10, 15];
    for (const s of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${current === s ? 'bg-white/5' : ''}`;
      b.textContent = `${s} 秒`;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((st) => ({ ...st, videoSeconds: s }));
        secondsPopover.close();
      });
      secondsViewport.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
    clear.textContent = '使用默认';
    clear.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      params.store.update((st) => ({ ...st, videoSeconds: undefined }));
      secondsPopover.close();
    });
    secondsViewport.appendChild(clear);
  }

  function renderMode(state: WorkflowState) {
    const provider = readProvider();
    const showMode = provider === 'kling';
    modeWrap.classList.toggle('hidden', !showMode);
    if (!showMode) return;
    const mode = typeof state.videoMode === 'string' && (state.videoMode === 'std' || state.videoMode === 'pro') ? state.videoMode : 'std';
    modeLabel.textContent = mode.toUpperCase();
    const viewport = scrollAreaViewport(modeMenu);
    viewport.innerHTML = '';
    for (const opt of ['std', 'pro'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${opt === mode ? 'bg-white/5' : ''}`;
      b.textContent = opt.toUpperCase();
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((s) => ({ ...s, videoMode: opt }));
        modePopover.close();
      });
      viewport.appendChild(b);
    }
  }

  function renderAspectSize(state: WorkflowState) {
    const provider = readProvider();
    const supports = provider !== 'kling';
    aspectWrap.classList.toggle('hidden', !supports);
    sizeWrap.classList.toggle('hidden', !supports);
    const aspectViewport = scrollAreaViewport(aspectMenu);
    const sizeViewport = scrollAreaViewport(sizeMenu);
    aspectViewport.innerHTML = '';
    sizeViewport.innerHTML = '';
    if (!supports) return;

    const aspect = typeof state.videoAspect === 'string' && state.videoAspect.trim() ? state.videoAspect.trim() : '';
    aspectLabel.textContent = aspect || '默认';
    for (const opt of ['16:9', '9:16', '1:1', '2:3', '3:2', '4:3', '3:4']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${aspect === opt ? 'bg-white/5' : ''}`;
      b.textContent = opt;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((st) => ({ ...st, videoAspect: opt }));
        aspectPopover.close();
      });
      aspectViewport.appendChild(b);
    }
    const clearAspect = document.createElement('button');
    clearAspect.type = 'button';
    clearAspect.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
    clearAspect.textContent = '使用默认';
    clearAspect.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      params.store.update((st) => ({ ...st, videoAspect: undefined }));
      aspectPopover.close();
    });
    aspectViewport.appendChild(clearAspect);

    const size = typeof state.videoSize === 'string' && state.videoSize.trim() ? state.videoSize.trim() : '';
    sizeLabel.textContent = size || '默认';
    const sizeOptions = provider === 'jimeng' ? ['1080P', '720P'] : ['large', 'medium', 'small', '1080P', '720P'];
    for (const opt of sizeOptions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all ${size === opt ? 'bg-white/5' : ''}`;
      b.textContent = opt;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((st) => ({ ...st, videoSize: opt }));
        sizePopover.close();
      });
      sizeViewport.appendChild(b);
    }
    const clearSize = document.createElement('button');
    clearSize.type = 'button';
    clearSize.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all border-t border-white/10';
    clearSize.textContent = '使用默认';
    clearSize.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      params.store.update((st) => ({ ...st, videoSize: undefined }));
      sizePopover.close();
    });
    sizeViewport.appendChild(clearSize);
  }

  providerMenu.querySelectorAll<HTMLButtonElement>('button[data-video-provider]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.videoProvider || '').trim();
      if (v !== 'jimeng' && v !== 'kling' && v !== 'gemini') return;
      setProvider(v);
      const next = params.store.get();
      ensureValidState(next);
      refreshProviderLabel(next);
      providerPopover.close();
    });
  });

  function rebuildRefSelects(state: WorkflowState) {
    const options = state.referenceImages
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, label: `${r.name || r.id}` }));

    const buildMenu = (menu: HTMLElement, which: 'start' | 'end') => {
      const viewport = scrollAreaViewport(menu);
      viewport.innerHTML = '';
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
      none.textContent = '（无）';
      none.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((s) => ({ ...s, [which === 'start' ? 'videoStartRefId' : 'videoEndRefId']: undefined }));
        if (which === 'start') startPopover.close();
        else endPopover.close();
      });
      viewport.appendChild(none);

      for (const o of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full px-4 py-3 text-left text-[12px] hover:bg-white/5 transition-all';
        btn.textContent = o.label;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          params.store.update((s) => ({ ...s, [which === 'start' ? 'videoStartRefId' : 'videoEndRefId']: o.id }));
          if (which === 'start') startPopover.close();
          else endPopover.close();
        });
        viewport.appendChild(btn);
      }
    };

    buildMenu(startMenu, 'start');
    buildMenu(endMenu, 'end');

    const startId = state.videoStartRefId;
    const endId = state.videoEndRefId;
    startLabel.textContent = startId ? options.find((o) => o.id === startId)?.label || startId : '（无）';
    endLabel.textContent = endId ? options.find((o) => o.id === endId)?.label || endId : '（无）';
  }

  async function ensurePublicUrlForRefId(refId: string, label: string): Promise<string | undefined> {
    const ref = params.store.get().referenceImages.find((r) => r.id === refId);
    if (!ref) return undefined;

    const existing = (isHttpUrl(ref.cdnUrl) ? ref.cdnUrl : undefined) || (isHttpUrl(ref.url) ? ref.url : undefined);
    if (existing) return existing;

    const url = String(ref.localUrl || '');
    const m = url.match(/^\/uploads\/([^/?#]+)$/);
    const localKey = ref.localKey || m?.[1];
    if (!localKey) {
      showError(`${label} 缺少公网 URL 且无法从本地文件补全（请重新上传或配置图床/CDN）`);
      return undefined;
    }

    try {
      const promoted = await params.api.promoteUpload({ localKey });
      if (promoted?.code !== 0) throw new Error(promoted?.description || 'CDN 上传失败');
      const cdnUrl = String(promoted?.result?.cdnUrl || promoted?.result?.url || '').trim();
      if (!isHttpUrl(cdnUrl)) throw new Error('CDN 上传失败：未返回可用 URL');

      params.store.update((s) => ({
        ...s,
        referenceImages: s.referenceImages.map((r) => (r.id === refId ? { ...r, cdnUrl, url: cdnUrl } : r)),
      }));
      return cdnUrl;
    } catch (error) {
      console.error('promoteUpload failed:', error);
      showError(`${label} 上传到 CDN 失败：${(error as Error)?.message || '未知错误'}`);
      return undefined;
    }
  }

  async function generateVideoFromCurrentPrompt() {
    const promptInput = byId<HTMLTextAreaElement>('promptInput');
    const prompt = normalizeSpaces(promptInput.value);
    if (!prompt) {
      showError('请输入提示词');
      return;
    }

    const provider = readProvider();
    const state = params.store.get();

    const startRefId = state.videoStartRefId || '';
    const endRefId = state.videoEndRefId || '';
    const model = String(state.videoModel || '').trim();
    const seconds = typeof state.videoSeconds === 'number' ? state.videoSeconds : undefined;
    const aspect = String(state.videoAspect || '').trim() || undefined;
    const size = String(state.videoSize || '').trim() || undefined;
    const mode = String(state.videoMode || '').trim() || undefined;

    let startImageUrl: string | undefined;
    let endImageUrl: string | undefined;

    if (startRefId) {
      startImageUrl = await ensurePublicUrlForRefId(startRefId, '起始帧（Start）');
      if (!startImageUrl) return;
    }
    if (endRefId) {
      endImageUrl = await ensurePublicUrlForRefId(endRefId, '结束帧（End）');
      if (!endImageUrl) return;
    }

    if (provider === 'kling' && !startImageUrl) {
      showError('Kling 需要选择起始帧（Start Frame）');
      return;
    }

    const aiMsgId = randomId('msg');
    const pending: StreamMessage = {
      id: aiMsgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'video',
      provider,
      text: prompt,
      imageUrl: startImageUrl,
      refId: startRefId || undefined,
      progress: 0,
    };
    params.store.update((s) => ({ ...s, streamMessages: [...s.streamMessages, pending].slice(-200) }));

    try {
      const created = await params.api.videoCreate({
        provider,
        prompt,
        model: model || undefined,
        seconds,
        aspect,
        size,
        mode,
        startImageUrl,
        endImageUrl,
      });
      if (created?.code !== 0) throw new Error(created?.description || '生视频提交失败');
      const id = String(created?.result?.id || '').trim();
      if (!id) throw new Error('生视频提交失败：未返回 id');

      params.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, taskId: id, progress: 1 } : m)),
      }));

      const ready = await pollVideoUntilReady({
        api: params.api,
        provider,
        id,
        onProgress: (p) => {
          params.store.update((s) => ({
            ...s,
            streamMessages: s.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, progress: p } : m)),
          }));
        },
      });

      params.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) =>
          m.id === aiMsgId
            ? { ...m, videoUrl: ready.videoUrl, thumbnailUrl: ready.thumbnailUrl, progress: 100 }
            : m
        ),
      }));
    } catch (error) {
      console.error('Video generate failed:', error);
      const msg = (error as Error)?.message || '生视频失败';
      showError(msg);
      params.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, error: msg } : m)),
      }));
    }
  }

  function setVisible(visible: boolean) {
    if (visible) {
      show(extraPanel);
      show(panel);
      const state = params.store.get();
      ensureValidState(state);
      refreshProviderLabel(state);
      renderSeconds(state);
      renderMode(state);
      renderAspectSize(state);
    } else {
      hide(panel);
    }
  }

  // initial render
  ensureValidState(params.store.get());
  refreshProviderLabel(params.store.get());
  rebuildRefSelects(params.store.get());
  renderSeconds(params.store.get());
  renderMode(params.store.get());
  renderAspectSize(params.store.get());
  params.store.subscribe((s) => {
    ensureValidState(s);
    refreshProviderLabel(s);
    rebuildRefSelects(s);
    renderSeconds(s);
    renderMode(s);
    renderAspectSize(s);
  });

  return { setVisible, generateVideoFromCurrentPrompt };
}

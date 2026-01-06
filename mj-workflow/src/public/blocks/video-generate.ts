import type { ApiClient } from '../adapters/api';
import { randomId } from '../atoms/id';
import { showError } from '../atoms/notify';
import { byId, hide, show } from '../atoms/ui';
import { createPopoverMenu } from '../atoms/popover-menu';
import { pollVideoUntilReady } from '../atoms/video-tasks';
import type { Store } from '../state/store';
import type { StreamMessage, VideoProvider, WorkflowState } from '../state/workflow';
import { isHttpUrl } from '../atoms/url';

function normalizeSpaces(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function createVideoGenerateBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const extraPanel = byId<HTMLElement>('commandExtraPanel');
  const panel = byId<HTMLElement>('commandVideoPanel');

  const providerBtn = byId<HTMLButtonElement>('videoProviderBtn');
  const providerMenu = byId<HTMLElement>('videoProviderMenu');
  const providerLabel = byId<HTMLElement>('videoProviderLabel');
  const modelInput = byId<HTMLInputElement>('videoModelInput');
  const secondsInput = byId<HTMLInputElement>('videoSecondsInput');
  const modeInput = byId<HTMLInputElement>('videoModeInput');
  const aspectInput = byId<HTMLInputElement>('videoAspectInput');
  const sizeInput = byId<HTMLInputElement>('videoSizeInput');
  const startBtn = byId<HTMLButtonElement>('videoStartRefBtn');
  const startLabel = byId<HTMLElement>('videoStartRefLabel');
  const startMenu = byId<HTMLElement>('videoStartRefMenu');
  const endBtn = byId<HTMLButtonElement>('videoEndRefBtn');
  const endLabel = byId<HTMLElement>('videoEndRefLabel');
  const endMenu = byId<HTMLElement>('videoEndRefMenu');

  const providerPopover = createPopoverMenu({ button: providerBtn, menu: providerMenu });
  const startPopover = createPopoverMenu({ button: startBtn, menu: startMenu });
  const endPopover = createPopoverMenu({ button: endBtn, menu: endMenu });

  function setProvider(next: VideoProvider) {
    params.store.update((s) => ({ ...s, videoProvider: next }));
  }

  function setDefaultsForProvider(provider: VideoProvider) {
    if (provider === 'jimeng') {
      if (!modelInput.value.trim()) modelInput.value = 'jimeng-video-3.0';
      if (!aspectInput.value.trim()) aspectInput.value = '16:9';
      if (!sizeInput.value.trim()) sizeInput.value = '1080P';
      secondsInput.value = '';
      secondsInput.placeholder = '固定/可忽略';
      secondsInput.disabled = true;
      modeInput.value = '';
      modeInput.placeholder = '（无）';
      modeInput.disabled = true;
      aspectInput.disabled = false;
      sizeInput.disabled = false;
    } else if (provider === 'kling') {
      if (!modelInput.value.trim()) modelInput.value = 'kling-v2-6';
      if (!secondsInput.value.trim()) secondsInput.value = '5';
      secondsInput.placeholder = '5 / 10';
      secondsInput.disabled = false;
      modeInput.disabled = false;
      if (!modeInput.value.trim()) modeInput.value = 'std';
      modeInput.placeholder = 'std / pro';
      aspectInput.value = '';
      sizeInput.value = '';
      aspectInput.placeholder = '（Kling 无该参数）';
      sizeInput.placeholder = '（Kling 无该参数）';
      aspectInput.disabled = true;
      sizeInput.disabled = true;
    } else {
      if (!modelInput.value.trim()) modelInput.value = 'gemini-video';
      secondsInput.placeholder = '可选';
      secondsInput.disabled = false;
      modeInput.value = '';
      modeInput.placeholder = '（可选）';
      modeInput.disabled = true;
      aspectInput.disabled = false;
      sizeInput.disabled = false;
    }
  }

  function readProvider(): VideoProvider {
    const fromStore = params.store.get().videoProvider;
    if (fromStore === 'jimeng' || fromStore === 'kling' || fromStore === 'gemini') return fromStore;
    return 'jimeng';
  }

  function refreshProviderLabel() {
    const provider = readProvider();
    providerLabel.textContent = provider === 'jimeng' ? 'Jimeng' : provider === 'kling' ? 'Kling' : 'Gemini（自定义模型）';
    providerMenu.querySelectorAll<HTMLElement>('[data-video-provider]').forEach((el) => {
      const v = String(el.dataset.videoProvider || '').trim();
      el.classList.toggle('bg-white/5', v === provider);
    });
    setDefaultsForProvider(provider);
  }

  providerMenu.querySelectorAll<HTMLButtonElement>('button[data-video-provider]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = String(btn.dataset.videoProvider || '').trim();
      if (v !== 'jimeng' && v !== 'kling' && v !== 'gemini') return;
      setProvider(v);
      refreshProviderLabel();
      persistInputs();
      providerPopover.close();
    });
  });

  function syncInputsFromStore(state: WorkflowState) {
    if (typeof state.videoModel === 'string' && state.videoModel.trim() && modelInput.value.trim() !== state.videoModel.trim()) {
      modelInput.value = state.videoModel.trim();
    }
    if (typeof state.videoAspect === 'string' && state.videoAspect.trim() && aspectInput.value.trim() !== state.videoAspect.trim()) {
      aspectInput.value = state.videoAspect.trim();
    }
    if (typeof state.videoSize === 'string' && state.videoSize.trim() && sizeInput.value.trim() !== state.videoSize.trim()) {
      sizeInput.value = state.videoSize.trim();
    }
    if (typeof state.videoSeconds === 'number' && Number.isFinite(state.videoSeconds) && !secondsInput.value.trim()) {
      secondsInput.value = String(state.videoSeconds);
    }
    if (typeof state.videoMode === 'string' && state.videoMode.trim() && !modeInput.value.trim()) {
      modeInput.value = state.videoMode.trim();
    }
  }

  function persistInputs() {
    const seconds = secondsInput.value.trim();
    const n = seconds ? Number(seconds) : undefined;
    params.store.update((s) => ({
      ...s,
      videoModel: modelInput.value.trim() || s.videoModel,
      videoAspect: aspectInput.value.trim() || undefined,
      videoSize: sizeInput.value.trim() || undefined,
      videoSeconds: seconds && Number.isFinite(n as any) ? Math.max(1, Math.floor(n!)) : undefined,
      videoMode: modeInput.value.trim() || undefined,
    }));
  }

  modelInput.addEventListener('input', () => persistInputs());
  secondsInput.addEventListener('input', () => persistInputs());
  modeInput.addEventListener('input', () => persistInputs());
  aspectInput.addEventListener('input', () => persistInputs());
  sizeInput.addEventListener('input', () => persistInputs());

  function rebuildRefSelects(state: WorkflowState) {
    const options = state.referenceImages
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, label: `${r.name || r.id}` }));

    const buildMenu = (menu: HTMLElement, which: 'start' | 'end') => {
      menu.innerHTML = '';
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
      menu.appendChild(none);

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
        menu.appendChild(btn);
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
    persistInputs();
    const state = params.store.get();

    const startRefId = state.videoStartRefId || '';
    const endRefId = state.videoEndRefId || '';
    const model = String(state.videoModel || modelInput.value || '').trim();
    const seconds = typeof state.videoSeconds === 'number' ? state.videoSeconds : undefined;
    const aspect = String(state.videoAspect || '').trim() || undefined;
    const size = String(state.videoSize || '').trim() || undefined;
    const mode = String(state.videoMode || modeInput.value || '').trim() || undefined;

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
    } else {
      hide(panel);
    }
  }

  // initial render
  refreshProviderLabel();
  rebuildRefSelects(params.store.get());
  syncInputsFromStore(params.store.get());
  params.store.subscribe((s) => {
    refreshProviderLabel();
    rebuildRefSelects(s);
    syncInputsFromStore(s);
  });

  return { setVisible, generateVideoFromCurrentPrompt };
}

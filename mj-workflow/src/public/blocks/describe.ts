import type { ApiClient } from '../adapters/api';
import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { pretty } from '../atoms/format';
import { byId, setDisabled, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import { pollTaskUntilFinalPrompt } from '../headless/tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../headless/upstream';

function tryPrefillPrompt(store: Store<WorkflowState>) {
  const prompt = store.get().prompt;
  if (!prompt) return;
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement | null;
  if (!promptInput) return;
  if (promptInput.value.trim()) return;
  promptInput.value = prompt;
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function getActiveImage(state: WorkflowState) {
  const id = state.activeImageId;
  if (id === '__none__') return undefined;
  const fromHistory = id ? state.referenceImages.find((r) => r.id === id) : undefined;
  const fallback = state.referenceImages.at(-1);
  return fromHistory || fallback;
}

function getActiveImagePayload(state: WorkflowState): { imageUrl?: string; base64?: string } {
  const r = getActiveImage(state);
  if (!r) return {};
  const cdnUrl = r?.cdnUrl || r?.url;
  if (cdnUrl && (cdnUrl.startsWith('http://') || cdnUrl.startsWith('https://'))) return { imageUrl: cdnUrl };
  if (r?.base64) return { base64: r.base64 };
  if (state.uploadedImageUrl && (state.uploadedImageUrl.startsWith('http://') || state.uploadedImageUrl.startsWith('https://'))) {
    return { imageUrl: state.uploadedImageUrl };
  }
  if (state.uploadedImageBase64) return { base64: state.uploadedImageBase64 };
  return {};
}

function getActiveImageDataUrl(state: WorkflowState): string {
  const r = getActiveImage(state);
  if (!r) return '';
  if (r?.dataUrl) return r.dataUrl;
  const cdnUrl = r?.cdnUrl || r?.url;
  if (cdnUrl && (cdnUrl.startsWith('http://') || cdnUrl.startsWith('https://'))) return cdnUrl;
  if (r?.base64) return `data:image/png;base64,${r.base64}`;
  if (state.uploadedImageDataUrl) return state.uploadedImageDataUrl;
  if (state.uploadedImageUrl) return state.uploadedImageUrl;
  if (state.uploadedImageBase64) return `data:image/png;base64,${state.uploadedImageBase64}`;
  return '';
}

function toAbsoluteIfLocalPath(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return url;
}

export function createDescribeBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const DEFAULT_VISION_PROMPT =
    '请根据图片内容反推一个适合 Midjourney 的英文 prompt。输出一行 prompt，不要解释；尽量包含主体、场景、风格、光照、镜头、构图、材质与细节。';

  function isBadImageErrorMessage(msg: string): boolean {
    const m = msg.toLowerCase();
    return (
      m.includes('unsupported image format') ||
      m.includes('non-image content-type') ||
      m.includes('fetch image failed') ||
      m.includes('图片文件扩展名与内容不匹配') ||
      m.includes('仅支持')
    );
  }

  async function cleanupActiveIfPossible(reason: string) {
    const s = params.store.get();
    const active = getActiveImage(s);
    if (!active?.localKey) return;

    const ok = confirm(`该图片可能已损坏/断链：\n${reason}\n\n是否删除这条历史记录并清理本地文件？`);
    if (!ok) return;

    try {
      const resp = await params.api.deleteUpload({ localKey: active.localKey });
      if (resp?.code !== 0) throw new Error(resp?.description || '删除失败');
    } catch (error) {
      console.error('cleanup deleteUpload failed:', error);
      showError((error as Error)?.message || '删除失败');
      return;
    }

    params.store.update((st) => {
      const nextRefs = st.referenceImages.filter((r) => r.id !== active.id);
      const nextSelected = st.selectedReferenceIds.filter((id) => id !== active.id);
      const nextActiveId = st.activeImageId === active.id ? nextRefs.at(-1)?.id : st.activeImageId;
      return { ...st, referenceImages: nextRefs, selectedReferenceIds: nextSelected, activeImageId: nextActiveId };
    });
  }

  async function describeImage() {
    const btn = byId<HTMLButtonElement>('describeBtn');
    setDisabled(btn, true);
    btn.innerHTML = '<span class="loading mr-2"></span>正在反推...';

    try {
      const s = params.store.get();
      const { imageUrl, base64 } = getActiveImagePayload(s);
      if (!imageUrl && !base64) throw new Error('请先从历史选择图片（或上传一张图片）');
      const data = await params.api.describe({ base64, imageUrl });

      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const taskId = getSubmitTaskId(data);
      if (!taskId) throw new Error(pretty(data) || '反推失败：未返回任务ID');

      const prompt = await pollTaskUntilFinalPrompt({
        api: params.api,
        taskId,
        onProgress: (n) => {
          btn.innerHTML = `<span class="loading mr-2"></span>反推中... ${n}%`;
        },
      });

      params.store.update((prev) => ({ ...prev, prompt }));
      byId<HTMLElement>('promptText').textContent = prompt;
      show(byId<HTMLElement>('describedPrompt'));
      show(byId<HTMLButtonElement>('step2Next'));
      tryPrefillPrompt(params.store);

      btn.innerHTML = '<i class="fas fa-check mr-2"></i>反推完成';
      return;
    } catch (error) {
      console.error('Describe error:', error);
      showError((error as Error)?.message || '反推提示词失败，请重试');
      setDisabled(btn, false);
      btn.innerHTML = 'Describe';
    }
  }

  async function describePrompt(engine: string) {
    if (engine === 'gemini') return await geminiDescribeImage();
    if (engine === 'mj') return await describeImage();
    if (engine.startsWith('vision:')) return await visionDescribeImage(engine.slice('vision:'.length) || undefined);
    return await geminiDescribeImage();
  }

  async function geminiDescribeImage() {
    const btn = byId<HTMLButtonElement>('describeBtn');
    setDisabled(btn, true);
    btn.innerHTML = '<span class="loading mr-2"></span>Gemini 反推中...';

    try {
      const s = params.store.get();
      const imageUrl = toAbsoluteIfLocalPath(getActiveImageDataUrl(s));
      if (!imageUrl) throw new Error('请先从历史选择图片（或上传一张图片）');

      const data = await params.api.geminiDescribe({ imageUrl });
      if (data.code === 0 && data.result?.prompt) {
        params.store.update((prev) => ({ ...prev, prompt: data.result.prompt }));

        byId<HTMLElement>('promptText').textContent = data.result.prompt;
        show(byId<HTMLElement>('describedPrompt'));
        show(byId<HTMLButtonElement>('step2Next'));
        tryPrefillPrompt(params.store);

        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Gemini 完成';
        return;
      }

      throw new Error([pretty(data.description), pretty(data.error)].filter(Boolean).join('\n') || 'Gemini 反推失败');
    } catch (error) {
      console.error('Gemini describe error:', error);
      const msg = (error as Error)?.message || 'Gemini 反推失败，请重试';
      if (isBadImageErrorMessage(msg)) await cleanupActiveIfPossible(msg);
      showError(msg);
      setDisabled(btn, false);
      btn.innerHTML = 'Describe';
    }
  }

  async function visionDescribeImage(model?: string) {
    const btn = byId<HTMLButtonElement>('describeBtn');
    setDisabled(btn, true);
    btn.innerHTML = '<span class="loading mr-2"></span>识图反推中...';

    try {
      const s = params.store.get();
      const active = getActiveImage(s);
      const imageUrl =
        active?.dataUrl ||
        active?.cdnUrl ||
        (active?.url && (active.url.startsWith('http://') || active.url.startsWith('https://') || active.url.startsWith('data:'))
          ? active.url
          : '');
      if (!imageUrl) throw new Error('请先从历史选择图片（或上传一张图片）');

      const data = await params.api.visionDescribe({
        imageUrl,
        question: DEFAULT_VISION_PROMPT,
        model,
      });

      if (data.code === 0 && data.result?.text) {
        params.store.update((prev) => ({ ...prev, prompt: data.result.text }));

        byId<HTMLElement>('promptText').textContent = data.result.text;
        show(byId<HTMLElement>('describedPrompt'));
        show(byId<HTMLButtonElement>('step2Next'));
        tryPrefillPrompt(params.store);

        btn.innerHTML = '<i class="fas fa-check mr-2"></i>识图反推完成';
        return;
      }

      throw new Error([pretty(data.description), pretty(data.error)].filter(Boolean).join('\n') || '识图失败');
    } catch (error) {
      console.error('Vision describe error:', error);
      showError((error as Error)?.message || '识图反推失败，请重试');
      setDisabled(btn, false);
      btn.innerHTML = 'Describe';
    }
  }

  return {
    describeImage,
    geminiDescribeImage,
    describePrompt,
    tryPrefillPrompt: () => tryPrefillPrompt(params.store),
  };
}

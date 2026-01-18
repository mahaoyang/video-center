import type { ApiClient } from '../adapters/api';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import type { Store } from '../state/store';
import type { MediaAsset, PostprocessOutput, ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';

function normalizeMultiline(text: string): string {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function safeFileName(name: string): string {
  const cleaned = String(name || '').trim().replace(/[^\w.-]+/g, '_');
  return cleaned || 'file';
}

function localKeyFromUploadsUrl(src: string): string | undefined {
  const raw = String(src || '').trim();
  const m = raw.match(/^\/uploads\/([^/?#]+)$/);
  if (!m) return undefined;
  const key = String(m[1] || '').trim();
  if (!key || key.includes('..') || key.includes('/')) return undefined;
  return key;
}

async function fileFromRef(ref: Pick<ReferenceImage, 'name' | 'dataUrl' | 'base64'>): Promise<File> {
  const dataUrl = String(ref.dataUrl || '').trim();
  const base64 = String(ref.base64 || '').trim();
  const src = dataUrl || (base64 ? `data:image/png;base64,${base64}` : '');
  if (!src.startsWith('data:')) throw new Error('该图片尚未缓存，无法上传（缺少 dataUrl/base64）');

  const res = await fetch(src);
  const blob = await res.blob();
  const mime = String(blob.type || '').trim() || 'image/png';

  const rawName = safeFileName(ref.name || 'image');
  const hasExt = /\.[a-z0-9]{2,10}$/i.test(rawName);
  const fileName = hasExt ? rawName : `${rawName}.png`;
  return new File([blob], fileName, { type: mime });
}

function pickBestUrl(ref: Pick<ReferenceImage, 'cdnUrl' | 'url' | 'localUrl' | 'localKey'>): string {
  const candidates = [ref.cdnUrl, ref.url, ref.localUrl].map((x) => String(x || '').trim()).filter(Boolean);
  for (const u of candidates) {
    if (!u.startsWith('data:')) return u;
  }
  const localKey = String(ref.localKey || '').trim();
  if (localKey) return `/uploads/${localKey}`;
  return '';
}

function pickAudioUrl(asset: Pick<MediaAsset, 'url' | 'localUrl' | 'localKey'>): string {
  const candidates = [asset.url, asset.localUrl].map((x) => String(x || '').trim()).filter(Boolean);
  for (const u of candidates) {
    if (!u.startsWith('data:')) return u;
  }
  const localKey = String(asset.localKey || '').trim();
  if (localKey) return `/uploads/${localKey}`;
  return '';
}

export function createPostprocessBlock(params: { api: ApiClient; store: Store<WorkflowState> }) {
  async function ensureImageUploaded(refId: string): Promise<ReferenceImage> {
    const current = params.store.get().referenceImages.find((r) => r.id === refId);
    if (!current) throw new Error('素材不存在');
    const hasLocalKey = typeof current.localKey === 'string' && current.localKey.trim();
    const url = pickBestUrl(current);
    const keyFromUrl = localKeyFromUploadsUrl(url);
    if (hasLocalKey || keyFromUrl) {
      if (!hasLocalKey && keyFromUrl) {
        params.store.update((s) => ({
          ...s,
          referenceImages: s.referenceImages.map((r) => (r.id === refId ? { ...r, localKey: keyFromUrl } : r)),
        }));
      }
      return params.store.get().referenceImages.find((r) => r.id === refId)!;
    }

    const file = await fileFromRef(current);
    const uploaded = await params.api.upload(file);
    const result = uploaded?.result;
    if (uploaded?.code !== 0) throw new Error(String(uploaded?.description || '上传失败'));

    params.store.update((s) => ({
      ...s,
      referenceImages: s.referenceImages.map((r) =>
        r.id === refId
          ? {
              ...r,
              url: typeof result?.url === 'string' ? result.url : r.url,
              cdnUrl: typeof result?.cdnUrl === 'string' ? result.cdnUrl : r.cdnUrl,
              localUrl: typeof result?.localUrl === 'string' ? result.localUrl : r.localUrl,
              localPath: typeof result?.localPath === 'string' ? result.localPath : r.localPath,
              localKey: typeof result?.localKey === 'string' ? result.localKey : r.localKey,
            }
          : r
      ),
    }));
    return params.store.get().referenceImages.find((r) => r.id === refId)!;
  }

  async function promoteImage(refId: string): Promise<{ url: string; name: string }> {
    const uploaded = await ensureImageUploaded(refId);
    const name = String(uploaded.name || 'image');
    if (typeof uploaded.cdnUrl === 'string' && uploaded.cdnUrl.trim()) {
      return { url: uploaded.cdnUrl, name };
    }
    const localKey = String(uploaded.localKey || '').trim() || localKeyFromUploadsUrl(pickBestUrl(uploaded)) || '';
    if (!localKey) {
      const fallback = pickBestUrl(uploaded);
      if (!fallback) throw new Error('图片缺少可用 URL');
      return { url: fallback, name };
    }

    try {
      const resp = await params.api.promoteUpload({ localKey });
      const result = resp?.result;
      if (resp?.code !== 0) throw new Error(String(resp?.description || '图床上传失败'));
      const cdnUrl = typeof result?.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const url = typeof result?.url === 'string' ? result.url : cdnUrl;
      if (url) {
        params.store.update((s) => ({
          ...s,
          referenceImages: s.referenceImages.map((r) => (r.id === refId ? { ...r, url, cdnUrl: cdnUrl || r.cdnUrl } : r)),
        }));
        return { url, name };
      }
      throw new Error('图床上传失败：缺少 url');
    } catch (e) {
      const fallback = pickBestUrl(uploaded);
      if (!fallback) throw e;
      return { url: fallback, name };
    }
  }

  function selectedAudioAsset(state: WorkflowState): MediaAsset | undefined {
    const id = typeof state.mvAudioAssetId === 'string' ? state.mvAudioAssetId : '';
    if (!id) return undefined;
    const asset = state.mediaAssets.find((a) => a.id === id);
    if (!asset || asset.kind !== 'audio') return undefined;
    return asset;
  }

  function selectedVideoAsset(state: WorkflowState): MediaAsset | undefined {
    const id = typeof state.mvVideoAssetId === 'string' ? state.mvVideoAssetId : '';
    if (!id) return undefined;
    const asset = state.mediaAssets.find((a) => a.id === id);
    if (!asset || asset.kind !== 'video') return undefined;
    return asset;
  }

  async function run() {
    const s0 = params.store.get();
    const refIds = Array.isArray(s0.selectedReferenceIds)
      ? s0.selectedReferenceIds.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24)
      : [];
    const audio = selectedAudioAsset(s0);
    const video = selectedVideoAsset(s0);

    if (!refIds.length && !audio && !video) {
      showError('请先在素材区选中需要后处理的图片/音频/视频（图片点击高亮；音频/视频点击选中）');
      return;
    }

    const msgId = randomId('msg');
    const totalSteps = refIds.length + (audio ? 1 : 0) + (video ? 1 : 0);
    let doneSteps = 0;

    function progressPercent(): number {
      if (!totalSteps) return 0;
      return Math.max(0, Math.min(99, Math.round((doneSteps / totalSteps) * 100)));
    }

    function updateCard(text: string) {
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) =>
          m.id === msgId ? { ...m, text: normalizeMultiline(text), progress: progressPercent() } : m
        ),
      }));
    }

    const pending: StreamMessage = {
      id: msgId,
      createdAt: Date.now(),
      role: 'ai',
      kind: 'postprocess',
      text: normalizeMultiline(`后处理中…\n图片: ${refIds.length}${audio ? `\n音频: 1` : ''}${video ? `\n视频: 1` : ''}`),
      progress: 0,
    };
    params.store.update((st) => ({
      ...st,
      traceHeadMessageId: msgId,
      streamMessages: [...st.streamMessages, pending].slice(-200),
    }));

    try {
      const outputs: PostprocessOutput[] = [];

      for (let i = 0; i < refIds.length; i++) {
        const refId = refIds[i]!;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n图片 ${i + 1}/${refIds.length}：上传到图床…`);
        const r = await promoteImage(refId);
        outputs.push({ kind: 'image', url: r.url, name: r.name });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n图片 ${i + 1}/${refIds.length}：完成（${r.name}）`);
      }

      if (audio) {
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n音频：响度归一化处理中…`);
        const src = pickAudioUrl(audio);
        if (!src) throw new Error('音频缺少可用 URL，请重新上传');
        const resp = await params.api.audioProcess({ src });
        const result = resp?.result;
        if (resp?.code !== 0) throw new Error(String(resp?.description || '音频后处理失败'));
        const url = typeof result?.outputUrl === 'string' ? result.outputUrl : '';
        if (!url) throw new Error('音频后处理失败：缺少 outputUrl');
        outputs.push({ kind: 'audio', url, name: String(audio.name || 'audio_pro') });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n音频：完成（${String(audio.name || 'audio')}）`);
      }

      if (video) {
        const preset = typeof s0.postVideoPreset === 'string' ? String(s0.postVideoPreset || '').trim() : '';
        const crf = typeof s0.postVideoCrf === 'number' && Number.isFinite(s0.postVideoCrf) ? s0.postVideoCrf : undefined;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n视频：${preset ? `应用 ${preset}…` : '处理中…'}`);
        const src = pickAudioUrl(video);
        if (!src) throw new Error('视频缺少可用 URL，请重新上传');
        const resp = await params.api.videoProcess({ src, preset: preset || undefined, crf: crf || undefined });
        const result = resp?.result;
        if (resp?.code !== 0) throw new Error(String(resp?.description || '视频后处理失败'));
        const url = typeof result?.outputUrl === 'string' ? result.outputUrl : '';
        if (!url) throw new Error('视频后处理失败：缺少 outputUrl');
        outputs.push({ kind: 'video', url, name: `${safeFileName(String(video.name || 'video'))}_post.mp4` });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n视频：完成（${String(video.name || 'video')}）`);
      }

      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) =>
          m.id === msgId ? { ...m, progress: 100, text: `后处理完成（${outputs.length} 个结果）`, postOutputs: outputs } : m
        ),
      }));
      showMessage(`后处理完成：${outputs.length} 个结果`);
    } catch (error) {
      const message = (error as Error)?.message || '后处理失败';
      console.error('postprocess error:', error);
      params.store.update((st) => ({
        ...st,
        streamMessages: st.streamMessages.map((m) => (m.id === msgId ? { ...m, error: message } : m)),
      }));
      showError(message);
    }
  }

  return { run };
}

import type { ApiClient } from '../adapters/api';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import type { Store } from '../state/store';
import type { MediaAsset, PostprocessOutput, ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';
import { readSelectedMediaAssetIds, readSelectedReferenceIds } from '../state/material';

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
  const candidates = [ref.localUrl, ref.url, ref.cdnUrl].map((x) => String(x || '').trim()).filter(Boolean);
  for (const u of candidates) {
    if (!u.startsWith('data:')) return u;
  }
  const localKey = String(ref.localKey || '').trim();
  if (localKey) return `/uploads/${localKey}`;
  return '';
}

function pickMediaUrl(asset: Pick<MediaAsset, 'url' | 'localUrl' | 'localKey'>): string {
  const candidates = [asset.localUrl, asset.url].map((x) => String(x || '').trim()).filter(Boolean);
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

  async function getImageOutputUrl(refId: string): Promise<{ url: string; name: string }> {
    const current = params.store.get().referenceImages.find((r) => r.id === refId);
    if (!current) throw new Error('素材不存在');

    const name = String(current.name || 'image');

    // Short-circuit: if we already have a usable URL (local or remote), don't upload/promote.
    const direct = pickBestUrl(current);
    if (direct && !direct.startsWith('data:')) return { url: direct, name };

    // If the image only exists in-memory (dataUrl/base64), cache it to local /uploads once.
    const uploaded = await ensureImageUploaded(refId);
    const local = pickBestUrl(uploaded);
    if (!local) throw new Error('图片缺少可用 URL');
    return { url: local, name };
  }

function selectedPostAssets(state: WorkflowState): { audios: MediaAsset[]; videos: MediaAsset[] } {
  const ids = readSelectedMediaAssetIds(state, 36);
  const audios: MediaAsset[] = [];
  const videos: MediaAsset[] = [];
  for (const id of ids) {
    const asset = state.mediaAssets.find((a) => a.id === id);
    if (!asset) continue;
    if (asset.kind === 'audio') audios.push(asset);
    if (asset.kind === 'video') videos.push(asset);
  }
  return { audios, videos };
}

  async function run() {
    const s0 = params.store.get();
    const refIds = readSelectedReferenceIds(s0, 24);
    const selected = selectedPostAssets(s0);
    const audios = selected.audios;
    const videos = selected.videos;

    if (!refIds.length && !audios.length && !videos.length) {
      showError('请先在素材区选中需要后处理的图片/音频/视频（均支持多选）');
      return;
    }

    const msgId = randomId('msg');
    const totalSteps = refIds.length + audios.length + videos.length;
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
      text: normalizeMultiline(`后处理中…\n图片: ${refIds.length}\n音频: ${audios.length}\n视频: ${videos.length}`),
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
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n图片 ${i + 1}/${refIds.length}：准备素材…`);
        const r = await getImageOutputUrl(refId);
        outputs.push({ kind: 'image', url: r.url, name: r.name });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n图片 ${i + 1}/${refIds.length}：完成（${r.name}）`);
      }

      for (let i = 0; i < audios.length; i++) {
        const audio = audios[i]!;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n音频 ${i + 1}/${audios.length}：响度归一化处理中…`);
        const src = pickMediaUrl(audio);
        if (!src) throw new Error('音频缺少可用 URL，请重新上传');
        const resp = await params.api.audioProcess({ src });
        const result = resp?.result;
        if (resp?.code !== 0) throw new Error(String(resp?.description || '音频后处理失败'));
        const url = typeof result?.outputUrl === 'string' ? result.outputUrl : '';
        if (!url) throw new Error('音频后处理失败：缺少 outputUrl');
        outputs.push({ kind: 'audio', url, name: String(audio.name || 'audio_pro') });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n音频 ${i + 1}/${audios.length}：完成（${String(audio.name || 'audio')}）`);
      }

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i]!;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n视频 ${i + 1}/${videos.length}：自动优化处理中…`);
        const src = pickMediaUrl(video);
        if (!src) throw new Error('视频缺少可用 URL，请重新上传');
        const resp = await params.api.videoProcess({ src });
        const result = resp?.result;
        if (resp?.code !== 0) throw new Error(String(resp?.description || '视频后处理失败'));
        const url = typeof result?.outputUrl === 'string' ? result.outputUrl : '';
        if (!url) throw new Error('视频后处理失败：缺少 outputUrl');
        outputs.push({ kind: 'video', url, name: `${safeFileName(String(video.name || 'video'))}_post.mp4` });
        doneSteps += 1;
        updateCard(`后处理中…（${doneSteps}/${totalSteps}）\n视频 ${i + 1}/${videos.length}：完成（${String(video.name || 'video')}）`);
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

import type { Store } from '../store';
import type { MediaAsset, WorkflowState } from '../workflow';
import { randomId } from '../../atoms/id';
import type { BuiltMvComposePayload, MvComposeParams } from './types';
import { pickLastSelectedMediaAssetId, readSelectedMediaAssetIds, readSelectedReferenceIds } from '../material';

export function findAsset(state: WorkflowState, id: string | undefined): MediaAsset | undefined {
  if (!id) return undefined;
  return state.mediaAssets.find((a) => a.id === id);
}

function pickSelectedAsset(state: WorkflowState, kind: 'video' | 'audio' | 'subtitle'): MediaAsset | undefined {
  const id = pickLastSelectedMediaAssetId(state, kind);
  return id ? findAsset(state, id) : undefined;
}

export function ensureMvComposeDefaults(store: Store<WorkflowState>, state: WorkflowState) {
  const patch: Partial<WorkflowState> = {};
  if (!Array.isArray(state.mediaAssets)) patch.mediaAssets = [];
  if (!Array.isArray(state.mvSequence)) patch.mvSequence = [];
  if (!(typeof state.mvResolution === 'string' && state.mvResolution.trim())) patch.mvResolution = '1280x720';
  if (!(typeof state.mvFps === 'number' && Number.isFinite(state.mvFps) && state.mvFps > 0)) patch.mvFps = 25;
  if (!(typeof state.mvDurationSeconds === 'number' && Number.isFinite(state.mvDurationSeconds) && state.mvDurationSeconds > 0)) {
    patch.mvDurationSeconds = 5;
  }
  if (!(state.mvSubtitleMode === 'soft' || state.mvSubtitleMode === 'burn')) patch.mvSubtitleMode = 'soft';
  if (!(state.mvAction === 'clip' || state.mvAction === 'mv')) patch.mvAction = 'mv';
  if (Object.keys(patch).length) store.update((s) => ({ ...s, ...patch }));
}

export function addOutputVideoAsset(store: Store<WorkflowState>, outputUrl: string) {
  const url = String(outputUrl || '').trim();
  if (!url) return;
  store.update((s) => {
    const mediaAssets = Array.isArray(s.mediaAssets) ? s.mediaAssets.slice() : [];
    const existing = mediaAssets.find((a) => a.kind === 'video' && (a.localUrl === url || a.url === url));
    if (existing) {
      return {
        ...s,
        mediaAssets: mediaAssets.slice(-120),
        selectedMediaAssetIds: Array.from(new Set([...readSelectedMediaAssetIds(s, 36), existing.id])).slice(0, 36),
      };
    }
    const key = url.split('/').pop() || 'output.mp4';
    const assetId = randomId('asset');
    mediaAssets.push({ id: assetId, kind: 'video', name: key, createdAt: Date.now(), url, localUrl: url });
    return {
      ...s,
      mediaAssets: mediaAssets.slice(-120),
      selectedMediaAssetIds: Array.from(new Set([...readSelectedMediaAssetIds(s, 36), assetId])).slice(0, 36),
    };
  });
}

export function buildMvComposePayload(ctx: {
  store: Store<WorkflowState>;
  promptInput: HTMLTextAreaElement;
}): BuiltMvComposePayload {
  const state = ctx.store.get();
  ensureMvComposeDefaults(ctx.store, state);

  const text = String(ctx.promptInput.value || '').trim();
  const selectedRefIds = readSelectedReferenceIds(state, 24);
  const videoAsset = pickSelectedAsset(state, 'video');
  const audioAsset = pickSelectedAsset(state, 'audio');
  const subtitleAsset = pickSelectedAsset(state, 'subtitle');
  const subtitleText = subtitleAsset?.kind === 'subtitle' && typeof subtitleAsset.text === 'string' ? subtitleAsset.text : '';
  const action = state.mvAction === 'clip' ? 'clip' : 'mv';

  if (!videoAsset && selectedRefIds.length === 0) {
    throw new Error('请先在上方素材区选择至少 1 张图片，或选择一个视频素材');
  }

  const inputImageUrls = selectedRefIds
    .map((refId) => {
      const ref = state.referenceImages.find((r) => r.id === refId);
      return ref?.cdnUrl || ref?.url || ref?.localUrl || undefined;
    })
    .filter(Boolean) as string[];

  const payload: MvComposeParams = {
    text: text || undefined,
    resolution: state.mvResolution || undefined,
    fps: typeof state.mvFps === 'number' ? state.mvFps : undefined,
    durationSeconds: typeof state.mvDurationSeconds === 'number' ? state.mvDurationSeconds : undefined,
    subtitleMode: state.mvSubtitleMode || undefined,
    action,
    visualSequence: selectedRefIds
      .map((refId) => {
        const ref = state.referenceImages.find((r) => r.id === refId);
        const url = ref?.cdnUrl || ref?.url || ref?.localUrl || '';
        return url ? { url } : null;
      })
      .filter(Boolean) as any,
    videoUrl: videoAsset?.localUrl || videoAsset?.url,
    audioUrl: action === 'mv' ? (audioAsset?.localUrl || audioAsset?.url) : undefined,
    subtitleSrt: action === 'mv' ? (subtitleText || undefined) : undefined,
  };

  return { state, text, selectedRefIds, inputImageUrls, action, videoAsset, audioAsset, subtitleAsset, payload };
}

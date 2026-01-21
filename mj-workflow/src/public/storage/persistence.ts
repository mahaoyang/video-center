import type { Store } from '../state/store';
import type { MediaAsset, PlannerMessage, ReferenceImage, StreamMessage, WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { randomId } from '../atoms/id';
import { readSelectedMediaAssetIds, readSelectedReferenceIds } from '../state/material';

const STORAGE_KEY = 'mj-workflow:persist:v1';

type Persisted = {
  version: 1;
  history: Array<{
    id: string;
    createdAt: number;
    prompt: string;
    taskId: string;
    gridImageUrl?: string;
    references: Array<{ id: string; name: string; createdAt: number; url?: string; cdnUrl?: string; localUrl?: string }>;
    upscaledImages: string[];
  }>;
  referenceLibrary: Array<{
    id: string;
    name: string;
    createdAt: number;
    originKey?: string;
    producedByMessageId?: string;
    url: string;
    cdnUrl?: string;
    localUrl?: string;
    localPath?: string;
    localKey?: string;
  }>;
  selectedReferenceIds: string[];
  // Legacy (deprecated): previous postprocess-only selection buffer for images.
  postSelectedReferenceIds?: string[];
  mjPadRefIds?: string[];
  mjPadRefId?: string;
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;
  mjSrefRefId?: string;
  mjCrefRefId?: string;
  activeImageId?: string;
  streamMessages?: Array<{
    id: string;
    createdAt: number;
    role: string;
    kind: string;
    text?: string;
    imageUrl?: string;
    refId?: string;
    refIds?: string[];
    parentMessageId?: string;
    taskId?: string;
    gridImageUrl?: string;
    upscaledImageUrl?: string;
    peditImageUrl?: string;
    peditImageUrls?: string[];
    inputImageUrls?: string[];
    videoUrl?: string;
    thumbnailUrl?: string;
    provider?: string;
    progress?: number;
    error?: string;
    postOutputs?: Array<{ kind: string; url: string; name?: string }>;

    userPrompt?: string;
    mjPadRefIds?: string[];
    mjPadRefId?: string;
    mjSrefRefId?: string;
    mjCrefRefId?: string;
    mjSrefImageUrl?: string;
    mjCrefImageUrl?: string;
    upscaleSourceTaskId?: string;
    upscaleIndex?: number;
    gimageAspect?: string;
    gimageSize?: string;
    outputRefIds?: string[];
    videoModel?: string;
    videoSeconds?: number;
    videoMode?: string;
    videoAspect?: string;
    videoSize?: string;
    videoStartRefId?: string;
    videoEndRefId?: string;

    mvResolution?: string;
    mvFps?: number;
    mvDurationSeconds?: number;
    mvSubtitleMode?: string;
    mvVisualRefIds?: string[];
    mvVideoUrl?: string;
    mvAudioUrl?: string;
    mvSubtitleSrt?: string;
  }>;
  plannerMessages?: Array<{
    id: string;
    createdAt: number;
    role: string;
    text: string;
  }>;

  mediaAssets?: Array<{
    id: string;
    kind: string;
    name: string;
    createdAt: number;
    originKey?: string;
    url?: string;
    localUrl?: string;
    localPath?: string;
    localKey?: string;
    text?: string;
  }>;
  selectedMediaAssetIds?: string[];

  // MV sequence (preferred, ordered)
  mvSequence?: Array<{ refId: string; durationSeconds?: number }>;
  // Legacy: only order (no durations)
  mvVisualRefIds?: string[];

  commandMode?: string;
  sunoMode?: string;
  sunoLanguage?: string;
  beautifyHint?: string;
  postVideoPreset?: string;
  postVideoCrf?: number;
  gimageAspect?: string;
  gimageSize?: string;
  videoProvider?: string;
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;

  // Legacy (deprecated): MV-only single selection fields.
  mvVideoAssetId?: string;
  mvAudioAssetId?: string;
  mvSubtitleAssetId?: string;
  mvSubtitleText?: string;
  mvText?: string;
  mvResolution?: string;
  mvFps?: number;
  mvDurationSeconds?: number;
  mvSubtitleMode?: string;
  mvAction?: string;

  desktopHiddenStreamMessageIds?: string[];
  desktopHiddenPlannerMessageIds?: string[];
  traceHeadMessageId?: string;
};

function safeParse(jsonText: string | null): Persisted | null {
  if (!jsonText) return null;
  try {
    const obj = JSON.parse(jsonText);
    if (!obj || obj.version !== 1) return null;
    return obj as Persisted;
  } catch {
    return null;
  }
}

function toPersisted(state: WorkflowState): Persisted {
  const referenceLibrary = state.referenceImages
    .filter((r) => typeof r.url === 'string' && r.url)
    .map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      originKey: typeof r.originKey === 'string' ? r.originKey : undefined,
      producedByMessageId: typeof r.producedByMessageId === 'string' ? r.producedByMessageId : undefined,
      url: r.url!,
      cdnUrl: r.cdnUrl,
      localUrl: r.localUrl,
      localPath: r.localPath,
      localKey: r.localKey,
    }));

  return {
    version: 1,
    history: state.history.slice(-30).map((h) => ({
      id: h.id,
      createdAt: h.createdAt,
      prompt: h.prompt,
      taskId: h.taskId,
      gridImageUrl: h.gridImageUrl,
      references: h.references.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        url: r.url,
        cdnUrl: (r as any).cdnUrl,
        localUrl: (r as any).localUrl,
      })),
      upscaledImages: h.upscaledImages.slice(-10),
    })),
    referenceLibrary: referenceLibrary.slice(-40),
    selectedReferenceIds: readSelectedReferenceIds(state, 24),
    mjPadRefIds: Array.isArray(state.mjPadRefIds) ? state.mjPadRefIds.slice(0, 12) : [],
    // Back-compat: keep legacy single field as the first PAD ref (if any).
    mjPadRefId: Array.isArray(state.mjPadRefIds) && state.mjPadRefIds.length ? state.mjPadRefIds[0] : undefined,
    mjSrefImageUrl: state.mjSrefImageUrl,
    mjCrefImageUrl: state.mjCrefImageUrl,
    mjSrefRefId: state.mjSrefRefId,
    mjCrefRefId: state.mjCrefRefId,
    activeImageId: state.activeImageId,
    streamMessages: state.streamMessages.slice(-200).map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      role: m.role,
      kind: m.kind,
      text: m.text,
      imageUrl: typeof m.imageUrl === 'string' && m.imageUrl.startsWith('data:') ? undefined : m.imageUrl,
      refId: m.refId,
      refIds: Array.isArray(m.refIds) ? m.refIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 12) : undefined,
      parentMessageId: typeof m.parentMessageId === 'string' ? m.parentMessageId : undefined,
      taskId: m.taskId,
      gridImageUrl: m.gridImageUrl,
      upscaledImageUrl: m.upscaledImageUrl,
      peditImageUrl: m.peditImageUrl,
      peditImageUrls: Array.isArray(m.peditImageUrls) ? m.peditImageUrls.slice(0, 6) : undefined,
      inputImageUrls: Array.isArray(m.inputImageUrls) ? m.inputImageUrls.slice(0, 12) : undefined,
      videoUrl: m.videoUrl,
      thumbnailUrl: m.thumbnailUrl,
      provider: m.provider,
      progress: typeof m.progress === 'number' ? m.progress : undefined,
      error: typeof m.error === 'string' ? m.error : undefined,
      postOutputs: Array.isArray((m as any).postOutputs)
        ? (m as any).postOutputs
            .map((it: any) => ({
              kind: it?.kind === 'audio' ? 'audio' : 'image',
              url: String(it?.url || '').trim(),
              name: typeof it?.name === 'string' ? it.name : undefined,
            }))
            .filter((it: any) => Boolean(it.url))
            .slice(0, 24)
        : undefined,

      userPrompt: typeof m.userPrompt === 'string' && m.userPrompt.trim() ? m.userPrompt.trim() : undefined,
      mjPadRefIds: Array.isArray((m as any).mjPadRefIds)
        ? (m as any).mjPadRefIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(0, 12)
        : typeof (m as any).mjPadRefId === 'string'
          ? [String((m as any).mjPadRefId).trim()].filter(Boolean)
          : undefined,
      mjPadRefId: typeof m.mjPadRefId === 'string' ? m.mjPadRefId : undefined,
      mjSrefRefId: typeof m.mjSrefRefId === 'string' ? m.mjSrefRefId : undefined,
      mjCrefRefId: typeof m.mjCrefRefId === 'string' ? m.mjCrefRefId : undefined,
      mjSrefImageUrl: typeof m.mjSrefImageUrl === 'string' ? m.mjSrefImageUrl : undefined,
      mjCrefImageUrl: typeof m.mjCrefImageUrl === 'string' ? m.mjCrefImageUrl : undefined,
      upscaleSourceTaskId: typeof m.upscaleSourceTaskId === 'string' ? m.upscaleSourceTaskId : undefined,
      upscaleIndex: typeof m.upscaleIndex === 'number' ? m.upscaleIndex : undefined,
      gimageAspect: typeof m.gimageAspect === 'string' ? m.gimageAspect : undefined,
      gimageSize: typeof m.gimageSize === 'string' ? m.gimageSize : undefined,
      outputRefIds: Array.isArray(m.outputRefIds)
        ? m.outputRefIds.map((id) => String(id || '')).filter(Boolean).slice(0, 12)
        : undefined,
      videoModel: typeof m.videoModel === 'string' ? m.videoModel : undefined,
      videoSeconds: typeof m.videoSeconds === 'number' ? m.videoSeconds : undefined,
      videoMode: typeof m.videoMode === 'string' ? m.videoMode : undefined,
      videoAspect: typeof m.videoAspect === 'string' ? m.videoAspect : undefined,
      videoSize: typeof m.videoSize === 'string' ? m.videoSize : undefined,
      videoStartRefId: typeof m.videoStartRefId === 'string' ? m.videoStartRefId : undefined,
      videoEndRefId: typeof m.videoEndRefId === 'string' ? m.videoEndRefId : undefined,

      mvResolution: typeof m.mvResolution === 'string' ? m.mvResolution : undefined,
      mvFps: typeof m.mvFps === 'number' ? m.mvFps : undefined,
      mvDurationSeconds: typeof m.mvDurationSeconds === 'number' ? m.mvDurationSeconds : undefined,
      mvSubtitleMode: typeof m.mvSubtitleMode === 'string' ? m.mvSubtitleMode : undefined,
      mvSequence: Array.isArray((m as any).mvSequence)
        ? (m as any).mvSequence
            .map((it: any) => ({
              refId: String(it?.refId || '').trim(),
              durationSeconds: typeof it?.durationSeconds === 'number' ? it.durationSeconds : undefined,
            }))
            .filter((it: any) => Boolean(it.refId))
            .slice(0, 24)
        : undefined,
      mvVideoUrl: typeof m.mvVideoUrl === 'string' ? m.mvVideoUrl : undefined,
      mvAudioUrl: typeof m.mvAudioUrl === 'string' ? m.mvAudioUrl : undefined,
      mvSubtitleSrt: typeof m.mvSubtitleSrt === 'string' ? m.mvSubtitleSrt : undefined,
      mvAction: typeof (m as any).mvAction === 'string' ? (m as any).mvAction : undefined,
    })),
    plannerMessages: state.plannerMessages.slice(-200).map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      role: m.role,
      text: m.text,
    })),
    mediaAssets: state.mediaAssets.slice(-80).map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      createdAt: a.createdAt,
      originKey: typeof a.originKey === 'string' ? a.originKey : undefined,
      url: typeof a.url === 'string' ? a.url : undefined,
      localUrl: typeof a.localUrl === 'string' ? a.localUrl : undefined,
      localPath: typeof a.localPath === 'string' ? a.localPath : undefined,
      localKey: typeof a.localKey === 'string' ? a.localKey : undefined,
      text: typeof a.text === 'string' ? a.text : undefined,
    })),
    selectedMediaAssetIds: readSelectedMediaAssetIds(state, 36),
    desktopHiddenStreamMessageIds: Array.isArray(state.desktopHiddenStreamMessageIds)
      ? state.desktopHiddenStreamMessageIds.map((id) => String(id || '').trim()).filter(Boolean).slice(-400)
      : [],
    desktopHiddenPlannerMessageIds: Array.isArray((state as any).desktopHiddenPlannerMessageIds)
      ? (state as any).desktopHiddenPlannerMessageIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(-400)
      : [],
    commandMode: state.commandMode,
    sunoMode: typeof (state as any).sunoMode === 'string' ? (state as any).sunoMode : undefined,
    sunoLanguage: typeof (state as any).sunoLanguage === 'string' ? (state as any).sunoLanguage : undefined,
    beautifyHint: typeof state.beautifyHint === 'string' && state.beautifyHint.trim() ? state.beautifyHint.trim() : undefined,
    postVideoPreset: typeof state.postVideoPreset === 'string' && state.postVideoPreset.trim() ? state.postVideoPreset.trim() : undefined,
    postVideoCrf: typeof state.postVideoCrf === 'number' && Number.isFinite(state.postVideoCrf) ? state.postVideoCrf : undefined,
    gimageAspect: state.gimageAspect,
    gimageSize: state.gimageSize,
    videoProvider: state.videoProvider,
    videoModel: state.videoModel,
    videoSeconds: state.videoSeconds,
    videoMode: state.videoMode,
    videoAspect: state.videoAspect,
    videoSize: state.videoSize,
    videoStartRefId: state.videoStartRefId,
    videoEndRefId: state.videoEndRefId,
    mvSubtitleText: typeof state.mvSubtitleText === 'string' ? state.mvSubtitleText : undefined,
    mvText: typeof state.mvText === 'string' ? state.mvText : undefined,
    mvResolution: typeof state.mvResolution === 'string' ? state.mvResolution : undefined,
    mvFps: typeof state.mvFps === 'number' ? state.mvFps : undefined,
    mvDurationSeconds: typeof state.mvDurationSeconds === 'number' ? state.mvDurationSeconds : undefined,
    mvSubtitleMode: typeof state.mvSubtitleMode === 'string' ? state.mvSubtitleMode : undefined,
    mvAction: typeof state.mvAction === 'string' ? state.mvAction : undefined,
    mvSequence: Array.isArray(state.mvSequence)
      ? state.mvSequence
          .map((it) => ({ refId: String(it.refId || '').trim(), durationSeconds: typeof it.durationSeconds === 'number' ? it.durationSeconds : undefined }))
          .filter((it) => Boolean(it.refId))
          .slice(0, 24)
      : [],
    mvVisualRefIds: Array.isArray(state.mvSequence)
      ? state.mvSequence.map((it) => String(it.refId || '').trim()).filter(Boolean).slice(0, 24)
      : [],
    traceHeadMessageId: typeof state.traceHeadMessageId === 'string' ? state.traceHeadMessageId : undefined,
  };
}

export function loadPersistedState(): {
  history: WorkflowHistoryItem[];
  referenceImages: ReferenceImage[];
  selectedReferenceIds: string[];
  mjPadRefIds: string[];
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;
  mjSrefRefId?: string;
  mjCrefRefId?: string;
  activeImageId?: string;
  streamMessages: StreamMessage[];
  plannerMessages: PlannerMessage[];
  mediaAssets: MediaAsset[];
  selectedMediaAssetIds: string[];
  desktopHiddenStreamMessageIds: string[];
  desktopHiddenPlannerMessageIds: string[];
  commandMode?: string;
  sunoMode?: string;
  sunoLanguage?: string;
  beautifyHint?: string;
  postVideoPreset?: string;
  postVideoCrf?: number;
  gimageAspect?: string;
  gimageSize?: string;
  videoProvider?: string;
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;
  mvSequence?: Array<{ refId: string; durationSeconds?: number }>;
  mvSubtitleText?: string;
  mvText?: string;
  mvResolution?: string;
  mvFps?: number;
  mvDurationSeconds?: number;
  mvSubtitleMode?: string;
  mvAction?: string;
  traceHeadMessageId?: string;
} {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!parsed)
    return {
      history: [],
      referenceImages: [],
      selectedReferenceIds: [],
      mjPadRefIds: [],
      streamMessages: [],
      plannerMessages: [],
      mediaAssets: [],
      selectedMediaAssetIds: [],
      desktopHiddenStreamMessageIds: [],
      desktopHiddenPlannerMessageIds: [],
    };

  const referenceImages: ReferenceImage[] = parsed.referenceLibrary.map((r: any) => ({
    id: r.id || randomId('ref'),
    name: r.name || 'reference',
    createdAt: r.createdAt || Date.now(),
    originKey: typeof r.originKey === 'string' ? r.originKey : undefined,
    producedByMessageId: typeof r.producedByMessageId === 'string' ? r.producedByMessageId : undefined,
    url: r.url,
    cdnUrl: typeof r.cdnUrl === 'string' ? r.cdnUrl : undefined,
    localUrl: typeof r.localUrl === 'string' ? r.localUrl : undefined,
    localPath: typeof r.localPath === 'string' ? r.localPath : undefined,
    localKey: typeof r.localKey === 'string' ? r.localKey : undefined,
  }));

  const history: WorkflowHistoryItem[] = parsed.history.map((h) => ({
    id: h.id || randomId('hist'),
    createdAt: h.createdAt || Date.now(),
    prompt: h.prompt || '',
    taskId: h.taskId || '',
    gridImageUrl: h.gridImageUrl,
    references: (h.references || []).map((r: any) => ({
      id: r.id || randomId('ref'),
      name: r.name || 'reference',
      createdAt: r.createdAt || Date.now(),
      url: typeof r.url === 'string' ? r.url : undefined,
      cdnUrl: typeof r.cdnUrl === 'string' ? r.cdnUrl : undefined,
      localUrl: typeof r.localUrl === 'string' ? r.localUrl : undefined,
    })),
    upscaledImages: h.upscaledImages || [],
  }));

  const streamMessages: StreamMessage[] = (parsed.streamMessages || [])
    .map((m: any) => ({
      id: m.id || randomId('msg'),
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      role: m.role === 'ai' ? 'ai' : 'user',
      kind:
        m.kind === 'generate' || m.kind === 'upscale' || m.kind === 'deconstruct' || m.kind === 'pedit' || m.kind === 'video' || m.kind === 'postprocess' || m.kind === 'suno' || m.kind === 'youtube'
          ? m.kind
          : 'generate',
      text: typeof m.text === 'string' ? m.text : undefined,
      imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : undefined,
      refId: typeof m.refId === 'string' ? m.refId : undefined,
      refIds: Array.isArray(m.refIds) ? m.refIds.map((id: any) => String(id || '')).filter(Boolean).slice(0, 12) : undefined,
      parentMessageId: typeof m.parentMessageId === 'string' ? m.parentMessageId : undefined,
      taskId: typeof m.taskId === 'string' ? m.taskId : undefined,
      gridImageUrl: typeof m.gridImageUrl === 'string' ? m.gridImageUrl : undefined,
      upscaledImageUrl: typeof m.upscaledImageUrl === 'string' ? m.upscaledImageUrl : undefined,
      peditImageUrl: typeof m.peditImageUrl === 'string' ? m.peditImageUrl : undefined,
      peditImageUrls: Array.isArray(m.peditImageUrls)
        ? m.peditImageUrls.map((u: any) => String(u || '')).filter(Boolean).slice(0, 6)
        : undefined,
      inputImageUrls: Array.isArray(m.inputImageUrls)
        ? m.inputImageUrls.map((u: any) => String(u || '')).filter(Boolean).slice(0, 12)
        : undefined,
      videoUrl: typeof m.videoUrl === 'string' ? m.videoUrl : undefined,
      thumbnailUrl: typeof m.thumbnailUrl === 'string' ? m.thumbnailUrl : undefined,
      provider: typeof m.provider === 'string' ? m.provider : undefined,
      progress: typeof m.progress === 'number' ? m.progress : undefined,
      error: typeof m.error === 'string' ? m.error : undefined,
      postOutputs: Array.isArray(m.postOutputs)
        ? m.postOutputs
            .map((it: any) => ({
              kind: it?.kind === 'audio' ? 'audio' : 'image',
              url: String(it?.url || '').trim(),
              name: typeof it?.name === 'string' ? it.name : undefined,
            }))
            .filter((it: any) => Boolean(it.url))
            .slice(0, 24)
        : undefined,

      userPrompt: typeof m.userPrompt === 'string' ? m.userPrompt : undefined,
      mjPadRefIds: Array.isArray(m.mjPadRefIds)
        ? m.mjPadRefIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(0, 12)
        : typeof m.mjPadRefId === 'string'
          ? [String(m.mjPadRefId).trim()].filter(Boolean)
          : undefined,
      mjPadRefId: typeof m.mjPadRefId === 'string' ? m.mjPadRefId : undefined,
      mjSrefRefId: typeof m.mjSrefRefId === 'string' ? m.mjSrefRefId : undefined,
      mjCrefRefId: typeof m.mjCrefRefId === 'string' ? m.mjCrefRefId : undefined,
      mjSrefImageUrl: typeof m.mjSrefImageUrl === 'string' ? m.mjSrefImageUrl : undefined,
      mjCrefImageUrl: typeof m.mjCrefImageUrl === 'string' ? m.mjCrefImageUrl : undefined,
      upscaleSourceTaskId: typeof m.upscaleSourceTaskId === 'string' ? m.upscaleSourceTaskId : undefined,
      upscaleIndex: typeof m.upscaleIndex === 'number' ? m.upscaleIndex : undefined,
      gimageAspect: typeof m.gimageAspect === 'string' ? m.gimageAspect : undefined,
      gimageSize: typeof m.gimageSize === 'string' ? m.gimageSize : undefined,
      outputRefIds: Array.isArray(m.outputRefIds)
        ? m.outputRefIds.map((id: any) => String(id || '')).filter(Boolean).slice(0, 12)
        : undefined,
      videoModel: typeof m.videoModel === 'string' ? m.videoModel : undefined,
      videoSeconds: typeof m.videoSeconds === 'number' ? m.videoSeconds : undefined,
      videoMode: typeof m.videoMode === 'string' ? m.videoMode : undefined,
      videoAspect: typeof m.videoAspect === 'string' ? m.videoAspect : undefined,
      videoSize: typeof m.videoSize === 'string' ? m.videoSize : undefined,
      videoStartRefId: typeof m.videoStartRefId === 'string' ? m.videoStartRefId : undefined,
      videoEndRefId: typeof m.videoEndRefId === 'string' ? m.videoEndRefId : undefined,

      mvResolution: typeof m.mvResolution === 'string' ? m.mvResolution : undefined,
      mvFps: typeof m.mvFps === 'number' ? m.mvFps : undefined,
      mvDurationSeconds: typeof m.mvDurationSeconds === 'number' ? m.mvDurationSeconds : undefined,
      mvSubtitleMode: typeof m.mvSubtitleMode === 'string' ? m.mvSubtitleMode : undefined,
      mvVisualRefIds: Array.isArray(m.mvVisualRefIds)
        ? m.mvVisualRefIds.map((id: any) => String(id || '')).filter(Boolean).slice(0, 24)
        : undefined,
      mvVideoUrl: typeof m.mvVideoUrl === 'string' ? m.mvVideoUrl : undefined,
      mvAudioUrl: typeof m.mvAudioUrl === 'string' ? m.mvAudioUrl : undefined,
      mvSubtitleSrt: typeof m.mvSubtitleSrt === 'string' ? m.mvSubtitleSrt : undefined,
    }))
    .slice(-200);

  const plannerMessages: PlannerMessage[] = (parsed.plannerMessages || [])
    .map((m: any) => ({
      id: m.id || randomId('msg'),
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      role: m.role === 'ai' ? 'ai' : 'user',
      text: typeof m.text === 'string' ? m.text : '',
    }))
    .filter((m) => Boolean(m.text && m.text.trim()))
    .slice(-200);

  const mediaAssets: MediaAsset[] = Array.isArray((parsed as any).mediaAssets)
    ? (parsed as any).mediaAssets
        .map((a: any) => ({
          id: a.id || randomId('asset'),
          kind: a.kind === 'video' || a.kind === 'audio' || a.kind === 'text' || a.kind === 'subtitle' ? a.kind : 'text',
          name: typeof a.name === 'string' && a.name.trim() ? a.name : 'asset',
          createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
          originKey: typeof a.originKey === 'string' ? a.originKey : undefined,
          url: typeof a.url === 'string' ? a.url : undefined,
          localUrl: typeof a.localUrl === 'string' ? a.localUrl : undefined,
          localPath: typeof a.localPath === 'string' ? a.localPath : undefined,
          localKey: typeof a.localKey === 'string' ? a.localKey : undefined,
          text: typeof a.text === 'string' ? a.text : undefined,
        }))
        .slice(-120)
    : [];

  const selectedMediaAssetIds: string[] = Array.isArray((parsed as any).selectedMediaAssetIds)
    ? (parsed as any).selectedMediaAssetIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(0, 36)
    : [];

  const selectedReferenceIdsRaw: string[] = Array.isArray((parsed as any).selectedReferenceIds)
    ? (parsed as any).selectedReferenceIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(0, 24)
    : [];
  const legacyPostSelectedReferenceIds: string[] = Array.isArray((parsed as any).postSelectedReferenceIds)
    ? (parsed as any).postSelectedReferenceIds.map((id: any) => String(id || '').trim()).filter(Boolean).slice(0, 24)
    : [];
  const selectedReferenceIds = Array.from(new Set([...selectedReferenceIdsRaw, ...legacyPostSelectedReferenceIds])).slice(0, 24);

  const legacyMvPickedIds = [
    typeof (parsed as any).mvVideoAssetId === 'string' ? (parsed as any).mvVideoAssetId : '',
    typeof (parsed as any).mvAudioAssetId === 'string' ? (parsed as any).mvAudioAssetId : '',
    typeof (parsed as any).mvSubtitleAssetId === 'string' ? (parsed as any).mvSubtitleAssetId : '',
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const mergedSelectedMediaAssetIds = Array.from(new Set([...selectedMediaAssetIds, ...legacyMvPickedIds])).slice(0, 36);

  const mvSequence: Array<{ refId: string; durationSeconds?: number }> = Array.isArray((parsed as any).mvSequence)
    ? (parsed as any).mvSequence
        .map((it: any) => ({
          refId: String(it?.refId || '').trim(),
          durationSeconds: typeof it?.durationSeconds === 'number' ? it.durationSeconds : undefined,
        }))
        .filter((it: any) => Boolean(it.refId))
        .slice(0, 24)
    : Array.isArray((parsed as any).mvVisualRefIds)
      ? (parsed as any).mvVisualRefIds
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
          .slice(0, 24)
          .map((refId: string) => ({ refId }))
      : [];

  const desktopHiddenStreamMessageIds: string[] = Array.isArray((parsed as any).desktopHiddenStreamMessageIds)
    ? (parsed as any).desktopHiddenStreamMessageIds
        .map((id: any) => String(id || '').trim())
        .filter(Boolean)
        .slice(-400)
    : [];

  const desktopHiddenPlannerMessageIds: string[] = Array.isArray((parsed as any).desktopHiddenPlannerMessageIds)
    ? (parsed as any).desktopHiddenPlannerMessageIds
        .map((id: any) => String(id || '').trim())
        .filter(Boolean)
        .slice(-400)
    : [];

  const mjPadRefIds: string[] = Array.from(
    new Set(
      (Array.isArray((parsed as any).mjPadRefIds)
        ? (parsed as any).mjPadRefIds
        : typeof (parsed as any).mjPadRefId === 'string'
          ? [(parsed as any).mjPadRefId]
          : []
      )
        .map((id: any) => String(id || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    )
  );

  return {
    history,
    referenceImages,
    selectedReferenceIds,
    mjPadRefIds,
    mjSrefImageUrl: typeof (parsed as any).mjSrefImageUrl === 'string' ? (parsed as any).mjSrefImageUrl : undefined,
    mjCrefImageUrl: typeof (parsed as any).mjCrefImageUrl === 'string' ? (parsed as any).mjCrefImageUrl : undefined,
    mjSrefRefId: typeof (parsed as any).mjSrefRefId === 'string' ? (parsed as any).mjSrefRefId : undefined,
    mjCrefRefId: typeof (parsed as any).mjCrefRefId === 'string' ? (parsed as any).mjCrefRefId : undefined,
    activeImageId: typeof (parsed as any).activeImageId === 'string' ? (parsed as any).activeImageId : undefined,
    streamMessages,
    plannerMessages,
    mediaAssets,
    selectedMediaAssetIds: mergedSelectedMediaAssetIds,
    desktopHiddenStreamMessageIds,
    desktopHiddenPlannerMessageIds,
    commandMode: typeof (parsed as any).commandMode === 'string' ? (parsed as any).commandMode : undefined,
    sunoMode: typeof (parsed as any).sunoMode === 'string' ? (parsed as any).sunoMode : undefined,
    sunoLanguage: typeof (parsed as any).sunoLanguage === 'string' ? (parsed as any).sunoLanguage : undefined,
    beautifyHint: typeof (parsed as any).beautifyHint === 'string' ? (parsed as any).beautifyHint : undefined,
    postVideoPreset: typeof (parsed as any).postVideoPreset === 'string' ? (parsed as any).postVideoPreset : undefined,
    postVideoCrf: typeof (parsed as any).postVideoCrf === 'number' ? (parsed as any).postVideoCrf : undefined,
    gimageAspect: typeof (parsed as any).gimageAspect === 'string' ? (parsed as any).gimageAspect : undefined,
    gimageSize: typeof (parsed as any).gimageSize === 'string' ? (parsed as any).gimageSize : undefined,
    videoProvider: typeof (parsed as any).videoProvider === 'string' ? (parsed as any).videoProvider : undefined,
    videoModel: typeof (parsed as any).videoModel === 'string' ? (parsed as any).videoModel : undefined,
    videoSeconds: typeof (parsed as any).videoSeconds === 'number' ? (parsed as any).videoSeconds : undefined,
    videoMode: typeof (parsed as any).videoMode === 'string' ? (parsed as any).videoMode : undefined,
    videoAspect: typeof (parsed as any).videoAspect === 'string' ? (parsed as any).videoAspect : undefined,
    videoSize: typeof (parsed as any).videoSize === 'string' ? (parsed as any).videoSize : undefined,
    videoStartRefId: typeof (parsed as any).videoStartRefId === 'string' ? (parsed as any).videoStartRefId : undefined,
    videoEndRefId: typeof (parsed as any).videoEndRefId === 'string' ? (parsed as any).videoEndRefId : undefined,
    mvSequence,
    mvSubtitleText: typeof (parsed as any).mvSubtitleText === 'string' ? (parsed as any).mvSubtitleText : undefined,
    mvText: typeof (parsed as any).mvText === 'string' ? (parsed as any).mvText : undefined,
    mvResolution: typeof (parsed as any).mvResolution === 'string' ? (parsed as any).mvResolution : undefined,
    mvFps: typeof (parsed as any).mvFps === 'number' ? (parsed as any).mvFps : undefined,
    mvDurationSeconds: typeof (parsed as any).mvDurationSeconds === 'number' ? (parsed as any).mvDurationSeconds : undefined,
    mvSubtitleMode: typeof (parsed as any).mvSubtitleMode === 'string' ? (parsed as any).mvSubtitleMode : undefined,
    mvAction: typeof (parsed as any).mvAction === 'string' ? (parsed as any).mvAction : undefined,
    traceHeadMessageId: typeof (parsed as any).traceHeadMessageId === 'string' ? (parsed as any).traceHeadMessageId : undefined,
  };
}

export function startPersistence(store: Store<WorkflowState>) {
  let last = '';
  let disabled = false;
  store.subscribe((state) => {
    if (disabled) return;
    try {
      const persisted = JSON.stringify(toPersisted(state));
      if (persisted === last) return;
      localStorage.setItem(STORAGE_KEY, persisted);
      last = persisted;
    } catch (error) {
      disabled = true;
      console.warn('[mj-workflow] persistence disabled:', error);
    }
  });
}

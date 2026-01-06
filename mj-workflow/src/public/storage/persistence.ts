import type { Store } from '../state/store';
import type { PlannerMessage, ReferenceImage, StreamMessage, WorkflowHistoryItem, WorkflowState } from '../state/workflow';
import { randomId } from '../atoms/id';

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
    url: string;
    cdnUrl?: string;
    localUrl?: string;
    localPath?: string;
    localKey?: string;
  }>;
  selectedReferenceIds: string[];
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
    taskId?: string;
    gridImageUrl?: string;
    upscaledImageUrl?: string;
    peditImageUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    provider?: string;
    progress?: number;
    error?: string;
  }>;
  plannerMessages?: Array<{
    id: string;
    createdAt: number;
    role: string;
    text: string;
  }>;

  commandMode?: string;
  videoProvider?: string;
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;
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
    selectedReferenceIds: state.selectedReferenceIds.slice(),
    mjPadRefId: state.mjPadRefId,
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
      taskId: m.taskId,
      gridImageUrl: m.gridImageUrl,
      upscaledImageUrl: m.upscaledImageUrl,
      peditImageUrl: m.peditImageUrl,
      videoUrl: m.videoUrl,
      thumbnailUrl: m.thumbnailUrl,
      provider: m.provider,
      progress: typeof m.progress === 'number' ? m.progress : undefined,
      error: typeof m.error === 'string' ? m.error : undefined,
    })),
    plannerMessages: state.plannerMessages.slice(-200).map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      role: m.role,
      text: m.text,
    })),
    commandMode: state.commandMode,
    videoProvider: state.videoProvider,
    videoModel: state.videoModel,
    videoSeconds: state.videoSeconds,
    videoMode: state.videoMode,
    videoAspect: state.videoAspect,
    videoSize: state.videoSize,
    videoStartRefId: state.videoStartRefId,
    videoEndRefId: state.videoEndRefId,
  };
}

export function loadPersistedState(): {
  history: WorkflowHistoryItem[];
  referenceImages: ReferenceImage[];
  selectedReferenceIds: string[];
  mjPadRefId?: string;
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;
  mjSrefRefId?: string;
  mjCrefRefId?: string;
  activeImageId?: string;
  streamMessages: StreamMessage[];
  plannerMessages: PlannerMessage[];
  commandMode?: string;
  videoProvider?: string;
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;
} {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!parsed)
    return { history: [], referenceImages: [], selectedReferenceIds: [], streamMessages: [], plannerMessages: [] };

  const referenceImages: ReferenceImage[] = parsed.referenceLibrary.map((r: any) => ({
    id: r.id || randomId('ref'),
    name: r.name || 'reference',
    createdAt: r.createdAt || Date.now(),
    originKey: typeof r.originKey === 'string' ? r.originKey : undefined,
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
        m.kind === 'generate' || m.kind === 'upscale' || m.kind === 'deconstruct' || m.kind === 'pedit' || m.kind === 'video'
          ? m.kind
          : 'generate',
      text: typeof m.text === 'string' ? m.text : undefined,
      imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : undefined,
      refId: typeof m.refId === 'string' ? m.refId : undefined,
      taskId: typeof m.taskId === 'string' ? m.taskId : undefined,
      gridImageUrl: typeof m.gridImageUrl === 'string' ? m.gridImageUrl : undefined,
      upscaledImageUrl: typeof m.upscaledImageUrl === 'string' ? m.upscaledImageUrl : undefined,
      peditImageUrl: typeof m.peditImageUrl === 'string' ? m.peditImageUrl : undefined,
      videoUrl: typeof m.videoUrl === 'string' ? m.videoUrl : undefined,
      thumbnailUrl: typeof m.thumbnailUrl === 'string' ? m.thumbnailUrl : undefined,
      provider: typeof m.provider === 'string' ? m.provider : undefined,
      progress: typeof m.progress === 'number' ? m.progress : undefined,
      error: typeof m.error === 'string' ? m.error : undefined,
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

  return {
    history,
    referenceImages,
    selectedReferenceIds: parsed.selectedReferenceIds || [],
    mjPadRefId: typeof (parsed as any).mjPadRefId === 'string' ? (parsed as any).mjPadRefId : undefined,
    mjSrefImageUrl: typeof (parsed as any).mjSrefImageUrl === 'string' ? (parsed as any).mjSrefImageUrl : undefined,
    mjCrefImageUrl: typeof (parsed as any).mjCrefImageUrl === 'string' ? (parsed as any).mjCrefImageUrl : undefined,
    mjSrefRefId: typeof (parsed as any).mjSrefRefId === 'string' ? (parsed as any).mjSrefRefId : undefined,
    mjCrefRefId: typeof (parsed as any).mjCrefRefId === 'string' ? (parsed as any).mjCrefRefId : undefined,
    activeImageId: typeof (parsed as any).activeImageId === 'string' ? (parsed as any).activeImageId : undefined,
    streamMessages,
    plannerMessages,
    commandMode: typeof (parsed as any).commandMode === 'string' ? (parsed as any).commandMode : undefined,
    videoProvider: typeof (parsed as any).videoProvider === 'string' ? (parsed as any).videoProvider : undefined,
    videoModel: typeof (parsed as any).videoModel === 'string' ? (parsed as any).videoModel : undefined,
    videoSeconds: typeof (parsed as any).videoSeconds === 'number' ? (parsed as any).videoSeconds : undefined,
    videoMode: typeof (parsed as any).videoMode === 'string' ? (parsed as any).videoMode : undefined,
    videoAspect: typeof (parsed as any).videoAspect === 'string' ? (parsed as any).videoAspect : undefined,
    videoSize: typeof (parsed as any).videoSize === 'string' ? (parsed as any).videoSize : undefined,
    videoStartRefId: typeof (parsed as any).videoStartRefId === 'string' ? (parsed as any).videoStartRefId : undefined,
    videoEndRefId: typeof (parsed as any).videoEndRefId === 'string' ? (parsed as any).videoEndRefId : undefined,
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

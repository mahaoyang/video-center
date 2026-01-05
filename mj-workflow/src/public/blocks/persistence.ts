import type { Store } from '../state/store';
import type { ReferenceImage, WorkflowHistoryItem, WorkflowState } from '../state/workflow';
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
    url: string;
    cdnUrl?: string;
    localUrl?: string;
    localPath?: string;
    localKey?: string;
  }>;
  selectedReferenceIds: string[];
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;
  activeImageId?: string;
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
    mjSrefImageUrl: state.mjSrefImageUrl,
    mjCrefImageUrl: state.mjCrefImageUrl,
    activeImageId: state.activeImageId,
  };
}

export function loadPersistedState(): {
  history: WorkflowHistoryItem[];
  referenceImages: ReferenceImage[];
  selectedReferenceIds: string[];
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;
  activeImageId?: string;
} {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!parsed) return { history: [], referenceImages: [], selectedReferenceIds: [] };

  const referenceImages: ReferenceImage[] = parsed.referenceLibrary.map((r: any) => ({
    id: r.id || randomId('ref'),
    name: r.name || 'reference',
    createdAt: r.createdAt || Date.now(),
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

  return {
    history,
    referenceImages,
    selectedReferenceIds: parsed.selectedReferenceIds || [],
    mjSrefImageUrl: typeof (parsed as any).mjSrefImageUrl === 'string' ? (parsed as any).mjSrefImageUrl : undefined,
    mjCrefImageUrl: typeof (parsed as any).mjCrefImageUrl === 'string' ? (parsed as any).mjCrefImageUrl : undefined,
    activeImageId: typeof (parsed as any).activeImageId === 'string' ? (parsed as any).activeImageId : undefined,
  };
}

export function startPersistence(store: Store<WorkflowState>) {
  let last = '';
  store.subscribe((state) => {
    const persisted = JSON.stringify(toPersisted(state));
    if (persisted === last) return;
    last = persisted;
    localStorage.setItem(STORAGE_KEY, persisted);
  });
}

import type { ApiClient } from '../adapters/api';
import type { ReferenceImage, StreamMessage, WorkflowState } from '../state/workflow';

function localKeyFromUploadsUrl(value: string): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (!raw.startsWith('/uploads/')) return undefined;
  const path = raw.split('?')[0]!.split('#')[0]!;
  const key = path.slice('/uploads/'.length).trim();
  return key || undefined;
}

function pushUnique(set: Set<string>, value: string | undefined) {
  const s = String(value || '').trim();
  if (!s) return;
  set.add(s);
}

function pushLocalKeyFromUrl(set: Set<string>, url: string | undefined) {
  if (!url) return;
  pushUnique(set, localKeyFromUploadsUrl(url));
}

function collectRefKeys(set: Set<string>, ref: Pick<ReferenceImage, 'localKey' | 'localUrl' | 'url' | 'cdnUrl'>) {
  pushUnique(set, ref.localKey);
  pushLocalKeyFromUrl(set, ref.localUrl);
  pushLocalKeyFromUrl(set, ref.url);
  pushLocalKeyFromUrl(set, ref.cdnUrl);
}

function collectMessageKeys(set: Set<string>, m: StreamMessage) {
  pushLocalKeyFromUrl(set, m.imageUrl);
  pushLocalKeyFromUrl(set, m.gridImageUrl);
  pushLocalKeyFromUrl(set, m.upscaledImageUrl);
  pushLocalKeyFromUrl(set, m.peditImageUrl);
  pushLocalKeyFromUrl(set, m.videoUrl);
  pushLocalKeyFromUrl(set, m.thumbnailUrl);
  pushLocalKeyFromUrl(set, m.mvVideoUrl);
  pushLocalKeyFromUrl(set, m.mvAudioUrl);

  if (Array.isArray(m.peditImageUrls)) m.peditImageUrls.forEach((u) => pushLocalKeyFromUrl(set, u));
  if (Array.isArray(m.inputImageUrls)) m.inputImageUrls.forEach((u) => pushLocalKeyFromUrl(set, u));
  if (Array.isArray(m.postOutputs)) m.postOutputs.forEach((o) => pushLocalKeyFromUrl(set, o?.url));
}

export function collectReferencedUploadKeys(state: WorkflowState): string[] {
  const set = new Set<string>();

  pushLocalKeyFromUrl(set, state.uploadedImageUrl);
  pushLocalKeyFromUrl(set, state.gridImageUrl);
  state.upscaledImages?.forEach((u) => pushLocalKeyFromUrl(set, u));

  for (const ref of state.referenceImages || []) collectRefKeys(set, ref);

  // History snapshots (may only contain ref ids / localUrl)
  for (const h of state.history || []) {
    pushLocalKeyFromUrl(set, h.gridImageUrl);
    (h.upscaledImages || []).forEach((u) => pushLocalKeyFromUrl(set, u));
    (h.references || []).forEach((r) => pushLocalKeyFromUrl(set, (r as any).localUrl));
    (h.references || []).forEach((r) => {
      const id = String(r?.id || '').trim();
      if (!id) return;
      const full = (state.referenceImages || []).find((x) => x.id === id);
      if (full) collectRefKeys(set, full);
    });
  }

  for (const m of state.streamMessages || []) {
    collectMessageKeys(set, m);

    // Some messages reference assets by ids; keep the underlying refs.
    const outputRefIds = Array.isArray(m.outputRefIds) ? m.outputRefIds : [];
    for (const id of outputRefIds) {
      const ref = (state.referenceImages || []).find((r) => r.id === id);
      if (ref) collectRefKeys(set, ref);
    }
  }

  for (const a of state.mediaAssets || []) {
    pushUnique(set, a.localKey);
    pushLocalKeyFromUrl(set, a.localUrl);
    pushLocalKeyFromUrl(set, a.url);
  }

  return Array.from(set).slice(0, 5000);
}

export async function cleanupOrphanUploads(params: {
  api: ApiClient;
  state: WorkflowState;
  minAgeSeconds?: number;
}): Promise<any> {
  try {
    const keepLocalKeys = collectReferencedUploadKeys(params.state);
    return await params.api.cleanupUploads({ keepLocalKeys, minAgeSeconds: params.minAgeSeconds });
  } catch (error) {
    console.warn('[uploads-gc] cleanup failed:', error);
    return null;
  }
}


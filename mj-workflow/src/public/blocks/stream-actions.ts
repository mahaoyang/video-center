import type { ApiClient } from '../adapters/api';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { pollTaskUntilImageUrl } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { onStreamTileEvent } from '../atoms/stream-events';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';

function canonicalMediaUrl(raw: string): string {
  const u = String(raw || '').trim();
  if (!u) return '';
  try {
    if (u.startsWith('/api/image?src=')) return decodeURIComponent(u.slice('/api/image?src='.length));
    if (u.startsWith('/api/video?src=')) return decodeURIComponent(u.slice('/api/video?src='.length));
    if (u.startsWith('/api/slice?')) {
      const qs = u.split('?', 2)[1] || '';
      const p = new URLSearchParams(qs);
      const src = p.get('src');
      return src ? decodeURIComponent(src) : u;
    }
  } catch {
    // ignore
  }
  return u;
}

function findProducerMessageIdByUrl(state: WorkflowState, url: string): string | undefined {
  const target = canonicalMediaUrl(url);
  if (!target) return undefined;
  for (const m of state.streamMessages || []) {
    const outs: string[] = [];
    if (typeof m.gridImageUrl === 'string') outs.push(m.gridImageUrl);
    if (typeof m.upscaledImageUrl === 'string') outs.push(m.upscaledImageUrl);
    if (typeof m.thumbnailUrl === 'string') outs.push(m.thumbnailUrl);
    if (typeof m.videoUrl === 'string') outs.push(m.videoUrl);
    if (Array.isArray(m.peditImageUrls)) outs.push(...m.peditImageUrls);
    if (typeof m.peditImageUrl === 'string') outs.push(m.peditImageUrl);
    if (outs.map(canonicalMediaUrl).includes(target)) return m.id;
  }
  return undefined;
}

function updateMessageById(store: Store<WorkflowState>, id: string, patch: Partial<StreamMessage>) {
  store.update((s) => ({
    ...s,
    streamMessages: s.streamMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

function selectExistingReference(store: Store<WorkflowState>, id: string) {
  store.update((s) => {
    const selected = new Set(s.selectedReferenceIds);
    selected.add(id);
    return { ...s, selectedReferenceIds: Array.from(selected), mjPadRefId: id };
  });
}

async function fetchSliceAsFile(src: string, index: number): Promise<File> {
  const url = `/api/slice?src=${encodeURIComponent(src)}&index=${encodeURIComponent(String(index))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`切图失败: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], `mj-slice-${Date.now()}-${index}.png`, { type: 'image/png' });
}

async function fetchImageAsFile(src: string): Promise<File> {
  const url = `/api/image?src=${encodeURIComponent(src)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拉取图片失败: ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'png';
  return new File([blob], `mj-image-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
}

export function createStreamActions(params: { api: ApiClient; store: Store<WorkflowState> }) {
  async function addPadFromSlice(src: string, index: number) {
    try {
      const originKey = `slice:${src}#${index}`;
      const existing = params.store.get().referenceImages.find((r) => r.originKey === originKey);
      if (existing) {
        selectExistingReference(params.store, existing.id);
        return;
      }

      const file = await fetchSliceAsFile(src, index);
      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const url = String(result.url);
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;
      const producedByMessageId = findProducerMessageIdByUrl(params.store.get(), src);

      params.store.update((s) => ({
        ...s,
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `slice-${index}`,
            createdAt,
            originKey,
            producedByMessageId,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, referenceId])),
        mjPadRefId: referenceId,
      }));
    } catch (e) {
      console.error('streamAddPadFromSlice failed:', e);
      showError((e as Error)?.message || '加入垫图失败');
    }
  }

  async function upscaleFromGrid(taskId: string, index: number) {
    if (!taskId) return;
    const msgId = randomId('msg');
    try {
      const parent = (params.store.get().streamMessages || []).find((m) => m.kind === 'generate' && m.taskId === taskId);
      const parentMessageId = parent?.id;
      params.store.update((s) => ({
        ...s,
        traceHeadMessageId: msgId,
        streamMessages: [
          ...s.streamMessages,
          {
            id: msgId,
            createdAt: Date.now(),
            role: 'ai',
            kind: 'upscale',
            taskId: '',
            upscaleSourceTaskId: taskId,
            upscaleIndex: index,
            parentMessageId,
            progress: 0,
          } satisfies StreamMessage,
        ].slice(-200),
      }));

      const data = await params.api.upscale({ taskId, index });
      const upstreamError = getUpstreamErrorMessage(data);
      if (upstreamError) throw new Error(upstreamError);

      const upscaleTaskId = getSubmitTaskId(data);
      if (!upscaleTaskId) throw new Error('扩图失败：未返回任务ID');

      updateMessageById(params.store, msgId, { taskId: upscaleTaskId, progress: 1 });

      const imageUrl = await pollTaskUntilImageUrl({
        api: params.api,
        taskId: upscaleTaskId,
        onProgress: (p) => updateMessageById(params.store, msgId, { progress: p }),
      });

      updateMessageById(params.store, msgId, { upscaledImageUrl: imageUrl, progress: 100 });
    } catch (e) {
      console.error('streamUpscaleFromGrid failed:', e);
      const msg = (e as Error)?.message || '扩图失败';
      showError(msg);
      updateMessageById(params.store, msgId, { error: msg });
    }
  }

  async function selectFromSlice(src: string, index: number) {
    try {
      const originKey = `slice:${src}#${index}`;
      const existing = params.store.get().referenceImages.find((r) => r.originKey === originKey);
      if (existing) {
        selectExistingReference(params.store, existing.id);
        return;
      }

      const file = await fetchSliceAsFile(src, index);
      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const url = String(result.url);
      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;
      const producedByMessageId = findProducerMessageIdByUrl(params.store.get(), src);

      params.store.update((s) => ({
        ...s,
        upscaledImages: (s.upscaledImages.includes(url) ? s.upscaledImages : [...s.upscaledImages, url]).slice(-10),
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `selected-${index}`,
            createdAt,
            originKey,
            producedByMessageId,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, referenceId])),
        mjPadRefId: referenceId,
      }));

      showMessage('已选中该图，并加入垫图（PAD）');
    } catch (e) {
      console.error('streamSelectFromSlice failed:', e);
      showError((e as Error)?.message || '选图失败');
    }
  }

  async function selectFromUrl(src: string) {
    try {
      const originKey = `url:${src}`;
      const existing = params.store.get().referenceImages.find((r) => r.originKey === originKey);
      if (existing) {
        selectExistingReference(params.store, existing.id);
        return;
      }

      const file = await fetchImageAsFile(src);
      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const url = String(result.url);
      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;
      const producedByMessageId = findProducerMessageIdByUrl(params.store.get(), src);

      params.store.update((s) => ({
        ...s,
        upscaledImages: (s.upscaledImages.includes(url) ? s.upscaledImages : [...s.upscaledImages, url]).slice(-10),
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `upscale-${new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            createdAt,
            originKey,
            producedByMessageId,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, referenceId])),
        mjPadRefId: referenceId,
      }));

      showMessage('已加入图片栏并设为 PAD');
    } catch (e) {
      console.error('selectFromUrl failed:', e);
      showError((e as Error)?.message || '加入失败');
    }
  }

  onStreamTileEvent((d) => {
    if (d.action === 'pad') void addPadFromSlice(d.src, d.index);
    if (d.action === 'upscale') void upscaleFromGrid(d.taskId, d.index);
    if (d.action === 'select') void selectFromSlice(d.src, d.index);
    if (d.action === 'selectUrl') void selectFromUrl(d.src);
  });

  return { addPadFromSlice, upscaleFromGrid, selectFromSlice, selectFromUrl };
}

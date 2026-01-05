import type { ApiClient } from '../adapters/api';
import { showError, showMessage } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { pollTaskUntilImageUrl } from '../atoms/mj-tasks';
import { getSubmitTaskId, getUpstreamErrorMessage } from '../atoms/mj-upstream';
import { onStreamTileEvent } from '../atoms/stream-events';
import type { Store } from '../state/store';
import type { StreamMessage, WorkflowState } from '../state/workflow';

function updateMessageById(store: Store<WorkflowState>, id: string, patch: Partial<StreamMessage>) {
  store.update((s) => ({
    ...s,
    streamMessages: s.streamMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

async function fetchSliceAsFile(src: string, index: number): Promise<File> {
  const url = `/api/slice?src=${encodeURIComponent(src)}&index=${encodeURIComponent(String(index))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`切图失败: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], `mj-slice-${Date.now()}-${index}.png`, { type: 'image/png' });
}

export function createStreamActions(params: { api: ApiClient; store: Store<WorkflowState> }) {
  async function addPadFromSlice(src: string, index: number) {
    try {
      const file = await fetchSliceAsFile(src, index);
      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const url = String(result.url);
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;

      params.store.update((s) => ({
        ...s,
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `slice-${index}`,
            createdAt,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: [...s.selectedReferenceIds, referenceId],
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
      params.store.update((s) => ({
        ...s,
        streamMessages: [
          ...s.streamMessages,
          {
            id: msgId,
            createdAt: Date.now(),
            role: 'ai',
            kind: 'upscale',
            taskId: '',
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
      const file = await fetchSliceAsFile(src, index);
      const uploaded = await params.api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0 || !result?.url) throw new Error(uploaded?.description || '上传失败');

      const url = String(result.url);
      const referenceId = randomId('ref');
      const createdAt = Date.now();
      const cdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result.localUrl === 'string' ? result.localUrl : undefined;

      params.store.update((s) => ({
        ...s,
        upscaledImages: [...s.upscaledImages, url].slice(-10),
        referenceImages: [
          ...s.referenceImages,
          {
            id: referenceId,
            name: `selected-${index}`,
            createdAt,
            url,
            cdnUrl,
            localUrl,
            localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
            localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
          },
        ],
        selectedReferenceIds: [...s.selectedReferenceIds, referenceId],
        mjPadRefId: referenceId,
      }));

      showMessage('已选中该图，并加入垫图（PAD）');
    } catch (e) {
      console.error('streamSelectFromSlice failed:', e);
      showError((e as Error)?.message || '选图失败');
    }
  }

  onStreamTileEvent((d) => {
    if (d.action === 'pad') void addPadFromSlice(d.src, d.index);
    if (d.action === 'upscale') void upscaleFromGrid(d.taskId, d.index);
    if (d.action === 'select') void selectFromSlice(d.src, d.index);
  });

  // Optional: expose for manual debugging
  (window as any).streamAddPadFromSlice = addPadFromSlice;
  (window as any).streamUpscaleFromGrid = upscaleFromGrid;
  (window as any).streamSelectFromSlice = selectFromSlice;
}

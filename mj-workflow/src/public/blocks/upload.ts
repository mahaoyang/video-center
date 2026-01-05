import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { fileToDataUrl } from '../atoms/file';
import { byId, show } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { ApiClient } from '../adapters/api';
import { randomId } from '../atoms/id';

export function initUpload(store: Store<WorkflowState>, api: ApiClient) {
  const uploadInput = document.getElementById('imageUpload') as HTMLInputElement | null;
  const dropzone = document.getElementById('uploadDropzone');

  async function handleFile(file: File) {
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.split(',')[1] || '';
    if (!dataUrl.startsWith('data:') || !base64) {
      throw new Error('图片读取为空或格式异常');
    }

    const preview = byId<HTMLElement>('uploadedImagePreview');
    const img = byId<HTMLImageElement>('previewImg');
    img.src = dataUrl;
    show(preview);
    show(byId<HTMLButtonElement>('step1Next'));

    const referenceId = randomId('ref');
    const createdAt = Date.now();

    store.update((s) => ({
      ...s,
      uploadedImageBase64: base64,
      uploadedImageDataUrl: dataUrl,
      uploadedImageUrl: undefined,
      referenceImages: [
        ...s.referenceImages,
        {
          id: referenceId,
          name: file.name || 'reference',
          createdAt,
          dataUrl,
          base64,
        },
      ],
      // Pure upload: push into history only; actual "pad/ref" selection happens in Step 3 from the history list.
      selectedReferenceIds: s.selectedReferenceIds,
    }));

    // Upload to imageproxy via backend for a stable URL (optional)
    try {
      const uploaded = await api.upload(file);
      if (uploaded?.code === 0 && uploaded?.result?.url) {
        const url = String(uploaded.result.url);
        const cdnUrl = uploaded?.result?.cdnUrl ? String(uploaded.result.cdnUrl) : undefined;
        const localUrl = uploaded?.result?.localUrl ? String(uploaded.result.localUrl) : undefined;
        const localPath = uploaded?.result?.localPath ? String(uploaded.result.localPath) : undefined;
        const localKey = uploaded?.result?.localKey ? String(uploaded.result.localKey) : undefined;
        store.update((s) => ({
          ...s,
          uploadedImageUrl: url,
          referenceImages: s.referenceImages.map((r) =>
            r.id === referenceId ? { ...r, url, cdnUrl, localUrl, localPath, localKey } : r
          ),
        }));
      }
    } catch (error) {
      // non-fatal: keep local dataUrl/base64
      console.warn('Remote upload failed:', error);
    }
  }

  uploadInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      await handleFile(file);
    } catch (error) {
      console.error('Upload error:', error);
      showError(`读取图片失败：${(error as Error)?.message || String(error)}`);
    }
  });

  if (dropzone) {
    const prevent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        prevent(event);
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        prevent(event);
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', async (event) => {
      const dragEvent = event as DragEvent;
      const file = dragEvent.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        await handleFile(file);
      } catch (error) {
        console.error('Upload drop error:', error);
        showError(`读取图片失败：${(error as Error)?.message || String(error)}`);
      }
    });
  }
}

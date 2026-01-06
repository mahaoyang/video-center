import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { fileToDataUrl } from '../atoms/file';
import { byId, show, hide } from '../atoms/ui';
import { showError } from '../atoms/notify';
import type { ApiClient } from '../adapters/api';
import { randomId } from '../atoms/id';
import { sha256HexFromBlob } from '../atoms/blob-hash';

export function initUpload(store: Store<WorkflowState>, api: ApiClient) {
  const uploadInput = document.getElementById('imageUpload') as HTMLInputElement | null;
  const uploadTrigger = document.getElementById('uploadTrigger') as HTMLElement | null;
  const tray = byId('referenceTray');
  const padCount = document.getElementById('padCount') as HTMLElement | null;

  function getDeleteKey(ref: { localKey?: string; localUrl?: string }): string | undefined {
    if (ref.localKey) return ref.localKey;
    const url = String(ref.localUrl || '');
    const m = url.match(/^\/uploads\/([^/?#]+)$/);
    return m?.[1];
  }

  function renderTray() {
    if (!tray) return;
    const s = store.get();
    tray.innerHTML = '';

    if (s.referenceImages.length > 0) {
      show(byId('deconstructTrigger'));
    } else {
      hide(byId('deconstructTrigger'));
    }

    if (padCount) padCount.textContent = s.mjPadRefId ? '1' : '0';

    s.referenceImages.forEach((img) => {
      const isSelected = s.selectedReferenceIds.includes(img.id);
      const isPad = s.mjPadRefId === img.id;

      const item = document.createElement('div');
      item.className =
        'group/ref relative flex-shrink-0 w-16 pt-3 animate-pop-in cursor-pointer transition-all duration-300 ' +
        '-ml-10 first:ml-0 group-hover:ml-2 group-hover:first:ml-0 hover:z-20 hover:-translate-y-1';

      const frame = document.createElement('div');
      frame.className =
        'relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 ' +
        (isPad
          ? 'ring-2 ring-studio-accent border-studio-accent/30'
          : isSelected
            ? 'ring-1 ring-white/20 border-white/20'
            : '');

      const previewUrl = img.dataUrl || img.cdnUrl || img.url || img.localUrl || '';
      const thumb = document.createElement('img');
      thumb.src = previewUrl;
      thumb.className = 'w-full h-full object-cover';
      thumb.referrerPolicy = 'no-referrer';
      frame.appendChild(thumb);

      const del = document.createElement('button');
      del.type = 'button';
      del.className =
        'absolute right-0 top-2 translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-red-500/70 hover:border-red-400/30 hover:text-white';
      del.innerHTML = '<i class="fas fa-times text-[9px]"></i>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        void removeRef(img.id);
      });

      const padOverlay = document.createElement('div');
      padOverlay.className =
        'absolute inset-0 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity z-20';

      const padBtn = document.createElement('button');
      padBtn.type = 'button';
      padBtn.className =
        'w-10 h-10 rounded-2xl border border-white/10 bg-black/55 backdrop-blur flex items-center justify-center ' +
        (isPad
          ? 'text-studio-bg bg-studio-accent border-studio-accent shadow-[0_0_18px_rgba(197,243,65,0.25)]'
          : 'text-white/80 hover:border-studio-accent/40 hover:text-studio-accent');
      padBtn.innerHTML = isPad ? '<i class="fas fa-check text-xs"></i>' : '<i class="fas fa-plus text-xs"></i>';
      padBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.update((state) => {
          const next = state.mjPadRefId === img.id ? undefined : img.id;
          return { ...state, mjPadRefId: next };
        });
      });

      padOverlay.appendChild(padBtn);

      frame.appendChild(padOverlay);
      item.appendChild(frame);
      item.appendChild(del);

      item.addEventListener('click', () => {
        store.update((state) => {
          const selected = new Set(state.selectedReferenceIds);
          if (selected.has(img.id)) selected.delete(img.id);
          else selected.add(img.id);
          return { ...state, selectedReferenceIds: Array.from(selected) };
        });
      });

      tray.appendChild(item);
    });
  }

  async function removeRef(id: string) {
    const ref = store.get().referenceImages.find((r) => r.id === id);
    const refPublicUrls = ref ? [ref.cdnUrl, ref.url].filter(Boolean) as string[] : [];
    store.update((s) => ({
      ...s,
      referenceImages: s.referenceImages.filter((r) => r.id !== id),
      selectedReferenceIds: s.selectedReferenceIds.filter((rid) => rid !== id),
      activeImageId: s.activeImageId === id ? undefined : s.activeImageId,
      mjPadRefId: s.mjPadRefId === id ? undefined : s.mjPadRefId,
      mjSrefImageUrl: s.mjSrefImageUrl && refPublicUrls.includes(s.mjSrefImageUrl) ? undefined : s.mjSrefImageUrl,
      mjCrefImageUrl: s.mjCrefImageUrl && refPublicUrls.includes(s.mjCrefImageUrl) ? undefined : s.mjCrefImageUrl,
      mjSrefRefId: s.mjSrefRefId === id ? undefined : s.mjSrefRefId,
      mjCrefRefId: s.mjCrefRefId === id ? undefined : s.mjCrefRefId,
    }));
    renderTray();
    const deleteKey = ref ? getDeleteKey(ref) : undefined;
    if (deleteKey) {
      try {
        await api.deleteUpload({ localKey: deleteKey });
      } catch {
        // ignore
      }
    }
  }

  async function handleFile(file: File) {
    const originKey = `file:sha256:${await sha256HexFromBlob(file)}`;
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.split(',')[1] || '';
    if (!dataUrl.startsWith('data:') || !base64) {
      throw new Error('图片读取为空或格式异常');
    }

    const existing = store
      .get()
      .referenceImages.find((r) => r.originKey === originKey || (typeof r.base64 === 'string' && r.base64 === base64));
    if (existing) {
      store.update((s) => {
        const selected = new Set(s.selectedReferenceIds);
        selected.add(existing.id);
        return { ...s, selectedReferenceIds: Array.from(selected), mjPadRefId: existing.id };
      });
      renderTray();
      return;
    }

    const referenceId = randomId('ref');
    const createdAt = Date.now();

    store.update((s) => ({
      ...s,
      referenceImages: [
        ...s.referenceImages,
        {
          id: referenceId,
          name: file.name || 'reference',
          createdAt,
          originKey,
          dataUrl,
          base64,
        },
      ],
      selectedReferenceIds: Array.from(new Set([...s.selectedReferenceIds, referenceId])),
      mjPadRefId: referenceId,
    }));

    renderTray();

    try {
      const uploaded = await api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code === 0 && result?.url) {
        const url = String(result.url);
        const persistedPreviewUrl =
          (typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined) ||
          url ||
          (typeof result.localUrl === 'string' ? result.localUrl : undefined);
        store.update((s) => ({
          ...s,
          referenceImages: s.referenceImages.map((r) =>
            r.id === referenceId
              ? {
                  ...r,
                  url,
                  cdnUrl: typeof result.cdnUrl === 'string' ? result.cdnUrl : undefined,
                  localUrl: typeof result.localUrl === 'string' ? result.localUrl : undefined,
                  localPath: typeof result.localPath === 'string' ? result.localPath : undefined,
                  localKey: typeof result.localKey === 'string' ? result.localKey : undefined,
                }
              : r
          ),
          streamMessages: s.streamMessages.map((m) => {
            if (m.refId !== referenceId) return m;
            if (typeof m.imageUrl === 'string' && m.imageUrl.startsWith('data:')) return { ...m, imageUrl: persistedPreviewUrl };
            if (!m.imageUrl) return { ...m, imageUrl: persistedPreviewUrl };
            return m;
          }),
        }));
      }
    } catch (error) {
      console.warn('Remote upload failed:', error);
    }
  }

  uploadInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (!files.length) return;

    for (const file of files) {
      try {
        await handleFile(file);
      } catch (error) {
        showError(`读取图片失败：${(error as Error)?.message}`);
      }
    }
    target.value = ''; // Reset input
  });

  uploadTrigger?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!uploadInput) return;
    if (target && (target === uploadInput || target.closest('#padMatrixBtn'))) return;
    // Do not preventDefault here: if the click lands on the transparent <input type="file">,
    // we want the browser's native picker to work reliably.
    uploadInput.click();
  });

  // INITIAL RENDER + AUTOMATIC SYNC
  renderTray();
  store.subscribe(renderTray);
}

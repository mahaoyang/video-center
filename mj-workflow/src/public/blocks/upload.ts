import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { fileToDataUrl } from '../atoms/file';
import { byId } from '../atoms/ui';
import { showError, showMessage } from '../atoms/notify';
import { setTraceOpen } from '../atoms/overlays';
import type { ApiClient } from '../adapters/api';
import { randomId } from '../atoms/id';
import { sha256HexFromBlob } from '../atoms/blob-hash';
import { toAppImageSrc } from '../atoms/image-src';
import { isHttpUrl } from '../atoms/url';

export function initUpload(store: Store<WorkflowState>, api: ApiClient) {
  const uploadInput = document.getElementById('imageUpload') as HTMLInputElement | null;
  const uploadTrigger = document.getElementById('uploadTrigger') as HTMLElement | null;
  const commandHub = document.getElementById('commandHub') as HTMLElement | null;
  const tray = byId('referenceTray');
  const padCount = document.getElementById('padCount') as HTMLElement | null;
  const copyBusy = new Set<string>();
  const copyOk = new Set<string>();

  function hasDraggedFiles(e: DragEvent): boolean {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes('Files');
  }

  function normalizeMultiline(text: string): string {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    const value = normalizeMultiline(text);
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  function extFromMime(mime: string): string {
    const m = String(mime || '').toLowerCase();
    if (m.includes('image/png')) return '.png';
    if (m.includes('image/jpeg')) return '.jpg';
    if (m.includes('image/webp')) return '.webp';
    if (m.includes('image/gif')) return '.gif';
    return '';
  }

  function safeFileName(name: string): string {
    const cleaned = String(name || '').trim().replace(/[^\w.-]+/g, '_');
    return cleaned || 'image';
  }

  function pickPublicCopyUrlForRef(ref: {
    cdnUrl?: string;
    url?: string;
    localUrl?: string;
    localKey?: string;
  }): string {
    if (isHttpUrl(ref.cdnUrl)) return ref.cdnUrl;
    if (isHttpUrl(ref.url)) return ref.url;
    return '';
  }

  function getLocalKeyForRef(ref: { localKey?: string; localUrl?: string; url?: string }): string | undefined {
    if (ref.localKey) return ref.localKey;
    const urls = [ref.localUrl, ref.url].map((x) => String(x || '').trim()).filter(Boolean);
    for (const u of urls) {
      const m = u.match(/^\/uploads\/([^/?#]+)$/);
      if (m?.[1]) return m[1];
    }
    return undefined;
  }

  async function fileFromRef(ref: { name?: string; dataUrl?: string; base64?: string }): Promise<File> {
    const dataUrl = String(ref.dataUrl || '').trim();
    const base64 = String(ref.base64 || '').trim();
    const src = dataUrl || (base64 ? `data:image/png;base64,${base64}` : '');
    if (!src.startsWith('data:')) throw new Error('该图片尚未缓存，无法上传（缺少 dataUrl/base64）');

    const res = await fetch(src);
    const blob = await res.blob();
    const mime = String(blob.type || '').trim();
    const ext = extFromMime(mime);

    const rawName = safeFileName(ref.name || 'image');
    const hasExt = /\.[a-z0-9]{2,10}$/i.test(rawName);
    const fileName = hasExt ? rawName : `${rawName}${ext || '.png'}`;
    return new File([blob], fileName, { type: mime || 'image/png' });
  }

  async function ensureRefCdnUrlForCopy(refId: string): Promise<string> {
    const ref = store.get().referenceImages.find((r) => r.id === refId);
    if (!ref) throw new Error('素材不存在');
    const existing = pickPublicCopyUrlForRef(ref);
    if (existing) return existing;

    let localKey = getLocalKeyForRef(ref);
    if (!localKey) {
      const file = await fileFromRef(ref);
      const uploaded = await api.upload(file);
      const result = uploaded?.result;
      if (uploaded?.code !== 0) throw new Error(String(uploaded?.description || '上传失败'));

      const url = typeof result?.url === 'string' ? result.url : undefined;
      const cdnUrl = typeof result?.cdnUrl === 'string' ? result.cdnUrl : undefined;
      const localUrl = typeof result?.localUrl === 'string' ? result.localUrl : undefined;
      const localPath = typeof result?.localPath === 'string' ? result.localPath : undefined;
      const nextLocalKey = typeof result?.localKey === 'string' ? result.localKey : undefined;

      store.update((s) => ({
        ...s,
        referenceImages: s.referenceImages.map((r) =>
          r.id === refId
            ? {
                ...r,
                url: url || r.url,
                cdnUrl: cdnUrl || r.cdnUrl,
                localUrl: localUrl || r.localUrl,
                localPath: localPath || r.localPath,
                localKey: nextLocalKey || r.localKey,
              }
            : r
        ),
      }));

      localKey = nextLocalKey || getLocalKeyForRef({ url, localUrl, localKey: nextLocalKey });
    }

    if (!localKey) throw new Error('素材缺少本地缓存，无法上传到图床（请重新上传）');

    const promoted = await api.promoteUpload({ localKey });
    if (promoted?.code !== 0) {
      throw new Error(String(promoted?.description || '上传到图床失败（promote）'));
    }
    const cdnUrl = String(promoted?.result?.cdnUrl || promoted?.result?.url || '').trim();
    if (!isHttpUrl(cdnUrl)) throw new Error('上传到图床失败：未返回可用 URL');

    store.update((s) => ({
      ...s,
      referenceImages: s.referenceImages.map((r) => (r.id === refId ? { ...r, cdnUrl, url: cdnUrl } : r)),
    }));

    return cdnUrl;
  }

  function extractDroppedFiles(dt: DataTransfer | null): File[] {
    if (!dt) return [];
    const out: File[] = [];
    if (dt.items && dt.items.length) {
      for (const item of Array.from(dt.items)) {
        if (item.kind !== 'file') continue;
        const f = item.getAsFile();
        if (f) out.push(f);
      }
      if (out.length) return out;
    }
    return Array.from(dt.files || []);
  }

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

    if (padCount) padCount.textContent = String(Array.isArray(s.mjPadRefIds) ? s.mjPadRefIds.length : 0);
    const mjPadOrder = Array.isArray(s.mjPadRefIds) ? s.mjPadRefIds : [];
    const isPost = String(s.commandMode || '').trim() === 'post';
    const selectedImageIds = isPost
      ? Array.isArray((s as any).postSelectedReferenceIds)
        ? ((s as any).postSelectedReferenceIds as string[])
        : []
      : Array.isArray(s.selectedReferenceIds)
        ? s.selectedReferenceIds
        : [];

    const mvOrder = new Map<string, number>();
    if (String(s.commandMode || '').startsWith('mv')) {
      const ids = Array.isArray(s.selectedReferenceIds) ? s.selectedReferenceIds : [];
      for (const [idx, id] of ids.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24).entries()) {
        if (!mvOrder.has(id)) mvOrder.set(id, idx + 1);
      }
    }

    s.referenceImages.forEach((img) => {
      const isSelected = selectedImageIds.includes(img.id);
      const isPad = Array.isArray(s.mjPadRefIds) ? s.mjPadRefIds.includes(img.id) : false;
      const mvIndex = mvOrder.get(img.id);
      const padIndex = isPad ? mjPadOrder.indexOf(img.id) : -1;

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
      thumb.src = toAppImageSrc(previewUrl);
      thumb.className = 'w-full h-full object-cover';
      thumb.referrerPolicy = 'no-referrer';
      frame.appendChild(thumb);

      if (typeof padIndex === 'number' && padIndex >= 0) {
        const badge = document.createElement('div');
        badge.className =
          'absolute left-1 bottom-1 min-w-6 h-6 px-2 rounded-full bg-black/60 border border-white/10 text-[10px] font-black text-studio-accent flex items-center justify-center z-20';
        badge.textContent = `P${padIndex + 1}`;
        frame.appendChild(badge);
      }

      if (isSelected) {
        const sel = document.createElement('div');
        sel.className =
          'absolute right-1 top-1 w-5 h-5 rounded-full bg-black/60 border border-white/10 text-[9px] font-black text-white/80 flex items-center justify-center z-20';
        sel.innerHTML = '<i class="fas fa-check"></i>';
        frame.appendChild(sel);
      }

      if (isPad) {
        const check = document.createElement('div');
        check.className =
          'absolute right-1 bottom-1 w-5 h-5 rounded-full bg-studio-accent text-black flex items-center justify-center text-[9px] shadow-xl z-20';
        check.innerHTML = '<i class="fas fa-check"></i>';
        frame.appendChild(check);
      }

      if (typeof mvIndex === 'number' && Number.isFinite(mvIndex)) {
        const badge = document.createElement('div');
        badge.className =
          'absolute left-1 top-1 min-w-6 h-6 px-2 rounded-full bg-black/60 border border-white/10 text-[10px] font-black text-white/80 flex items-center justify-center z-20';
        badge.textContent = String(mvIndex);
        frame.appendChild(badge);
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.title = '删除素材';
      del.setAttribute('aria-label', '删除素材');
      del.className =
        'absolute right-0 top-3 translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-red-500/70 hover:border-red-400/30 hover:text-white';
      del.innerHTML = '<i class="fas fa-times text-[9px]"></i>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        void removeRef(img.id);
      });

      const dl = document.createElement('a');
      dl.href = toAppImageSrc(previewUrl);
      dl.download = `${String(img.name || 'image').replace(/[^\w.-]+/g, '_') || 'image'}.png`;
      dl.title = '下载';
      dl.setAttribute('aria-label', '下载');
      dl.className =
        'absolute left-0 bottom-0 -translate-x-1/2 translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-white/10 hover:border-white/20 hover:text-white';
      dl.innerHTML = '<i class="fas fa-download text-[9px]"></i>';
      dl.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.title = '复制图床链接';
      copyBtn.setAttribute('aria-label', '复制图床链接');
      copyBtn.className =
        'absolute left-0 top-3 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-white/10 hover:border-white/20 hover:text-white';
      if (copyBusy.has(img.id)) {
        copyBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-[9px]"></i>';
        copyBtn.disabled = true;
      } else if (copyOk.has(img.id)) {
        copyBtn.innerHTML = '<i class="fas fa-check text-[9px]"></i>';
      } else {
        copyBtn.innerHTML = '<i class="fas fa-link text-[9px]"></i>';
      }
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (copyBusy.has(img.id)) return;
        copyBusy.add(img.id);
        copyOk.delete(img.id);
        renderTray();
        try {
          const url = await ensureRefCdnUrlForCopy(img.id);
          const ok = await copyToClipboard(url);
          if (!ok) throw new Error(`复制失败，请手动复制：\n${url}`);
          copyOk.add(img.id);
          renderTray();
          setTimeout(() => {
            copyOk.delete(img.id);
            renderTray();
          }, 1200);
        } catch (error) {
          showError((error as Error)?.message || '复制失败');
        } finally {
          copyBusy.delete(img.id);
          renderTray();
        }
      });

      const trace = document.createElement('button');
      trace.type = 'button';
      trace.className =
        'absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-white/10 hover:border-white/20 hover:text-white';
      trace.innerHTML = '<i class="fas fa-sitemap text-[9px]"></i>';
      trace.title = '链路追踪';
      trace.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        store.update((s) => ({ ...s, traceTarget: { type: 'ref', id: img.id }, traceReturnTo: undefined }));
        setTraceOpen(true);
      });

      const padOverlay = document.createElement('div');
      padOverlay.className =
        'absolute inset-0 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity z-20';

      const padBtn = document.createElement('button');
      padBtn.type = 'button';
      padBtn.title = isPad ? '取消 PAD' : '设为 PAD';
      padBtn.setAttribute('aria-label', isPad ? '取消 PAD' : '设为 PAD');
      padBtn.className =
        'w-10 h-10 rounded-2xl border border-white/10 bg-black/55 backdrop-blur flex items-center justify-center ' +
        (isPad
          ? 'text-studio-bg bg-studio-accent border-studio-accent shadow-[0_0_18px_rgba(197,243,65,0.25)]'
          : 'text-white/80 hover:border-studio-accent/40 hover:text-studio-accent');
      padBtn.innerHTML = isPad ? '<i class="fas fa-check text-xs"></i>' : '<i class="fas fa-plus text-xs"></i>';
      padBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.update((state) => {
          const ids = Array.isArray(state.mjPadRefIds) ? state.mjPadRefIds.slice() : [];
          const has = ids.includes(img.id);
          const next = has ? ids.filter((x) => x !== img.id) : [...ids, img.id];
          return { ...state, mjPadRefIds: next.slice(0, 12) };
        });
      });

      padOverlay.appendChild(padBtn);

      frame.appendChild(padOverlay);
      item.appendChild(frame);
      item.appendChild(del);
      item.appendChild(dl);
      item.appendChild(copyBtn);
      item.appendChild(trace);

      item.addEventListener('click', () => {
        store.update((state) => {
          const mode = String(state.commandMode || '').trim();
          if (mode === 'post') {
            const selected = new Set(Array.isArray((state as any).postSelectedReferenceIds) ? (state as any).postSelectedReferenceIds : []);
            if (selected.has(img.id)) selected.delete(img.id);
            else selected.add(img.id);
            return { ...state, postSelectedReferenceIds: Array.from(selected).slice(0, 24) };
          }
          const selected = new Set(state.selectedReferenceIds);
          if (selected.has(img.id)) selected.delete(img.id);
          else selected.add(img.id);
          return { ...state, selectedReferenceIds: Array.from(selected).slice(0, 24) };
        });
      });

      tray.appendChild(item);
    });

    // Media assets (video/audio/subtitle) in the same tray (single source of truth for MV).
    const media = Array.isArray(s.mediaAssets) ? s.mediaAssets.slice() : [];
    for (const a of media.slice().reverse().slice(0, 36)) {
      const kind = a.kind;
      if (kind !== 'video' && kind !== 'audio' && kind !== 'subtitle') continue;
      const isPost = String(s.commandMode || '').trim() === 'post';
      const selectedPost = isPost && Array.isArray((s as any).selectedMediaAssetIds) ? (s as any).selectedMediaAssetIds.includes(a.id) : false;
      const selectedMv =
        (kind === 'video' && s.mvVideoAssetId === a.id) ||
        (kind === 'audio' && s.mvAudioAssetId === a.id) ||
        (kind === 'subtitle' && s.mvSubtitleAssetId === a.id);
      const selected = isPost ? selectedPost : selectedMv;

      const item = document.createElement('div');
      item.className =
        'group/ref relative flex-shrink-0 w-16 pt-3 animate-pop-in cursor-pointer transition-all duration-300 ' +
        '-ml-10 first:ml-0 group-hover:ml-2 group-hover:first:ml-0 hover:z-20 hover:-translate-y-1';

      const frame = document.createElement('div');
      frame.className =
        'relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 bg-studio-panel flex items-center justify-center ' +
        (selected ? 'ring-2 ring-studio-accent border-studio-accent/30' : '');
      frame.title = `${kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '字幕'}素材：${selected ? '点击取消选择' : '点击选择'}（Ctrl/⌘ 打开）`;

      const icon = document.createElement('div');
      icon.className = 'text-white/50';
      icon.innerHTML =
        kind === 'video'
          ? '<i class="fas fa-film"></i>'
          : kind === 'audio'
            ? '<i class="fas fa-music"></i>'
            : '<i class="fas fa-closed-captioning"></i>';
      frame.appendChild(icon);

      const tag = document.createElement('div');
      tag.className =
        'absolute left-1 top-1 min-w-6 h-6 px-2 rounded-full bg-black/60 border border-white/10 text-[9px] font-black text-white/70 flex items-center justify-center z-20';
      tag.textContent = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'S';
      frame.appendChild(tag);

      const name = document.createElement('div');
      name.className =
        'absolute left-1 right-1 bottom-1 text-[7px] font-mono text-white/80 truncate ' +
        'px-1 py-0.5 rounded-md bg-black border border-white/15';
      name.textContent = String(a.name || kind);
      frame.appendChild(name);

      const selectOverlay = document.createElement('div');
      selectOverlay.className =
        'absolute inset-0 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity z-20';

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      const kindLabel = kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '字幕';
      selectBtn.title = selected ? `取消选择${kindLabel}` : `选择${kindLabel}`;
      selectBtn.setAttribute('aria-label', selected ? `取消选择${kindLabel}` : `选择${kindLabel}`);
      selectBtn.className =
        'w-10 h-10 rounded-2xl border border-white/10 bg-black/55 backdrop-blur flex items-center justify-center ' +
        (selected
          ? 'text-studio-accent bg-black border-studio-accent/40 shadow-[0_0_18px_rgba(197,243,65,0.18)]'
          : 'text-white/80 hover:border-studio-accent/40 hover:text-studio-accent');
      selectBtn.innerHTML = selected ? '<i class="fas fa-check text-xs"></i>' : '<i class="fas fa-plus text-xs"></i>';
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.update((st) => {
          const mode = String(st.commandMode || '').trim();
          if (mode === 'post') {
            const ids = Array.isArray((st as any).selectedMediaAssetIds) ? (st as any).selectedMediaAssetIds.slice() : [];
            const has = ids.includes(a.id);
            const next = has ? ids.filter((x: any) => x !== a.id) : [...ids, a.id];
            return { ...st, selectedMediaAssetIds: next.slice(0, 36) };
          }
          return {
            ...st,
            mvVideoAssetId: kind === 'video' ? (st.mvVideoAssetId === a.id ? undefined : a.id) : st.mvVideoAssetId,
            mvAudioAssetId: kind === 'audio' ? (st.mvAudioAssetId === a.id ? undefined : a.id) : st.mvAudioAssetId,
            mvSubtitleAssetId: kind === 'subtitle' ? (st.mvSubtitleAssetId === a.id ? undefined : a.id) : st.mvSubtitleAssetId,
          };
        });
        showMessage(`${selected ? '已取消选择' : '已选择'}${kindLabel}素材（用于 ${isPost ? '后处理' : 'MV'}）`);
        renderTray();
      });

      selectOverlay.appendChild(selectBtn);
      frame.appendChild(selectOverlay);

      const del = document.createElement('button');
      del.type = 'button';
      del.title = '删除素材';
      del.setAttribute('aria-label', '删除素材');
      del.className =
        'absolute right-0 top-3 translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-studio-panel/80 border border-white/10 text-white/60 flex items-center justify-center shadow-xl z-30 ' +
        'opacity-0 group-hover/ref:opacity-100 transition-opacity hover:bg-red-500/70 hover:border-red-400/30 hover:text-white';
      del.innerHTML = '<i class="fas fa-times text-[9px]"></i>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        void removeMediaAsset(a.id);
      });

      item.appendChild(frame);
      item.appendChild(del);

      item.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) {
          const url = String(a.url || a.localUrl || '').trim();
          if (url) window.open(url, '_blank', 'noreferrer');
          return;
        }
        store.update((st) => {
          const mode = String(st.commandMode || '').trim();
          if (mode === 'post') {
            const ids = Array.isArray((st as any).selectedMediaAssetIds) ? (st as any).selectedMediaAssetIds.slice() : [];
            const has = ids.includes(a.id);
            const next = has ? ids.filter((x: any) => x !== a.id) : [...ids, a.id];
            return { ...st, selectedMediaAssetIds: next.slice(0, 36) };
          }
          return {
            ...st,
            mvVideoAssetId: kind === 'video' ? (st.mvVideoAssetId === a.id ? undefined : a.id) : st.mvVideoAssetId,
            mvAudioAssetId: kind === 'audio' ? (st.mvAudioAssetId === a.id ? undefined : a.id) : st.mvAudioAssetId,
            mvSubtitleAssetId: kind === 'subtitle' ? (st.mvSubtitleAssetId === a.id ? undefined : a.id) : st.mvSubtitleAssetId,
          };
        });
        showMessage(`${selected ? '已取消选择' : '已选择'} ${kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '字幕'}素材（用于 ${isPost ? '后处理' : 'MV'}）`);
        renderTray();
      });

      tray.appendChild(item);
    }
  }

  async function removeRef(id: string) {
    const ref = store.get().referenceImages.find((r) => r.id === id);
    const refPublicUrls = ref ? [ref.cdnUrl, ref.url].filter(Boolean) as string[] : [];
    store.update((s) => ({
      ...s,
      referenceImages: s.referenceImages.filter((r) => r.id !== id),
      selectedReferenceIds: s.selectedReferenceIds.filter((rid) => rid !== id),
      postSelectedReferenceIds: Array.isArray((s as any).postSelectedReferenceIds)
        ? (s as any).postSelectedReferenceIds.filter((rid: any) => rid !== id)
        : [],
      activeImageId: s.activeImageId === id ? undefined : s.activeImageId,
      mjPadRefIds: Array.isArray(s.mjPadRefIds) ? s.mjPadRefIds.filter((rid) => rid !== id) : [],
      mvSequence: Array.isArray((s as any).mvSequence) ? (s as any).mvSequence.filter((x: any) => x?.refId !== id) : (s as any).mvSequence,
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

  async function removeMediaAsset(id: string) {
    const asset = store.get().mediaAssets.find((a) => a.id === id);
    store.update((s) => ({
      ...s,
      mediaAssets: s.mediaAssets.filter((a) => a.id !== id),
      mvVideoAssetId: s.mvVideoAssetId === id ? undefined : s.mvVideoAssetId,
      mvAudioAssetId: s.mvAudioAssetId === id ? undefined : s.mvAudioAssetId,
      mvSubtitleAssetId: s.mvSubtitleAssetId === id ? undefined : s.mvSubtitleAssetId,
      selectedMediaAssetIds: Array.isArray((s as any).selectedMediaAssetIds)
        ? (s as any).selectedMediaAssetIds.filter((x: any) => x !== id)
        : [],
    }));
    renderTray();
    const deleteKey = asset ? (asset.localKey || (typeof asset.localUrl === 'string' ? asset.localUrl.split('/').pop() : undefined)) : undefined;
    if (deleteKey) {
      try {
        await api.deleteUpload({ localKey: deleteKey });
      } catch {
        // ignore
      }
    }
  }

  function isSrtFilename(name: string): boolean {
    return String(name || '').toLowerCase().endsWith('.srt');
  }

  function inferMediaKind(file: File): 'video' | 'audio' | 'subtitle' | null {
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (name.endsWith('.srt') || type === 'application/x-subrip') return 'subtitle';
    if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.mkv') || name.endsWith('.webm')) return 'video';
    if (type.startsWith('audio/') || name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.aac') || name.endsWith('.flac') || name.endsWith('.ogg')) return 'audio';
    // allow text/plain to be treated as subtitle only when filename endsWith .srt
    if (type.startsWith('text/') && name.endsWith('.srt')) return 'subtitle';
    return null;
  }

  async function handleMediaFile(file: File) {
    const kind = inferMediaKind(file);
    if (!kind) throw new Error('不支持的素材类型（仅支持图片/视频/音频/SRT）');

    const id = randomId('asset');
    const createdAt = Date.now();
    const name = file.name || kind;

    let text: string | undefined;
    if (kind === 'subtitle') {
      if (!isSrtFilename(name)) showError('字幕文件建议使用 .srt 扩展名');
      try {
        text = await file.text();
      } catch {
        text = undefined;
      }
    }

    store.update((s) => ({
      ...s,
      mediaAssets: [...(Array.isArray(s.mediaAssets) ? s.mediaAssets : []), { id, kind, name, createdAt, text }].slice(-120),
      mvVideoAssetId: kind === 'video' ? id : s.mvVideoAssetId,
      mvAudioAssetId: kind === 'audio' ? id : s.mvAudioAssetId,
      mvSubtitleAssetId: kind === 'subtitle' ? id : s.mvSubtitleAssetId,
    }));
    renderTray();

    const uploaded = await api.upload(file);
    const result = uploaded?.result;
    const localUrl = typeof result?.localUrl === 'string' ? result.localUrl : typeof result?.url === 'string' ? result.url : undefined;
    const url = typeof result?.url === 'string' ? result.url : localUrl;
    store.update((s) => ({
      ...s,
      mediaAssets: s.mediaAssets.map((a) =>
        a.id === id
          ? {
              ...a,
              url,
              localUrl,
              localPath: typeof result?.localPath === 'string' ? result.localPath : undefined,
              localKey: typeof result?.localKey === 'string' ? result.localKey : undefined,
            }
          : a
      ),
    }));
    renderTray();
    showMessage(`已添加素材：${kind === 'subtitle' ? '字幕' : kind === 'audio' ? '音频' : '视频'}（用于 MV）`);
  }

  async function handleImageFile(file: File) {
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
      // Do not auto-select or auto-PAD; respect user's explicit selection.
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
      // Do not auto-select; keep selection explicit for downstream actions (e.g. postprocess).
      selectedReferenceIds: Array.isArray(s.selectedReferenceIds) ? s.selectedReferenceIds.slice(0, 24) : [],
      // UX: if PAD is empty, default the first upload as PAD for MJ; otherwise don't auto-add.
      mjPadRefIds: Array.isArray(s.mjPadRefIds) && s.mjPadRefIds.length ? s.mjPadRefIds.slice(0, 12) : [referenceId],
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

  async function handleFile(file: File) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    const isImage =
      type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.gif');
    if (isImage) return await handleImageFile(file);
    return await handleMediaFile(file);
  }

  uploadInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (!files.length) return;

    for (const file of files) {
      try {
        await handleFile(file);
      } catch (error) {
        showError(`读取素材失败：${(error as Error)?.message}`);
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

  // Prevent accidental page navigation when dropping files near the command hub.
  for (const evt of ['dragover', 'drop'] as const) {
    commandHub?.addEventListener(evt, (e) => {
      const de = e as DragEvent;
      if (!hasDraggedFiles(de)) return;
      de.preventDefault();
    });
  }

  // Drag-and-drop upload (drop on the paperclip area).
  let dragDepth = 0;
  function setDragActive(active: boolean) {
    if (!uploadTrigger) return;
    uploadTrigger.classList.toggle('ring-2', active);
    uploadTrigger.classList.toggle('ring-studio-accent', active);
    uploadTrigger.classList.toggle('bg-studio-accent', active);
    uploadTrigger.classList.toggle('text-studio-bg', active);
  }

  uploadTrigger?.addEventListener('dragenter', (e) => {
    const de = e as DragEvent;
    if (!hasDraggedFiles(de)) return;
    de.preventDefault();
    de.stopPropagation();
    dragDepth += 1;
    setDragActive(true);
  });

  uploadTrigger?.addEventListener('dragover', (e) => {
    const de = e as DragEvent;
    if (!hasDraggedFiles(de)) return;
    de.preventDefault();
    de.stopPropagation();
    if (de.dataTransfer) de.dataTransfer.dropEffect = 'copy';
  });

  uploadTrigger?.addEventListener('dragleave', (e) => {
    const de = e as DragEvent;
    if (!hasDraggedFiles(de)) return;
    de.preventDefault();
    de.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDragActive(false);
  });

  uploadTrigger?.addEventListener('drop', async (e) => {
    const de = e as DragEvent;
    if (!hasDraggedFiles(de)) return;
    de.preventDefault();
    de.stopPropagation();
    dragDepth = 0;
    setDragActive(false);

    const files = extractDroppedFiles(de.dataTransfer);
    if (!files.length) return;

    for (const file of files) {
      try {
        await handleFile(file);
      } catch (error) {
        showError(`读取素材失败：${(error as Error)?.message}`);
      }
    }
  });

  // INITIAL RENDER + AUTOMATIC SYNC
  renderTray();
  store.subscribe(renderTray);
}

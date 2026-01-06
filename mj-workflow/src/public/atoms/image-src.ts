import { isHttpUrl } from './url';

export function toAppImageSrc(src: string): string {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('/api/slice?')) return raw;
  if (raw.startsWith('/api/image?src=')) return raw;
  if (raw.startsWith('/assets/')) return raw;
  if (raw.startsWith('/uploads/')) return `/api/image?src=${encodeURIComponent(raw)}`;
  if (isHttpUrl(raw)) return `/api/image?src=${encodeURIComponent(raw)}`;
  return raw;
}


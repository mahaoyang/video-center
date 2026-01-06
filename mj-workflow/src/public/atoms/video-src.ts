import { isHttpUrl } from './url';

export function toAppVideoSrc(src: string): string {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/video?src=')) return raw;
  if (raw.startsWith('/assets/')) return raw;
  if (isHttpUrl(raw)) return `/api/video?src=${encodeURIComponent(raw)}`;
  return raw;
}


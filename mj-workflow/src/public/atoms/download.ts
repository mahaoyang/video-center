function pad(value: number, width = 2): string {
  return String(Math.trunc(value)).padStart(width, '0');
}

function randomHash4(): string {
  try {
    const bytes = new Uint8Array(2);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      const n = Math.floor(Math.random() * 0x10000);
      bytes[0] = (n >> 8) & 0xff;
      bytes[1] = n & 0xff;
    }
    const b0 = bytes[0] ?? 0;
    const b1 = bytes[1] ?? 0;
    return (((b0 << 8) | b1) & 0xffff).toString(16).padStart(4, '0');
  } catch {
    return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  }
}

function timestampPart(ts = Date.now()): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
    `${pad(d.getMilliseconds(), 3)}`
  );
}

function normalizePrefix(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'file';
}

function normalizeExt(raw: string | undefined): string | undefined {
  const s = String(raw || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  if (!s) return undefined;
  if (!/^[a-z0-9]{2,8}$/.test(s)) return undefined;
  return s;
}

function extFromHref(href: string | undefined): string | undefined {
  const raw = String(href || '').trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw, window.location.href);
    const m = u.pathname.match(/\.([a-zA-Z0-9]{2,8})$/);
    if (!m?.[1]) return undefined;
    return normalizeExt(m[1]);
  } catch {
    const noQuery = raw.split('?')[0]!.split('#')[0]!;
    const m = noQuery.match(/\.([a-zA-Z0-9]{2,8})$/);
    if (!m?.[1]) return undefined;
    return normalizeExt(m[1]);
  }
}

export function buildDownloadFilename(params: {
  prefix: string;
  ext?: string;
  href?: string;
  fallbackExt?: string;
}): string {
  const prefix = normalizePrefix(params.prefix);
  const ext =
    normalizeExt(params.ext) ||
    extFromHref(params.href) ||
    normalizeExt(params.fallbackExt) ||
    'bin';
  return `${prefix}-${timestampPart()}-${randomHash4()}.${ext}`;
}

export function attachDownloadProcessor(link: HTMLAnchorElement): void {
  if (link.dataset.dlBound === '1') return;
  link.dataset.dlBound = '1';
  link.addEventListener('click', () => {
    const prefix = String(link.dataset.dlPrefix || '').trim() || 'file';
    const ext = String(link.dataset.dlExt || '').trim() || undefined;
    const fallbackExt = String(link.dataset.dlFallbackExt || '').trim() || undefined;
    const href = link.getAttribute('href') || undefined;
    link.download = buildDownloadFilename({ prefix, ext, href, fallbackExt });
  });
}

export function bindDownloadProcessor(root: ParentNode): void {
  root.querySelectorAll('a[data-dl-prefix]').forEach((node) => {
    attachDownloadProcessor(node as HTMLAnchorElement);
  });
}

const KEY_AR = 'mj-workflow:mj-ar';

export function getPreferredMjAspectRatio(): string | null {
  try {
    const v = localStorage.getItem(KEY_AR);
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : null;
  } catch {
    return null;
  }
}

export function setPreferredMjAspectRatio(ar: string | null) {
  try {
    const v = typeof ar === 'string' ? ar.trim() : '';
    if (!v) localStorage.removeItem(KEY_AR);
    else localStorage.setItem(KEY_AR, v);
  } catch {
    // ignore
  }
}

export function getPreferredMjVersion(): string {
  return '7';
}


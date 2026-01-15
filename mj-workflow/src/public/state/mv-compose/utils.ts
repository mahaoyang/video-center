export function normalizeSpaces(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function isSrtFilename(name: string): boolean {
  return String(name || '').toLowerCase().endsWith('.srt');
}

export function prettyResolution(value: string): string {
  const v = String(value || '').trim();
  if (!v || v === 'source') return 'Source';
  if (v === '1280x720') return '720P';
  if (v === '1920x1080') return '1080P';
  return v;
}

export function prettySubtitleMode(value: string): string {
  const v = String(value || '').trim();
  if (v === 'burn') return 'Burn';
  return 'Soft';
}

export function prettyAction(value: string): string {
  const v = String(value || '').trim();
  return v === 'clip' ? 'Clip' : 'MV';
}

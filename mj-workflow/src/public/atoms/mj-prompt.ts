import { normalizeMjPromptForGeneration } from './mj-normalize';

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

export function buildMjPrompt(params: {
  basePrompt: string;
  padImages?: Array<string | undefined>;
  srefImageUrl?: string | undefined;
  crefImageUrl?: string | undefined;
  extraArgs?: Array<string | undefined>;
}): string {
  const parts: string[] = [];

  const pad = Array.from(new Set((params.padImages || []).filter(isHttpUrl)));
  if (pad.length) parts.push(...pad);

  const p = (params.basePrompt || '').trim();
  if (p) parts.push(p);

  if (isHttpUrl(params.srefImageUrl)) parts.push(`--sref ${params.srefImageUrl}`);
  if (isHttpUrl(params.crefImageUrl)) parts.push(`--cref ${params.crefImageUrl}`);

  const extra = (params.extraArgs || []).map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  if (extra.length) parts.push(...extra);

  return normalizeMjPromptForGeneration(parts.join(' ').replace(/\s+/g, ' ').trim());
}

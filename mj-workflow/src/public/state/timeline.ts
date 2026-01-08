import type { StreamMessage, StreamMessageKind, StreamMessageRole } from './workflow';
import { toAppImageSrc } from '../atoms/image-src';
import { toAppVideoSrc } from '../atoms/video-src';

export type TimelineResourceType = 'image' | 'video';

export interface TimelineResource {
  type: TimelineResourceType;
  url: string;
  thumbUrl?: string;
  label?: string;
}

export interface TimelineItem {
  id: string;
  createdAt: number;
  role: StreamMessageRole;
  kind: StreamMessageKind;
  text?: string;
  provider?: string;
  progress?: number;
  error?: string;
  resources: TimelineResource[];
}

function pushUnique(out: TimelineResource[], res: TimelineResource) {
  const url = String(res.url || '').trim();
  if (!url) return;
  if (out.some((r) => r.type === res.type && r.url === url)) return;
  out.push({ ...res, url });
}

function clampProgress(p?: number): number | undefined {
  if (typeof p !== 'number' || !Number.isFinite(p)) return undefined;
  return Math.max(0, Math.min(100, p));
}

function resourcesFromMessage(m: StreamMessage): TimelineResource[] {
  const out: TimelineResource[] = [];

  const inputImage = typeof m.imageUrl === 'string' ? toAppImageSrc(m.imageUrl) : '';
  const grid = typeof m.gridImageUrl === 'string' ? toAppImageSrc(m.gridImageUrl) : '';
  const upscaled = typeof m.upscaledImageUrl === 'string' ? toAppImageSrc(m.upscaledImageUrl) : '';
  const peditOutputs =
    Array.isArray(m.peditImageUrls) && m.peditImageUrls.length
      ? m.peditImageUrls.map((u) => toAppImageSrc(u)).filter(Boolean)
      : typeof m.peditImageUrl === 'string'
        ? [toAppImageSrc(m.peditImageUrl)].filter(Boolean)
        : [];
  const thumb = typeof m.thumbnailUrl === 'string' ? toAppImageSrc(m.thumbnailUrl) : '';
  const video = typeof m.videoUrl === 'string' ? toAppVideoSrc(m.videoUrl) : '';

  if (m.kind === 'video') {
    if (inputImage) pushUnique(out, { type: 'image', url: inputImage, label: 'START' });
    if (thumb) pushUnique(out, { type: 'image', url: thumb, label: 'THUMB' });
    if (video) pushUnique(out, { type: 'video', url: video, thumbUrl: thumb || undefined, label: 'VIDEO' });
    return out;
  }

  if (m.kind === 'deconstruct') {
    if (inputImage) pushUnique(out, { type: 'image', url: inputImage, label: 'INPUT' });
    return out;
  }

  if (m.kind === 'generate') {
    if (grid) pushUnique(out, { type: 'image', url: grid, label: 'GRID' });
    return out;
  }

  if (m.kind === 'upscale') {
    if (upscaled) pushUnique(out, { type: 'image', url: upscaled, label: 'UPSCALE' });
    return out;
  }

  if (m.kind === 'pedit') {
    if (inputImage) pushUnique(out, { type: 'image', url: inputImage, label: 'INPUT' });
    for (let i = 0; i < peditOutputs.length; i++) {
      pushUnique(out, { type: 'image', url: peditOutputs[i]!, label: `OUT ${i + 1}` });
    }
    return out;
  }

  if (inputImage) pushUnique(out, { type: 'image', url: inputImage });
  if (grid) pushUnique(out, { type: 'image', url: grid });
  if (upscaled) pushUnique(out, { type: 'image', url: upscaled });
  for (const u of peditOutputs) pushUnique(out, { type: 'image', url: u });
  if (thumb) pushUnique(out, { type: 'image', url: thumb });
  if (video) pushUnique(out, { type: 'video', url: video, thumbUrl: thumb || undefined });

  return out;
}

export function deriveTimelineItems(messages: StreamMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const m of messages) {
    items.push({
      id: m.id,
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      role: m.role,
      kind: m.kind,
      provider: typeof m.provider === 'string' ? m.provider : undefined,
      text: typeof m.text === 'string' ? m.text : undefined,
      progress: clampProgress(m.progress),
      error: typeof m.error === 'string' ? m.error : undefined,
      resources: resourcesFromMessage(m),
    });
  }
  return items;
}

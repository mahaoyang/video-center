import type { ReferenceImage, StreamMessage, TraceTarget, WorkflowState } from './workflow';

export type TraceNode =
  | { type: 'message'; id: string }
  | { type: 'ref'; id: string }
  | { type: 'meta'; key: string; value: string };

function canonicalMediaUrl(raw: string): string {
  const u = String(raw || '').trim();
  if (!u) return '';
  try {
    if (u.startsWith('/api/image?src=')) return decodeURIComponent(u.slice('/api/image?src='.length));
    if (u.startsWith('/api/video?src=')) return decodeURIComponent(u.slice('/api/video?src='.length));
    if (u.startsWith('/api/slice?')) {
      const qs = u.split('?', 2)[1] || '';
      const p = new URLSearchParams(qs);
      const src = p.get('src');
      return src ? decodeURIComponent(src) : u;
    }
  } catch {
    // ignore decode errors
  }
  return u;
}

function outputsFromMessage(m: StreamMessage): string[] {
  const out: string[] = [];
  if (typeof m.gridImageUrl === 'string') out.push(m.gridImageUrl);
  if (typeof m.upscaledImageUrl === 'string') out.push(m.upscaledImageUrl);
  if (Array.isArray(m.peditImageUrls)) out.push(...m.peditImageUrls);
  if (typeof m.peditImageUrl === 'string') out.push(m.peditImageUrl);
  if (typeof m.videoUrl === 'string') out.push(m.videoUrl);
  if (typeof m.thumbnailUrl === 'string') out.push(m.thumbnailUrl);
  return out.map(canonicalMediaUrl).filter(Boolean);
}

function findMessageById(state: WorkflowState, id: string): StreamMessage | undefined {
  return (state.streamMessages || []).find((m) => m.id === id);
}

function findMessageProducingUrl(state: WorkflowState, url: string): StreamMessage | undefined {
  const target = canonicalMediaUrl(url);
  if (!target) return undefined;
  return (state.streamMessages || []).find((m) => outputsFromMessage(m).includes(target));
}

function fallbackParentMessageId(state: WorkflowState, msg: StreamMessage): string | undefined {
  if (typeof msg.parentMessageId === 'string' && msg.parentMessageId.trim()) return msg.parentMessageId.trim();

  if (msg.kind === 'upscale' && typeof msg.upscaleSourceTaskId === 'string' && msg.upscaleSourceTaskId.trim()) {
    const parent = (state.streamMessages || []).find((m) => m.kind === 'generate' && m.taskId === msg.upscaleSourceTaskId);
    if (parent) return parent.id;
  }

  if (msg.kind === 'pedit') {
    const u = Array.isArray(msg.inputImageUrls) && msg.inputImageUrls.length ? msg.inputImageUrls[0] : msg.imageUrl;
    if (typeof u === 'string' && u.trim()) {
      const parent = findMessageProducingUrl(state, u);
      if (parent) return parent.id;
    }
  }

  if (msg.kind === 'video') {
    const u = typeof msg.imageUrl === 'string' ? msg.imageUrl : undefined;
    if (u) {
      const parent = findMessageProducingUrl(state, u);
      if (parent) return parent.id;
    }
  }

  // last-resort: assume linear time
  const before = (state.streamMessages || [])
    .filter((m) => typeof m.createdAt === 'number' && m.createdAt < (msg.createdAt || 0) && m.role === 'ai')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  return before?.id;
}

function mainBranchFromMessage(state: WorkflowState, startMessageId: string): TraceNode[] {
  const nodes: TraceNode[] = [];
  const seen = new Set<string>();
  let cur = String(startMessageId || '').trim();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    nodes.push({ type: 'message', id: cur });
    const msg = findMessageById(state, cur);
    if (!msg) break;
    const parent = fallbackParentMessageId(state, msg);
    cur = parent ? String(parent).trim() : '';
  }
  return nodes;
}

function refNodeAndBranch(state: WorkflowState, ref: ReferenceImage): TraceNode[] {
  const nodes: TraceNode[] = [{ type: 'ref', id: ref.id }];
  const producer = typeof ref.producedByMessageId === 'string' ? ref.producedByMessageId.trim() : '';
  if (producer) return nodes.concat(mainBranchFromMessage(state, producer));

  // fallback: attempt infer from originKey
  const ok = typeof ref.originKey === 'string' ? ref.originKey : '';
  if (ok.startsWith('slice:')) {
    const rest = ok.slice('slice:'.length);
    const idx = rest.lastIndexOf('#');
    const src = idx > 0 ? rest.slice(0, idx) : rest;
    const parent = findMessageProducingUrl(state, src);
    if (parent) return nodes.concat(mainBranchFromMessage(state, parent.id));
  }
  if (ok.startsWith('url:')) {
    const src = ok.slice('url:'.length);
    const parent = findMessageProducingUrl(state, src);
    if (parent) return nodes.concat(mainBranchFromMessage(state, parent.id));
  }

  return nodes;
}

export function deriveTraceNodes(state: WorkflowState, target?: TraceTarget): TraceNode[] {
  if (!target) return [];
  if (target.type === 'message') return mainBranchFromMessage(state, target.id);

  if (target.type === 'ref') {
    const ref = (state.referenceImages || []).find((r) => r.id === target.id);
    if (!ref) return [{ type: 'ref', id: target.id }];
    return refNodeAndBranch(state, ref);
  }

  if (target.type === 'url') {
    const found = findMessageProducingUrl(state, target.url);
    if (found) return mainBranchFromMessage(state, found.id);
    return [{ type: 'meta', key: 'url', value: target.url }];
  }

  return [];
}


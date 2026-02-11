import type { WorkflowState } from './workflow';

function normalizeIds(raw: unknown, limit: number, opts?: { valid?: (id: string) => boolean }): string[] {
  const ids = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const valid = opts?.valid;
  for (const v of ids) {
    const id = String(v || '').trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    if (valid && !valid(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function readSelectedReferenceIds(state: WorkflowState, limit = 24): string[] {
  const existing = new Set((Array.isArray(state.referenceImages) ? state.referenceImages : []).map((r) => r.id));
  return normalizeIds(state.selectedReferenceIds, limit, { valid: (id) => existing.has(id) });
}

export function toggleId(list: string[], id: string, limit: number): string[] {
  const cleaned = String(id || '').trim();
  const normalized = Array.from(new Set((Array.isArray(list) ? list : []).map((x) => String(x || '').trim()).filter(Boolean)));
  if (!cleaned) return normalized.slice(0, limit);

  const idx = normalized.indexOf(cleaned);
  if (idx >= 0) return normalized.filter((x) => x !== cleaned).slice(0, limit);

  const next = [...normalized, cleaned];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

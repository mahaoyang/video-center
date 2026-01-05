export type MjParamValue = string | true;

export interface ParsedMjParams {
  params: Array<{ name: string; value: MjParamValue }>;
  map: Record<string, MjParamValue>;
}

type ParamSpan = {
  name: string;
  rawName: string;
  start: number;
  end: number;
  value: MjParamValue;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function scanParamSpans(input: string): ParamSpan[] {
  const spans: ParamSpan[] = [];
  const re = /(?:^|\s)--([a-zA-Z][\w-]*)/g;
  const matches: Array<{ rawName: string; name: string; matchStart: number; tokenEnd: number }> = [];

  for (;;) {
    const m = re.exec(input);
    if (!m) break;
    const matchStart = m.index;
    const rawName = String(m[1] || '');
    const name = normalizeName(rawName);
    const tokenStart = matchStart + (m[0].startsWith(' ') ? 1 : 0);
    const tokenEnd = tokenStart + 2 + rawName.length;
    matches.push({ rawName, name, matchStart, tokenEnd });
  }

  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const next = matches[i + 1];
    const end = next ? next.matchStart : input.length;
    const rawValue = input.slice(curr.tokenEnd, end).trim();
    const value: MjParamValue = rawValue ? rawValue : true;
    spans.push({ name: curr.name, rawName: curr.rawName, start: curr.matchStart, end, value });
  }

  return spans;
}

export function parseMjParams(input: string): ParsedMjParams {
  const spans = scanParamSpans(input);
  const map: Record<string, MjParamValue> = {};
  for (const s of spans) map[s.name] = s.value;
  return { params: spans.map((s) => ({ name: s.name, value: s.value })), map };
}

export function removeMjParams(input: string, names: string[]): string {
  const remove = new Set(names.map(normalizeName));
  const spans = scanParamSpans(input);
  const kept: string[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (!remove.has(s.name)) continue;
    kept.push(input.slice(cursor, s.start));
    cursor = s.end;
  }
  kept.push(input.slice(cursor));
  return kept.join('').replace(/\s+/g, ' ').trim();
}

export function upsertMjParam(input: string, name: string, value: MjParamValue, synonyms: string[] = []): string {
  const all = [name, ...synonyms];
  const cleaned = removeMjParams(input, all);
  const n = normalizeName(name);
  const suffix = value === true ? `--${n}` : `--${n} ${String(value).trim()}`;
  return `${cleaned} ${suffix}`.replace(/\s+/g, ' ').trim();
}

export function setAspectRatio(input: string, ratio: string): string {
  return upsertMjParam(input, 'ar', ratio, ['aspect']);
}

export function clearAspectRatio(input: string): string {
  return removeMjParams(input, ['ar', 'aspect']);
}


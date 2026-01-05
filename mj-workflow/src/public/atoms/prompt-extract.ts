function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function stripPrefix(line: string): string {
  return line
    .replace(/^\s*\d+\s*[\).、:-]\s*/g, '')
    .replace(/^\s*[-*•]\s*/g, '')
    .replace(/^\s*(shot|scene)\s*\d+\s*[:：.-]\s*/i, '')
    .trim();
}

export function extractShotPrompts(text: string): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean)
    .filter((l) => !l.startsWith('```'));

  const candidates: string[] = [];
  for (const l of lines) {
    const looks =
      /^\d+\s*[\).、:-]\s*/.test(l) ||
      /^[-*•]\s+/.test(l) ||
      /^(shot|scene)\s*\d+\s*[:：.-]\s*/i.test(l);
    if (!looks) continue;
    const c = stripPrefix(l);
    if (c.length < 8) continue;
    candidates.push(c);
  }

  if (!candidates.length && raw.length >= 8) return [raw];

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
    if (uniq.length >= 20) break;
  }
  return uniq;
}


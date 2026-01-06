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

export interface SunoSongPrompts {
  lyricsPrompt: string;
  stylePrompt: string;
}

function isLyricsHeader(line: string): boolean {
  return /^(?:lyrics(?:_prompt)?|lyrics_prompt|歌词(?:提示词)?|LYRICS_PROMPT)\s*[:：]?\s*$/i.test(line.trim());
}

function isStyleHeader(line: string): boolean {
  return /^(?:style(?:_prompt)?|style_prompt|风格(?:提示词)?|STYLE_PROMPT)\s*[:：]?\s*$/i.test(line.trim());
}

function parseHeaderLine(line: string): { kind: 'lyrics' | 'style'; rest: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(
    /^(lyrics(?:_prompt)?|lyrics_prompt|LYRICS_PROMPT|歌词(?:提示词)?|style(?:_prompt)?|style_prompt|STYLE_PROMPT|风格(?:提示词)?)\s*[:：]\s*(.*)$/i
  );
  if (!m) return null;
  const head = (m[1] || '').toLowerCase();
  const rest = (m[2] || '').trim();
  const kind: 'lyrics' | 'style' = head.includes('style') || head.includes('风格') ? 'style' : 'lyrics';
  return { kind, rest };
}

export function extractSunoSongPrompts(text: string): SunoSongPrompts | null {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return null;

  const lines = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('```'));

  let lyricsStart = -1;
  let styleStart = -1;
  let lyricsInline = '';
  let styleInline = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const parsed = parseHeaderLine(line);
    if (parsed) {
      if (parsed.kind === 'lyrics') {
        lyricsStart = i;
        lyricsInline = parsed.rest;
      } else {
        styleStart = i;
        styleInline = parsed.rest;
      }
      continue;
    }

    if (lyricsStart === -1 && isLyricsHeader(line)) lyricsStart = i;
    if (styleStart === -1 && isStyleHeader(line)) styleStart = i;
  }

  if (lyricsStart === -1 || styleStart === -1) return null;

  const slice = (start: number, endExclusive: number) =>
    lines
      .slice(start, endExclusive)
      .join('\n')
      .trim();

  let lyricsPrompt = '';
  let stylePrompt = '';

  if (lyricsStart < styleStart) {
    lyricsPrompt = [lyricsInline, slice(lyricsStart + 1, styleStart)].filter(Boolean).join('\n').trim();
    stylePrompt = [styleInline, slice(styleStart + 1, lines.length)].filter(Boolean).join('\n').trim();
  } else {
    stylePrompt = [styleInline, slice(styleStart + 1, lyricsStart)].filter(Boolean).join('\n').trim();
    lyricsPrompt = [lyricsInline, slice(lyricsStart + 1, lines.length)].filter(Boolean).join('\n').trim();
  }

  if (!lyricsPrompt || !stylePrompt) return null;
  return { lyricsPrompt, stylePrompt };
}

function isShotsHeader(line: string): boolean {
  return /^(?:shots|mj_shots|分镜|镜头)\s*[:：]?\s*$/i.test(line.trim());
}

function parseShotsHeaderLine(line: string): { rest: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^(shots|mj_shots|分镜|镜头)\s*[:：]\s*(.*)$/i);
  if (!m) return null;
  return { rest: (m[2] || '').trim() };
}

export function extractPlannerShots(text: string): string[] {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return [];

  const lines = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('```'));

  let shotsStart = -1;
  let shotsInline = '';
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    if (isLyricsHeader(line) || isStyleHeader(line)) {
      end = Math.min(end, i);
      continue;
    }

    const parsed = parseShotsHeaderLine(line);
    if (parsed) {
      shotsStart = i;
      shotsInline = parsed.rest;
      continue;
    }
    if (shotsStart === -1 && isShotsHeader(line)) shotsStart = i;
  }

  if (shotsStart === -1) return extractShotPrompts(raw);

  const body = [shotsInline, lines.slice(shotsStart + 1, end).join('\n')].filter(Boolean).join('\n').trim();
  return extractShotPrompts(body);
}

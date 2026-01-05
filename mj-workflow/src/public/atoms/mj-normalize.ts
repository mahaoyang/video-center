import { parseMjParams, setAspectRatio, upsertMjParam } from './mj-params';
import { getPreferredMjAspectRatio, getPreferredMjVersion } from './mj-preferences';

export function normalizeMjPromptForGeneration(input: string): string {
  let out = String(input || '').trim();
  const parsed = parseMjParams(out);
  if (!('v' in parsed.map) && !('version' in parsed.map)) {
    out = upsertMjParam(out, 'v', getPreferredMjVersion(), ['version']);
  }

  const ar = getPreferredMjAspectRatio();
  if (ar) out = setAspectRatio(out, ar);

  return out;
}

export function normalizeMjPromptForGeminiDescribe(input: string): string {
  let out = String(input || '').trim();

  // Always pin gemini -> MJ to our defaults.
  out = upsertMjParam(out, 'v', getPreferredMjVersion(), ['version']);

  const ar = getPreferredMjAspectRatio();
  if (ar) out = setAspectRatio(out, ar);

  return out;
}

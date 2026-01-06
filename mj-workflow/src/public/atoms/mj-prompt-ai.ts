import type { ApiClient } from '../adapters/api';
import { showError } from './notify';
import { containsCjk, joinMjPromptParts, normalizeAiSingleLine, splitMjPromptParts, stripMjParamsAndUrls } from './mj-prompt-parts';

export async function translatePromptBodyToEnglishForMj(params: { api: ApiClient; prompt: string }): Promise<string> {
  const original = String(params.prompt || '').trim();
  if (!original) return '';

  const parts = splitMjPromptParts(original);
  const body = String(parts.body || '').trim();
  if (!body) return original;
  if (!containsCjk(body)) return original;

  try {
    const res = await params.api.geminiTranslate({ text: body });
    const raw = String(res?.result?.text || res?.text || '').trim();
    const cleaned = normalizeAiSingleLine(stripMjParamsAndUrls(raw));
    if (!cleaned) return original;
    return joinMjPromptParts({ ...parts, body: cleaned });
  } catch (error) {
    console.error('translatePromptBodyToEnglishForMj failed:', error);
    showError(`提示词翻译失败：${(error as Error)?.message || '未知错误'}`);
    return original;
  }
}

export async function beautifyPromptBodyZh(params: { api: ApiClient; prompt: string; hint?: string }): Promise<string> {
  const original = String(params.prompt || '').trim();
  if (!original) return '';

  const parts = splitMjPromptParts(original);
  const body = String(parts.body || '').trim();
  if (!body) return original;

  try {
    const res = await params.api.geminiBeautify({ text: body, hint: params.hint });
    const raw = String(res?.result?.text || res?.text || '').trim();
    const cleaned = normalizeAiSingleLine(stripMjParamsAndUrls(raw));
    if (!cleaned) return original;
    return joinMjPromptParts({ ...parts, body: cleaned });
  } catch (error) {
    console.error('beautifyPromptBodyZh failed:', error);
    showError(`提示词美化失败：${(error as Error)?.message || '未知错误'}`);
    return original;
  }
}


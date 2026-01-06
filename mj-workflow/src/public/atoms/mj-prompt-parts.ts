import { splitMjPromptParams } from './mj-params';

export interface MjPromptParts {
  refs: string[];
  body: string;
  paramsText: string;
}

function normalizeSpaces(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractUrls(input: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  const re = /(https?:\/\/[^\s]+|data:image\/[^\s]+)/gi;

  const text = String(input || '').replace(re, (m) => {
    const u = String(m || '').trim();
    if (u) urls.push(u);
    return ' ';
  });

  return { text: normalizeSpaces(text), urls };
}

export function splitMjPromptParts(input: string): MjPromptParts {
  const raw = String(input || '').trim();
  const { body: noParamsBody, paramsText } = splitMjPromptParams(raw);
  const { text: body, urls } = extractUrls(noParamsBody);
  return { refs: urls, body, paramsText };
}

export function joinMjPromptParts(parts: MjPromptParts): string {
  const refs = Array.from(new Set((parts.refs || []).map((s) => String(s || '').trim()).filter(Boolean)));
  const chunks = [refs.join(' '), String(parts.body || '').trim(), String(parts.paramsText || '').trim()].filter(Boolean);
  return normalizeSpaces(chunks.join(' '));
}

export function containsCjk(input: string): boolean {
  return /[\u4e00-\u9fff]/.test(String(input || ''));
}

export function normalizeAiSingleLine(input: string): string {
  const raw = String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return '';
  const one = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');

  return normalizeSpaces(
    one
      .replace(/^```[\s\S]*?$/g, '')
      .replace(/^[“”"']|[“”"']$/g, '')
      .trim()
  );
}

export function stripMjParamsAndUrls(input: string): string {
  return splitMjPromptParts(input).body;
}


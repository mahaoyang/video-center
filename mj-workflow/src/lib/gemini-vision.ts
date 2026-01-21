/**
 * Gemini 3 多模态识图 & 图片编辑
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';
import { SUNO_METATAGS_GUIDE } from './suno-metatags-guide';

export interface GeminiVisionClient {
  imageToPrompt(imageUrl: string): Promise<string>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  generateText(system: string, user: string): Promise<string>;
  sunoPrompt(params: { requirement: string; imageUrls?: string[]; mode?: string; language?: string }): Promise<string>;
  youtubeMeta(params: { topic: string; extra?: string; imageUrls?: string[]; language?: string }): Promise<string>;
  editImage(imageUrl: string, editPrompt: string): Promise<string | null>;
  generateOrEditImages(params: {
    prompt: string;
    imageUrls?: string[];
    aspectRatio?: string;
    imageSize?: string;
    responseModalities?: string[];
  }): Promise<Array<{ data: string; mimeType: string }>>;
}

function isImageContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
}

function inferSunoLanguagePreference(requirement: string): 'EN' | 'ZH-CN' | 'ZH-TW' | 'JA' | 'KO' {
  const r = String(requirement || '').toLowerCase();
  // Explicit user intent wins.
  if (/(zh-cn|简体|简中|中文|汉语|普通话)/i.test(requirement)) return 'ZH-CN';
  if (/(zh-tw|繁体|繁中|粵語|粤语)/i.test(requirement)) return 'ZH-TW';
  if (/(ja|日本語|日文|日语)/i.test(requirement)) return 'JA';
  if (/(ko|한국어|韩文|韩语)/i.test(requirement)) return 'KO';
  if (/(en|english|英文)/i.test(requirement)) return 'EN';
  // Default: English.
  if (r.includes('lyrics') || r.includes('vocal')) return 'EN';
  return 'EN';
}

function inferYoutubeLanguagePreference(text: string): 'EN' | 'ZH-CN' | 'ZH-TW' | 'JA' | 'KO' {
  // IMPORTANT: default is EN unless the user explicitly requests otherwise.
  const t = String(text || '');
  if (/(zh-cn|简体|简中|中文|汉语|普通话)/i.test(t)) return 'ZH-CN';
  if (/(zh-tw|繁体|繁中|粵語|粤语)/i.test(t)) return 'ZH-TW';
  if (/(ja|日本語|日文|日语)/i.test(t)) return 'JA';
  if (/(ko|한국어|韩文|韩语)/i.test(t)) return 'KO';
  if (/(en|english|英文)/i.test(t)) return 'EN';
  return 'EN';
}

function isInstrumentalOnly(requirement: string): boolean {
  return /纯音乐|纯伴奏|仅伴奏|无歌词|不要歌词|instrumental|no lyrics|without lyrics/i.test(String(requirement || ''));
}

function rewriteSunoInstrumentalControl(output: string): string {
  const raw = String(output || '').trim();
  if (!raw) return raw;
  const m1 = raw.match(/CONTROL_PROMPT\s*:\s*/i);
  const m2 = raw.match(/STYLE_PROMPT\s*:\s*/i);
  if (!m1 || !m2) return raw;
  const i1 = m1.index ?? -1;
  const i2 = m2.index ?? -1;
  if (i1 < 0 || i2 < 0 || i2 <= i1) return raw;

  let control = raw.slice(i1 + m1[0].length, i2).trim();
  const style = raw.slice(i2 + m2[0].length).trim();

  // Remove any lyrics section if the model still included it.
  const cut = control.match(/\[?\s*Lyrics Version\s*\]?/i);
  if (cut && typeof cut.index === 'number' && cut.index >= 0) {
    control = control.slice(0, cut.index).trim();
  }

  const lines = control
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('[') && l.endsWith(']') ? l : `[${l}]`));

  const fixedControl = lines.join('\n');
  const fixedStyle = style.replace(/\s+/g, ' ').trim();
  return `CONTROL_PROMPT:\n${fixedControl}\n\nSTYLE_PROMPT:\n${fixedStyle}`.trim();
}

async function fetchImageAsBase64(imageUrl: string) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
  const contentType = res.headers.get('content-type');
  if (contentType && !isImageContentType(contentType)) {
    throw new Error(`Fetch image failed: non-image content-type ${contentType}`);
  }
  const buffer = await res.arrayBuffer();
  return {
    data: Buffer.from(buffer).toString('base64'),
    mimeType: contentType || 'image/png',
  };
}

/** 压缩图片：短边128px，JPEG质量70 */
async function compressImage(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  let buffer: Buffer;
  let sourceMimeType: string | null = null;

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;,]+)[;,]/);
    sourceMimeType = match?.[1] || null;
    const base64 = imageUrl.split(',')[1] || '';
    buffer = Buffer.from(base64, 'base64');
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
    sourceMimeType = res.headers.get('content-type');
    if (sourceMimeType && !isImageContentType(sourceMimeType)) {
      throw new Error(`Fetch image failed: non-image content-type ${sourceMimeType}`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
  }

  try {
    const compressed = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'outside' })
      .jpeg({ quality: 70 })
      .toBuffer();

    return { data: compressed.toString('base64'), mimeType: 'image/jpeg' };
  } catch (error) {
    // Fallback: if sharp can't decode the source format, send the original image bytes to Gemini.
    console.warn('compressImage: sharp failed, falling back to original bytes', error);
    return { data: buffer.toString('base64'), mimeType: sourceMimeType || 'image/png' };
  }
}

export function createGeminiVisionClient(opts: { apiKey: string | undefined }): GeminiVisionClient {
  let ai: GoogleGenAI | null = null;

  function getAi(): GoogleGenAI {
    if (!opts.apiKey) throw new Error('未配置 Gemini_KEY');
    if (!ai) ai = new GoogleGenAI({ apiKey: opts.apiKey });
    return ai;
  }

  return {
    /** 反推 MJ 风格提示词（使用压缩图片节省成本） */
    async imageToPrompt(imageUrl: string): Promise<string> {
      const { data, mimeType } = await compressImage(imageUrl);

      const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            {
              text: [
                'Analyze this image and generate a Midjourney-style prompt that could recreate it.',
                'Output the MAIN prompt text in Chinese (简体中文).',
                'You MAY include Midjourney parameters like --ar/--v/--style, but do NOT add any image URLs.',
                'Output ONLY the prompt, nothing else.',
              ].join(' '),
            },
            { inlineData: { mimeType, data } }
          ]
        }],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      return response.text?.trim() || '';
    },

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
      const transcript = (messages || [])
        .map((m) => {
          const role = String(m?.role || 'user').toUpperCase();
          const content = String(m?.content || '').trim();
          if (!content) return '';
          return `${role}: ${content}`;
        })
        .filter(Boolean)
        .join('\n');

      const system = [
        'You are a storyboard and prompt-planning assistant.',
        '',
        'Language:',
        '- The SHOTS prompts MUST be in Simplified Chinese (简体中文) for the main prompt text.',
        '- You MAY include Midjourney parameters like --ar/--v/--style, but do NOT add any image URLs.',
        '',
        'You always do BOTH outputs from the same storyboard:',
        '1) Midjourney: multiple shots/scenes (分镜) as Midjourney-ready prompts.',
        '2) Suno: convert the ordered storyboard into ONE song: a lyrics prompt (with metatags) + a style prompt.',
        '',
        'Return EXACTLY three blocks, in this exact order, with no extra text:',
        'SHOTS:',
        '<numbered list, one MJ prompt per line>',
        'LYRICS_PROMPT:',
        '<metatag-based lyrics prompt>',
        'STYLE_PROMPT:',
        '<style prompt for Suno "Style of Music" field>',
        '',
        'Rules for LYRICS_PROMPT:',
        '- Use Suno metatag format in square brackets, e.g. [Intro], [Verse 1], [Chorus], [Bridge], [Outro].',
        '- You may also add control metatags like [Tempo: 120 BPM], [Mood: ...], [Vocal: ...], [Instruments: ...].',
        '- Reflect the storyboard shots in order (S1→S2→S3...) as a coherent narrative arc in ONE song.',
        '- If the user requests instrumental / no lyrics, output ONLY metatags (no lyric lines).',
        '',
        'Rules for STYLE_PROMPT:',
        '- Short, comma-separated descriptors (genre, era, instrumentation, mood, vocal type).',
        '- Derive from the storyboard theme and image style.',
        '',
        'Rules for SHOTS:',
        '- Numbered list only (1., 2., 3. ...), one prompt per line.',
        '- Each line is a complete Midjourney prompt including style, composition, lighting, and optional parameters like --ar/--v/--style.',
        '',
        'Do not wrap in code blocks.',
      ].join('\n');

      const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [{ text: `${system}\n\n${transcript}`.trim() }],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      return response.text?.trim() || '';
    },

    async generateText(system: string, user: string): Promise<string> {
      const sys = String(system || '').trim();
      const usr = String(user || '').trim();
      if (!usr) return '';

      const prompt = [sys, sys ? '' : null, usr].filter((x) => typeof x === 'string').join('\n').trim();

      const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      return response.text?.trim() || '';
    },

    async sunoPrompt(params: { requirement: string; imageUrls?: string[] }): Promise<string> {
      const requirement = String(params?.requirement || '').trim();
      if (!requirement) return '';

      const urls = Array.isArray(params?.imageUrls) ? params.imageUrls.map((u) => String(u || '').trim()).filter(Boolean) : [];
      const images = await Promise.all(urls.slice(0, 8).map((u) => compressImage(u)));

      const modeOpt = String((params as any)?.mode || '').trim().toLowerCase();
      const langOpt = String((params as any)?.language || '').trim().toLowerCase();
      const instrumentalOnly = modeOpt === 'instrumental' ? true : modeOpt === 'lyrics' ? false : isInstrumentalOnly(requirement);
      const language =
        langOpt === 'zh-cn'
          ? 'ZH-CN'
          : langOpt === 'zh-tw'
            ? 'ZH-TW'
            : langOpt === 'ja'
              ? 'JA'
              : langOpt === 'ko'
                ? 'KO'
                : langOpt === 'en'
                  ? 'EN'
                  : inferSunoLanguagePreference(requirement);

      const system = [
        'You are a Suno prompt designer.',
        'Goal: create a complete Suno prompt package: one CONTROL_PROMPT (for Suno Lyrics field) and one STYLE_PROMPT (for Suno Style of Music field).',
        '',
        'You MUST follow the metatags guide below.',
        '',
        SUNO_METATAGS_GUIDE,
        '',
        'Hard rules:',
        '- Default output language is English (EN). Only switch languages if the user explicitly requests it.',
        '- Do NOT include Markdown code fences.',
        '- Do NOT include explanations.',
        '- Output MUST be EXACTLY two blocks and nothing else, in this exact order:',
        '  CONTROL_PROMPT:',
        '  <text>',
        '  STYLE_PROMPT:',
        '  <one line>',
        '- CONTROL_PROMPT is pasted into Suno Lyrics. Any line NOT wrapped in [ ... ] may be sung as lyrics.',
        '- Therefore: every non-lyric instruction line MUST be wrapped in [ ... ]. Never put plain text stage directions outside [ ... ].',
        '- If MODE is INSTRUMENTAL_ONLY: CONTROL_PROMPT must contain ONLY bracketed metatag lines. Do NOT include any lyrics text and do NOT include a Lyrics Version section.',
        '- If MODE is WITH_LYRICS: you MAY include both [Instrumental Version] and [Lyrics Version]. Lyrics lines (the ones intended to be sung) should be plain text; all structure/directions must be in [ ... ].',
        '- STYLE_PROMPT must be ONE line, concise, comma-separated descriptors.',
        '',
        'The user will provide requirements; images (if any) are visual references for mood/genre/instrumentation.',
      ].join('\n');

      const user = [
        `USER_REQUIREMENTS:\n${requirement}`.trim(),
        '',
        `MODE: ${instrumentalOnly ? 'INSTRUMENTAL_ONLY' : 'WITH_LYRICS'}`,
        `LANGUAGE: ${language}`,
      ].join('\n');

      const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: `${system}\n\n${user}`.trim() },
              ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const out = response.text?.trim() || '';
      return instrumentalOnly ? rewriteSunoInstrumentalControl(out) : out;
    },

    async youtubeMeta(params: { topic: string; extra?: string; imageUrls?: string[]; language?: string }): Promise<string> {
      const topic = String(params?.topic || '').trim();
      const extra = String(params?.extra || '').trim();
      if (!topic) return '';

      const langRaw = String(params?.language || '').trim().toLowerCase();
      const explicitLanguage =
        langRaw === 'zh-cn' || langRaw === 'zh' || langRaw.includes('简')
          ? 'ZH-CN'
          : langRaw === 'zh-tw' || langRaw.includes('繁')
            ? 'ZH-TW'
            : langRaw === 'ja'
              ? 'JA'
              : langRaw === 'ko'
                ? 'KO'
                : langRaw === 'en'
                  ? 'EN'
                  : '';
      const language = explicitLanguage || inferYoutubeLanguagePreference(`${topic}\n${extra}`.trim());

      const urls = Array.isArray(params?.imageUrls) ? params.imageUrls.map((u) => String(u || '').trim()).filter(Boolean) : [];
      const images = await Promise.all(urls.slice(0, 8).map((u) => compressImage(u)));

      const system = [
        'You are a YouTube copywriter.',
        'Task: write ONE natural, human-sounding YouTube title and description.',
        '',
        'Hard rules:',
        '- Default output language is English (EN). Only switch languages if the user explicitly requests it.',
        '- Output MUST be EXACTLY two blocks and nothing else, in this exact order:',
        '  TITLE:',
        '  <one line>',
        '',
        '  DESCRIPTION:',
        '  <multi-line>',
        '- No markdown code fences.',
        '- No explanations.',
        '- The title should feel human (人味), not clickbait, and stay concise.',
        '- The description should be clear and useful: hook + summary + what viewers will learn + optional CTA.',
        '- Use details from the topic text and the provided images (if any).',
      ].join('\n');

      const user = [
        `OUTPUT_LANGUAGE: ${language}`,
        '',
        `VIDEO_TOPIC:\n${topic}`,
        extra ? `\n\nEXTRA_REQUIREMENTS:\n${extra}` : '',
      ]
        .join('')
        .trim();

      const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: `${system}\n\n${user}`.trim() },
              ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      return response.text?.trim() || '';
    },

    /** 使用 Gemini 3 Pro Image 编辑图片（可选） */
    async editImage(imageUrl: string, editPrompt: string): Promise<string | null> {
      const { data, mimeType } = await fetchImageAsBase64(imageUrl);

      const response = await getAi().models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          parts: [
            { text: editPrompt },
            { inlineData: { mimeType, data } }
          ]
        }]
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      }
      return null;
    },

    /**
     * Gemini 3 Pro Image: 文生图 / 多图编辑/合成
     * - imageUrls 为空 => text-to-image
     * - imageUrls 非空 => prompt + 参考图 inlineData（顺序由调用方保证）
     */
    async generateOrEditImages(params): Promise<Array<{ data: string; mimeType: string }>> {
      const prompt = String(params?.prompt || '').trim();
      if (!prompt) return [];

      const parts: any[] = [{ text: prompt }];
      const urls = Array.isArray(params?.imageUrls) ? params.imageUrls.filter((u) => typeof u === 'string' && u.trim()) : [];
      for (const u of urls) {
        const { data, mimeType } = await fetchImageAsBase64(u);
        parts.push({ inlineData: { mimeType, data } });
      }

      const response = await getAi().models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{ parts }],
        config: {
          responseModalities:
            Array.isArray(params?.responseModalities) && params.responseModalities.length ? params.responseModalities : ['IMAGE'],
          imageConfig: {
            aspectRatio: typeof params?.aspectRatio === 'string' ? params.aspectRatio : undefined,
            imageSize: typeof params?.imageSize === 'string' ? params.imageSize : undefined,
          },
        },
      });

      const out: Array<{ data: string; mimeType: string }> = [];
      const candidate = response.candidates?.[0];
      const respParts: any[] = (candidate as any)?.content?.parts || [];
      for (const p of respParts) {
        const inline = p?.inlineData;
        if (inline?.data) {
          out.push({
            data: String(inline.data),
            mimeType: String(inline.mimeType || 'image/png'),
          });
        }
      }
      return out;
    },
  };
}

/**
 * Gemini 3 多模态识图 & 图片编辑
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';

export interface GeminiVisionClient {
  imageToPrompt(imageUrl: string): Promise<string>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  generateText(system: string, user: string): Promise<string>;
  editImage(imageUrl: string, editPrompt: string): Promise<string | null>;
}

function isImageContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
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
    }
  };
}

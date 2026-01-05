/**
 * Gemini 3 多模态识图 & 图片编辑
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';

export interface GeminiVisionClient {
  imageToPrompt(imageUrl: string): Promise<string>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
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
            { text: 'Analyze this image and generate a Midjourney-style prompt that could recreate it. Include style, mood, lighting, composition, and technical parameters like --ar, --v, --style. Output ONLY the prompt, nothing else.' },
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
        'Help the user plan multiple shots/scenes (分镜) as Midjourney-ready prompts.',
        'When returning multiple prompts, output them as a numbered list, one prompt per line.',
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

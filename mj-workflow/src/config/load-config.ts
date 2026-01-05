export interface AppConfig {
  port: number;
  mj: {
    apiUrl: string;
    token: string;
  };
  llm: {
    apiUrl: string;
    token: string;
    visionModel: string;
  };
  gemini: {
    apiKey: string | undefined;
  };
  imageproxy: {
    apiUrl: string;
    token: string;
  };
  diagnostics: {
    mjTokenSource: 'MJ_API_TOKEN' | 'YUNWU_MJ_KEY' | 'none';
    llmTokenSource: 'LLM_API_TOKEN' | 'YUNWU_ALL_KEY' | 'none';
    imageproxyTokenSource: 'IMAGEPROXY_TOKEN' | 'YUNWU_API_KEY' | 'YUNWU_ALL_KEY' | 'none';
    portSource: 'env' | 'file' | 'default';
  };
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeBaseUrl(url: string): string {
  return stripQuotes(url).replace(/\/$/, '');
}

function readPort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(stripQuotes(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1));
    if (key) out[key] = value;
  }
  return out;
}

function readEnvLocal(dir: string | undefined): Record<string, string> {
  if (!dir) return {};
  try {
    const filePath = join(dir, '.env.local');
    if (!existsSync(filePath)) return {};
    return parseDotEnv(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function getEnvValue(
  env: Record<string, string | undefined>,
  fallback: Record<string, string>,
  key: string
): string | undefined {
  const direct = env[key];
  if (typeof direct === 'string' && direct.trim() !== '') return stripQuotes(direct);
  const fromFile = fallback[key];
  if (typeof fromFile === 'string' && fromFile.trim() !== '') return stripQuotes(fromFile);
  return undefined;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  opts?: { projectDir?: string }
): AppConfig {
  // Single source of truth: .env.local (repo-root preferred, projectDir fallback)
  const fileEnv = {
    ...readEnvLocal(opts?.projectDir ? dirname(opts.projectDir) : undefined),
    ...readEnvLocal(opts?.projectDir),
  };

  const mjApiToken = getEnvValue(env, fileEnv, 'MJ_API_TOKEN');
  const yunwuMjKey = getEnvValue(env, fileEnv, 'YUNWU_MJ_KEY');
  const llmApiToken = getEnvValue(env, fileEnv, 'LLM_API_TOKEN');
  const imageproxyToken = getEnvValue(env, fileEnv, 'IMAGEPROXY_TOKEN');

  const yunwuAllKey = getEnvValue(env, fileEnv, 'YUNWU_ALL_KEY');
  const yunwuApiKey = getEnvValue(env, fileEnv, 'YUNWU_API_KEY');

  const mjApiUrl = normalizeBaseUrl(getEnvValue(env, fileEnv, 'MJ_API_URL') || 'https://yunwu.ai');
  // Prefer names used in repo .env.local; keep legacy aliases as fallback.
  const mjToken = yunwuMjKey || mjApiToken || '';

  const llmApiUrl = normalizeBaseUrl(
    getEnvValue(env, fileEnv, 'LLM_API_URL') || getEnvValue(env, fileEnv, 'MJ_API_URL') || 'https://yunwu.ai'
  );
  const llmToken = yunwuAllKey || llmApiToken || '';
  const visionModel = getEnvValue(env, fileEnv, 'VISION_MODEL') || 'gpt-5.2-chat-latest';

  const imageproxyEffectiveToken = imageproxyToken || yunwuApiKey || yunwuAllKey || '';

  const rawPortFromEnv = typeof env.PORT === 'string' && env.PORT.trim() !== '' ? stripQuotes(env.PORT) : undefined;
  const rawPortFromFile =
    !rawPortFromEnv && typeof fileEnv.PORT === 'string' && fileEnv.PORT.trim() !== '' ? stripQuotes(fileEnv.PORT) : undefined;
  const rawPort = rawPortFromEnv || rawPortFromFile;
  const portSource: AppConfig['diagnostics']['portSource'] = rawPortFromEnv ? 'env' : rawPortFromFile ? 'file' : 'default';

  return {
    port: readPort(rawPort, 3000),
    mj: { apiUrl: mjApiUrl, token: mjToken },
    llm: { apiUrl: llmApiUrl, token: llmToken, visionModel },
    gemini: { apiKey: getEnvValue(env, fileEnv, 'Gemini_KEY') },
    imageproxy: {
      apiUrl: normalizeBaseUrl(getEnvValue(env, fileEnv, 'IMAGEPROXY_API_URL') || 'https://imageproxy.zhongzhuan.chat'),
      token: imageproxyEffectiveToken,
    },
    diagnostics: {
      mjTokenSource: yunwuMjKey ? 'YUNWU_MJ_KEY' : mjApiToken ? 'MJ_API_TOKEN' : 'none',
      llmTokenSource: yunwuAllKey ? 'YUNWU_ALL_KEY' : llmApiToken ? 'LLM_API_TOKEN' : 'none',
      imageproxyTokenSource: imageproxyToken
        ? 'IMAGEPROXY_TOKEN'
        : yunwuApiKey
          ? 'YUNWU_API_KEY'
          : yunwuAllKey
            ? 'YUNWU_ALL_KEY'
            : 'none',
      portSource,
    },
  };
}

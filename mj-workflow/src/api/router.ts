import type { MJApi } from '../lib/mj-api';
import type { YunwuChatApi } from '../lib/yunwu-chat';
import type { GeminiVisionClient } from '../lib/gemini-vision';
import type { GeminiVideoClient } from '../lib/gemini-video';
import type { ImageProxyClient } from '../lib/imageproxy';
import type { VideoApi } from '../lib/video-api';
import type { VisionDescribeRequest } from '../types';
import { json, jsonError, readJson } from '../http/json';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

function extractAssistantText(raw: any): string {
  try {
    const choice = raw?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n');
    }
  } catch {
    // ignore
  }
  return '';
}

function normalizeInputImageUrl(req: Request, value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return new URL(raw, req.url).toString();
}

function sniffImageExt(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    // PNG
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return '.png';
    }
  }

  if (bytes.length >= 3) {
    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return '.jpg';
    }
  }

  if (bytes.length >= 12) {
    // WEBP: RIFF....WEBP
    const riff =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const webp =
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (riff && webp) return '.webp';
  }

  if (bytes.length >= 6) {
    // GIF
    const gif87a =
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x37 && bytes[5] === 0x61;
    const gif89a =
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x39 && bytes[5] === 0x61;
    if (gif87a || gif89a) return '.gif';
  }

  return null;
}

function normalizeImageExt(ext: string): string {
  const lower = String(ext || '').toLowerCase();
  if (lower === '.jpeg') return '.jpg';
  return lower;
}

function mimeFromImageExt(ext: string): string {
  const e = normalizeImageExt(ext);
  if (e === '.png') return 'image/png';
  if (e === '.jpg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function normalizeNonImageExt(ext: string): string {
  return String(ext || '').toLowerCase();
}

const allowedUploadExts = new Set([
  // images (still sniffed)
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // video
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  // audio
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  // text
  '.txt',
  '.srt',
]);

const ffmpegFilterCache = new Map<string, boolean>();

async function runCommand(args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(args, { cwd: opts?.cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(''),
    proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(''),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

function tailLines(text: string, maxChars = 1600): string {
  const raw = String(text || '');
  if (raw.length <= maxChars) return raw;
  return raw.slice(-maxChars);
}

function parseNumberLike(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseNullableNumberLike(value: unknown): number | null | undefined {
  if (value === null) return null;
  return parseNumberLike(value);
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function ffmpegHasFilter(name: string): Promise<boolean> {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return false;
  const cached = ffmpegFilterCache.get(key);
  if (typeof cached === 'boolean') return cached;
  try {
    const res = await runCommand(['ffmpeg', '-hide_banner', '-h', `filter=${key}`]);
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    const ok = !out.includes('Unknown filter') && !out.includes('No such filter');
    ffmpegFilterCache.set(key, ok);
    return ok;
  } catch {
    ffmpegFilterCache.set(key, false);
    return false;
  }
}

function parseLoudnormJson(stderr: string): any {
  const matches = String(stderr || '').match(/\{[\s\S]*?\}/g);
  if (!matches || !matches.length) throw new Error('Failed to find loudnorm JSON in ffmpeg output.');
  try {
    return JSON.parse(matches[matches.length - 1]!);
  } catch {
    throw new Error('Failed to parse loudnorm JSON in ffmpeg output.');
  }
}

function formatLoudnormSecondPass(measure: any): string {
  const required = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'];
  const missing = required.filter((k) => measure?.[k] === undefined || measure?.[k] === null);
  if (missing.length) throw new Error(`loudnorm JSON missing keys: ${missing.join(', ')}`);
  const f = (k: string) => `${Number(measure[k]).toFixed(6)}`;
  return (
    'loudnorm=I=-16:TP=-1.5:LRA=11:' +
    `measured_I=${f('input_i')}:` +
    `measured_TP=${f('input_tp')}:` +
    `measured_LRA=${f('input_lra')}:` +
    `measured_thresh=${f('input_thresh')}:` +
    `offset=${f('target_offset')}:` +
    'print_format=summary'
  );
}

async function sampleRateFromFile(inputPath: string): Promise<number> {
  try {
    const res = await runCommand([
      'ffprobe',
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    const v = Number(String(res.stdout || '').trim());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    // ignore
  }
  return 48000;
}

async function buildAudioFiltergraph(params: {
  sampleRate: number;
  includeLoudnorm: string;
  tempo: number;
  stereoDelayMs: number;
  noiseDbfs: number | null;
}): Promise<string> {
  const tempo = params.tempo;
  const rubberband = await ffmpegHasFilter('rubberband');
  const firequalizer = await ffmpegHasFilter('firequalizer');
  const vibrato = await ffmpegHasFilter('vibrato');
  const stereotools = await ffmpegHasFilter('stereotools');
  const anoisesrc = await ffmpegHasFilter('anoisesrc');

  const tempoFilter = Math.abs(tempo - 1.0) < 1e-9 ? '' : rubberband ? `rubberband=tempo=${tempo.toFixed(7)},` : `atempo=${tempo.toFixed(7)},`;
  const eq = firequalizer ? "firequalizer=gain='if(gt(f,16000),-0.8,0)'," : '';
  const vib = vibrato ? 'vibrato=f=0.3:d=0.00002,' : '';

  // Redundancy-sim defaults are conservative and effectively "off" unless tuned.
  const timeFluctEnabled = false;
  const timeFluctFreqHz = 0.25;
  const timeFluctDepth = 0.00001;
  const msSideGain = 0.95;
  const stereoDelayMs = params.stereoDelayMs;
  const stereoPhaseDeg = 0.0;
  const noiseDbfs: number | null = params.noiseDbfs; // e.g. -84
  const noiseColor = 'pink';
  const noiseHighpassHz = 12000.0;
  const noiseLowpassHz = 19000.0;

  const vibratoFilter = (freqHz: number, depth: number) => {
    if (!vibrato) return '';
    if (!Number.isFinite(freqHz) || !Number.isFinite(depth)) return '';
    if (depth <= 0) return '';
    const f = Math.max(0.1, Math.min(20000, freqHz));
    const d = Math.max(0, Math.min(1, depth));
    return `vibrato=f=${f.toFixed(6)}:d=${d.toFixed(8)},`;
  };

  const stereoPhaseFilter = (delayMs: number, phaseDeg: number) => {
    if (!stereotools) return '';
    const d = Number.isFinite(delayMs) ? delayMs : 0;
    const p = Number.isFinite(phaseDeg) ? phaseDeg : 0;
    if (Math.abs(d) < 1e-12 && Math.abs(p) < 1e-12) return '';
    const parts: string[] = [];
    if (Math.abs(d) >= 1e-12) parts.push(`delay=${Math.max(-20, Math.min(20, d)).toFixed(9)}`);
    if (Math.abs(p) >= 1e-12) parts.push(`phase=${Math.max(0, Math.min(360, p)).toFixed(9)}`);
    return parts.length ? `stereotools=${parts.join(':')},` : '';
  };

  const noiseMixGraph = () => {
    if (!anoisesrc) return '';
    if (typeof noiseDbfs !== 'number' || !Number.isFinite(noiseDbfs)) return '';
    const amp = Math.max(0, Math.min(1, Math.pow(10, noiseDbfs / 20)));
    if (amp <= 0) return '';
    const sr = params.sampleRate;
    const hp = Math.max(0, Math.min(sr / 2, noiseHighpassHz));
    let lp = Math.max(0, Math.min(sr / 2, noiseLowpassHz));
    if (lp && hp && lp <= hp) lp = Math.max(0, Math.min(sr / 2, hp + 10));
    const nHp = hp > 1e-9 ? `highpass=f=${hp.toFixed(3)},` : '';
    const nLp = lp > 1e-9 ? `lowpass=f=${lp.toFixed(3)},` : '';
    const color = ['white', 'pink', 'brown', 'blue', 'violet', 'velvet'].includes(noiseColor) ? noiseColor : 'pink';
    return (
      `[a]anull[a0];` +
      `anoisesrc=r=${sr}:a=${amp.toFixed(10)}:c=${color}[n0];` +
      `[n0]${nHp}${nLp}pan=stereo|c0=c0|c1=c0[n];` +
      `[a0][n]amix=inputs=2:duration=first:normalize=0,`
    );
  };

  const noiseGraph = noiseMixGraph();
  const useNoise = Boolean(noiseGraph);

  const base =
    '[0:a]' +
    tempoFilter +
    'aformat=channel_layouts=stereo,' +
    'highpass=f=20,' +
    'lowpass=f=19500,' +
    eq +
    vibratoFilter(timeFluctFreqHz, timeFluctEnabled ? timeFluctDepth : 0) +
    'acompressor=threshold=0.1:ratio=1.15:attack=25:release=250:knee=2,' +
    'asplit[m1][m2];' +
    '[m1]pan=1c|c0=0.5*c0+0.5*c1[mid];' +
    '[m2]pan=1c|c0=0.5*c0-0.5*c1,' +
    'highpass=f=5000,' +
    vib +
    `volume=${msSideGain.toFixed(6)}[side];` +
    '[mid][side]join=inputs=2:channel_layout=stereo[ms];' +
    `[ms]pan=stereo|c0=c0+c1|c1=c0-c1,` +
    stereoPhaseFilter(stereoDelayMs, stereoPhaseDeg) +
    `aresample=${params.sampleRate}` +
    (useNoise ? '[a];' : ',') +
    (useNoise ? noiseGraph : '') +
    params.includeLoudnorm;

  return base;
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '::1') return true;
  if (isPrivateIpv4(h)) return true;
  return false;
}

function cacheKeyFromSrc(src: string): string {
  return createHash('sha256').update(String(src || ''), 'utf8').digest('hex');
}

async function readExternalImageCache(cacheDir: string, key: string): Promise<Uint8Array | null> {
  const filePath = join(cacheDir, key);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  return bytes.length ? bytes : null;
}

async function writeExternalImageCache(cacheDir: string, key: string, bytes: Uint8Array): Promise<void> {
  if (!bytes.length) return;
  await mkdir(cacheDir, { recursive: true });
  try {
    await writeFile(join(cacheDir, key), bytes, { flag: 'wx' });
  } catch (error: any) {
    if (error?.code === 'EEXIST') return;
    throw error;
  }
}

async function fetchExternalImageBytes(req: Request, absolute: URL): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const headers: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; MJ-Workflow/1.0; +https://localhost)',
  };
  const referer = req.headers.get('referer');
  if (referer) headers.Referer = referer;

  const timeouts = [15000, 25000];
  let lastError: unknown;
  for (const ms of timeouts) {
    try {
      const resp = await fetch(absolute.toString(), { headers, signal: AbortSignal.timeout(ms) });
      if (!resp.ok) throw new Error(`拉取图片失败: ${resp.status}`);
      const contentType = resp.headers.get('content-type');
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      if (bytes.length > 25 * 1024 * 1024) throw new Error('图片过大（>25MB）');
      return { bytes, contentType };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('拉取图片失败');
}

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function mediaBackendUrlFromEnv(): string {
  const raw = process.env.PY_MEDIA_BACKEND_URL || process.env.MEDIA_BACKEND_URL || 'http://localhost:9010';
  return normalizeBaseUrl(raw);
}

function resolveUploadsLocalPath(uploadsDir: string, src: string): string | null {
  const raw = String(src || '').trim();
  const m = raw.match(/^\/uploads\/([^/?#]+)$/);
  if (!m) return null;
  const key = basename(m[1]!);
  if (!key || key !== m[1]) return null;
  return join(uploadsDir, key);
}

function safeFfmpegInputForSrc(req: Request, uploadsDir: string, src: string): string {
  const raw = String(src || '').trim();
  if (!raw) throw new Error('素材 URL 为空');
  if (raw.startsWith('data:')) throw new Error('不支持 data: URL 作为 ffmpeg 输入，请先上传到 /uploads');
  if (raw.startsWith('/uploads/')) {
    const p = resolveUploadsLocalPath(uploadsDir, raw);
    if (!p) throw new Error('uploads 路径解析失败');
    return p;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Allow relative URLs served by this app.
  return new URL(raw, req.url).toString();
}

function parseResolution(value: string | undefined): { w: number; h: number } | null {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

type MvComposeSubtitleMode = 'burn' | 'soft';
type MvComposeAction = 'mv' | 'clip';
type MvComposeVisualItem = { url: string; durationSeconds?: number };
type MvComposeRequestBody = {
  prompt?: string;
  text?: string;
  visualImageUrls?: string[];
  visualSequence?: Array<{ url?: string; durationSeconds?: number }>;
  videoUrl?: string;
  audioUrl?: string;
  subtitleSrt?: string;
  action?: string;
  subtitleMode?: string;
  resolution?: string;
  fps?: number;
  durationSeconds?: number;
};

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeMvComposeVisualSequence(input: unknown): MvComposeVisualItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((it) => ({
      url: String(it?.url || '').trim(),
      durationSeconds: typeof it?.durationSeconds === 'number' && Number.isFinite(it.durationSeconds) ? it.durationSeconds : undefined,
    }))
    .filter((it) => Boolean(it.url))
    .slice(0, 24);
}

function normalizeMvComposeVisualImageUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 24);
}

function escapeFfmpegSubtitlesPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
}

async function prepareSubtitleFileIfNeeded(opts: {
  dryRun: boolean;
  uploadsDir: string;
  subtitleSrt: string;
}): Promise<{ subtitlePath: string }> {
  const subtitleSrt = opts.subtitleSrt;
  if (!subtitleSrt || !subtitleSrt.trim()) return { subtitlePath: '' };

  const key = `${randomUUID()}.srt`;
  const filePath = join(opts.uploadsDir, key);
  if (!opts.dryRun) await writeFile(filePath, subtitleSrt, 'utf8');
  return { subtitlePath: filePath };
}

function prepareMvComposeOutput(opts: { uploadsDir: string; uploadsPublicPath: string }): {
  outPath: string;
  outputUrl: string;
} {
  const outKey = `${randomUUID()}.mp4`;
  const outPath = join(opts.uploadsDir, outKey);
  const outputUrl = `${opts.uploadsPublicPath}/${outKey}`;
  return { outPath, outputUrl };
}

function buildMvComposeVf(opts: {
  resolution: { w: number; h: number } | null;
  subtitleMode: MvComposeSubtitleMode;
  subtitlePath: string;
}): string[] {
  const vf: string[] = [];
  if (opts.resolution) {
    vf.push(`scale=${opts.resolution.w}:${opts.resolution.h}:force_original_aspect_ratio=decrease`);
    vf.push(`pad=${opts.resolution.w}:${opts.resolution.h}:(ow-iw)/2:(oh-ih)/2`);
  }
  if (opts.subtitleMode === 'burn' && opts.subtitlePath) {
    vf.push(`subtitles='${escapeFfmpegSubtitlesPath(opts.subtitlePath)}'`);
  }
  if (vf.length) vf.push('format=yuv420p');
  return vf;
}

function getMvComposeImages(opts: {
  visualSequence: MvComposeVisualItem[];
  visualImageUrls: string[];
}): MvComposeVisualItem[] {
  return opts.visualSequence.length
    ? opts.visualSequence
    : opts.visualImageUrls.map((url) => ({ url, durationSeconds: undefined }));
}

function buildMvComposeImageSequenceArgs(ctx: {
  req: Request;
  uploadsDir: string;
  images: MvComposeVisualItem[];
  durationSeconds: number;
  fps: number;
  resolution: { w: number; h: number } | null;
  inputAudio: string;
  subtitleMode: MvComposeSubtitleMode;
  subtitlePath: string;
  outPath: string;
}): string[] {
  const dflt = ctx.durationSeconds;
  const args: string[] = ['-y'];
  for (const it of ctx.images) {
    const d = typeof it.durationSeconds === 'number' && it.durationSeconds > 0 ? it.durationSeconds : dflt;
    args.push('-loop', '1', '-t', String(d), '-i', safeFfmpegInputForSrc(ctx.req, ctx.uploadsDir, it.url));
  }

  let audioIndex = -1;
  if (ctx.inputAudio) {
    audioIndex = ctx.images.length;
    args.push('-i', ctx.inputAudio);
  }

  let subtitleIndex = -1;
  if (ctx.subtitleMode === 'soft' && ctx.subtitlePath) {
    subtitleIndex = ctx.inputAudio ? ctx.images.length + 1 : ctx.images.length;
    args.push('-i', ctx.subtitlePath);
  }

  const filters: string[] = [];
  const concatInputs: string[] = [];
  for (let i = 0; i < ctx.images.length; i++) {
    concatInputs.push(`[v${i}]`);
    filters.push(`[${i}:v]setsar=1[v${i}]`);
  }

  const post: string[] = [];
  if (ctx.resolution) {
    post.push(`scale=${ctx.resolution.w}:${ctx.resolution.h}:force_original_aspect_ratio=decrease`);
    post.push(`pad=${ctx.resolution.w}:${ctx.resolution.h}:(ow-iw)/2:(oh-ih)/2`);
  }
  if (ctx.subtitleMode === 'burn' && ctx.subtitlePath) {
    post.push(`subtitles='${escapeFfmpegSubtitlesPath(ctx.subtitlePath)}'`);
  }
  post.push(`fps=${ctx.fps}`);
  post.push('format=yuv420p');

  if (ctx.images.length > 1) {
    filters.push(`${concatInputs.join('')}concat=n=${ctx.images.length}:v=1:a=0[vcat]`);
    filters.push(`[vcat]${post.join(',')}[vout]`);
  } else {
    filters.push(`[v0]${post.join(',')}[vout]`);
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', '[vout]');
  if (ctx.inputAudio) args.push('-map', `${audioIndex}:a:0`);
  if (subtitleIndex >= 0) args.push('-map', `${subtitleIndex}:s:0`);

  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
  if (ctx.inputAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  if (subtitleIndex >= 0) args.push('-c:s', 'mov_text');
  args.push('-movflags', '+faststart');
  args.push(ctx.outPath);
  return args;
}

function buildMvComposeVideoTranscodeArgs(ctx: {
  inputVideo: string;
  inputImage: string;
  inputAudio: string;
  trimSeconds?: number;
  fps: number;
  subtitleMode: MvComposeSubtitleMode;
  subtitlePath: string;
  vf: string[];
  outPath: string;
}): string[] {
  const args: string[] = ['-y'];
  if (ctx.inputVideo) args.push('-i', ctx.inputVideo);
  else args.push('-loop', '1', '-framerate', String(ctx.fps), '-i', ctx.inputImage);

  let audioIndex = -1;
  if (ctx.inputAudio) {
    audioIndex = 1;
    args.push('-i', ctx.inputAudio);
  }

  let subtitleIndex = -1;
  if (ctx.subtitleMode === 'soft' && ctx.subtitlePath) {
    subtitleIndex = ctx.inputAudio ? 2 : 1;
    args.push('-i', ctx.subtitlePath);
  }

  if (typeof ctx.trimSeconds === 'number' && Number.isFinite(ctx.trimSeconds) && ctx.trimSeconds > 0) {
    args.push('-t', String(ctx.trimSeconds));
  }
  if (ctx.inputAudio) args.push('-shortest');

  args.push('-map', '0:v:0');
  if (ctx.inputAudio) args.push('-map', `${audioIndex}:a:0`);
  else if (ctx.inputVideo) args.push('-map', '0:a?:0');
  if (subtitleIndex >= 0) args.push('-map', `${subtitleIndex}:s:0`);

  if (ctx.vf.length) args.push('-vf', ctx.vf.join(','));
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
  if (ctx.inputAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  else if (ctx.inputVideo) args.push('-c:a', 'copy');
  if (subtitleIndex >= 0) args.push('-c:s', 'mov_text');
  args.push('-movflags', '+faststart');
  args.push(ctx.outPath);
  return args;
}

function buildMvComposeCopyArgsIfPossible(ctx: {
  inputVideo: string;
  inputAudio: string;
  trimSeconds?: number;
  subtitleMode: MvComposeSubtitleMode;
  subtitlePath: string;
  vf: string[];
  outPath: string;
}): string[] | null {
  if (!ctx.inputVideo) return null;
  if (ctx.vf.length) return null;

  const args: string[] = ['-y', '-i', ctx.inputVideo];
  if (typeof ctx.trimSeconds === 'number' && Number.isFinite(ctx.trimSeconds) && ctx.trimSeconds > 0) {
    args.push('-t', String(ctx.trimSeconds));
  }

  let audioIndex = -1;
  if (ctx.inputAudio) {
    audioIndex = 1;
    args.push('-i', ctx.inputAudio);
  }

  let subtitleIndex = -1;
  if (ctx.subtitleMode === 'soft' && ctx.subtitlePath) {
    subtitleIndex = ctx.inputAudio ? 2 : 1;
    args.push('-i', ctx.subtitlePath);
  }

  args.push('-map', '0:v:0');
  if (ctx.inputAudio) args.push('-map', `${audioIndex}:a:0`);
  else args.push('-map', '0:a?:0');
  if (subtitleIndex >= 0) args.push('-map', `${subtitleIndex}:s:0`);

  args.push('-c:v', 'copy');
  if (ctx.inputAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  else args.push('-c:a', 'copy');
  if (subtitleIndex >= 0) args.push('-c:s', 'mov_text');
  args.push('-movflags', '+faststart');
  args.push(ctx.outPath);
  return args;
}

function buildMvComposeCandidates(ctx: {
  uploadsDir: string;
  inputVideo: string;
  inputImage: string;
  inputAudio: string;
  imageDurationSeconds: number;
  trimSeconds?: number;
  fps: number;
  resolution: { w: number; h: number } | null;
  subtitleMode: MvComposeSubtitleMode;
  subtitlePath: string;
  visualSequence: MvComposeVisualItem[];
  visualImageUrls: string[];
  outPath: string;
  outputUrl: string;
  req: Request;
}): { outputUrl: string; candidates: any[] } {
  const vf = buildMvComposeVf({ resolution: ctx.resolution, subtitleMode: ctx.subtitleMode, subtitlePath: ctx.subtitlePath });

  const candidates: any[] = [];

  const copyArgs = buildMvComposeCopyArgsIfPossible({
    inputVideo: ctx.inputVideo,
    inputAudio: ctx.inputAudio,
    trimSeconds: ctx.trimSeconds,
    subtitleMode: ctx.subtitleMode,
    subtitlePath: ctx.subtitlePath,
    vf,
    outPath: ctx.outPath,
  });

  if (copyArgs) {
    candidates.push({
      label: 'copy',
      encodeCount: 0,
      score: 0,
      commands: [{ cwd: ctx.uploadsDir, args: copyArgs }],
      fallbackCommands: [{ cwd: ctx.uploadsDir, args: ['-y', '-fflags', '+genpts', ...copyArgs.slice(1)] }],
    });
  }

  const transcodeArgs = ctx.inputVideo
    ? buildMvComposeVideoTranscodeArgs({
        inputVideo: ctx.inputVideo,
        inputImage: ctx.inputImage,
        inputAudio: ctx.inputAudio,
        trimSeconds: ctx.trimSeconds,
        fps: ctx.fps,
        subtitleMode: ctx.subtitleMode,
        subtitlePath: ctx.subtitlePath,
        vf,
        outPath: ctx.outPath,
      })
    : buildMvComposeImageSequenceArgs({
        req: ctx.req,
        uploadsDir: ctx.uploadsDir,
        images: getMvComposeImages({ visualSequence: ctx.visualSequence, visualImageUrls: ctx.visualImageUrls }),
        durationSeconds: ctx.imageDurationSeconds,
        fps: ctx.fps,
        resolution: ctx.resolution,
        inputAudio: ctx.inputAudio,
        subtitleMode: ctx.subtitleMode,
        subtitlePath: ctx.subtitlePath,
        outPath: ctx.outPath,
      });

  candidates.push({
    label: ctx.inputVideo ? 'transcode' : 'image-sequence',
    encodeCount: 1,
    score: copyArgs ? 10 : 0,
    commands: [{ cwd: ctx.uploadsDir, args: transcodeArgs }],
    fallbackCommands: [{ cwd: ctx.uploadsDir, args: ['-y', '-fflags', '+genpts', ...transcodeArgs.slice(1)] }],
  });

  return { outputUrl: ctx.outputUrl, candidates };
}

export function createApiRouter(deps: {
  mjApi: MJApi;
  chatApi: YunwuChatApi;
  gemini: GeminiVisionClient;
  geminiVideo: GeminiVideoClient;
  imageproxy: ImageProxyClient;
  videoApi: VideoApi;
  uploads: { dir: string; publicPath: string };
  auth: {
    mjTokenConfigured: boolean;
    llmTokenConfigured: boolean;
    geminiConfigured: boolean;
    imageproxyConfigured: boolean;
  };
  meta?: {
    mjApiUrl: string;
    llmApiUrl: string;
    visionModel: string;
    runtime: 'dev' | 'dist';
    tokenSources?: unknown;
  };
	}): (req: Request) => Promise<Response> {
	  return async (req: Request): Promise<Response> => {
	    const url = new URL(req.url);
	    const { pathname } = url;
      const externalCacheDir = join(deps.uploads.dir, '_external_cache');

	    if (pathname === '/api/health' && req.method === 'GET') {
	      return json({ ok: true, auth: deps.auth, meta: deps.meta });
	    }

	    if (pathname === '/api/image' && req.method === 'GET') {
	      try {
	        const src = String(url.searchParams.get('src') || '').trim();
	        if (!src) return jsonError({ status: 400, description: '缺少 src' });

	        let bytes: Uint8Array;
	        let contentType: string | null = null;

	        if (src.startsWith('/uploads/')) {
	          const key = basename(src);
	          if (!key || key.includes('..')) return jsonError({ status: 400, description: 'src 非法' });
	          const filePath = join(deps.uploads.dir, key);
	          const file = Bun.file(filePath);
	          if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });
	          const ab = await file.arrayBuffer();
	          bytes = new Uint8Array(ab);

	          const ext = normalizeImageExt(extname(key));
	          contentType =
	            ext === '.png'
	              ? 'image/png'
	              : ext === '.jpg'
	                ? 'image/jpeg'
	                : ext === '.webp'
	                  ? 'image/webp'
	                  : ext === '.gif'
	                    ? 'image/gif'
	                    : null;
	        } else {
	          let absolute: URL;
	          try {
	            absolute = new URL(src);
	          } catch {
	            absolute = new URL(src, req.url);
	          }
	          if (!['http:', 'https:'].includes(absolute.protocol)) {
	            return jsonError({ status: 400, description: '仅支持 http/https 图片' });
	          }
	          if (isUnsafeHost(absolute.hostname)) {
	            return jsonError({ status: 400, description: '禁止访问内网地址' });
	          }
            const key = cacheKeyFromSrc(absolute.toString());
            const cached = await readExternalImageCache(externalCacheDir, key);
            if (cached) {
              bytes = cached;
            } else {
              const fetched = await fetchExternalImageBytes(req, absolute);
              bytes = fetched.bytes;
              contentType = fetched.contentType;
              const sniffed = sniffImageExt(bytes);
              const isImageType = Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
              if (!isImageType && !sniffed) {
                return jsonError({ status: 502, description: `拉取图片失败: non-image content-type ${contentType || 'unknown'}` });
              }
              await writeExternalImageCache(externalCacheDir, key, bytes);
            }
	        }

	        const sniffed = sniffImageExt(bytes);
	        const sniffedMime =
	          sniffed === '.png'
	            ? 'image/png'
	            : sniffed === '.jpg'
	              ? 'image/jpeg'
	              : sniffed === '.webp'
	                ? 'image/webp'
	                : sniffed === '.gif'
	                  ? 'image/gif'
	                  : null;

	        if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
	          contentType = sniffedMime || 'application/octet-stream';
	        } else if (sniffedMime && contentType.toLowerCase() !== sniffedMime) {
	          // Some CDNs lie about Content-Type (e.g. image/jpeg for a PNG). Prefer sniffed mime
	          // so client-side file extensions match bytes and won't fail our upload validator.
	          contentType = sniffedMime;
	        }

	        return new Response(bytes, {
	          headers: {
	            'Content-Type': contentType,
	            'Cache-Control': 'public, max-age=604800',
	          },
	        });
	      } catch (error) {
	        console.error('Image proxy error:', error);
	        return jsonError({ status: 500, description: '拉取图片失败', error });
	      }
	    }

      if (pathname === '/api/video' && req.method === 'GET') {
        try {
          const src = String(url.searchParams.get('src') || '').trim();
          if (!src) return jsonError({ status: 400, description: '缺少 src' });

          let absolute: URL;
          try {
            absolute = new URL(src);
          } catch {
            absolute = new URL(src, req.url);
          }
          if (!['http:', 'https:'].includes(absolute.protocol)) {
            return jsonError({ status: 400, description: '仅支持 http/https 视频' });
          }
          if (isUnsafeHost(absolute.hostname)) {
            return jsonError({ status: 400, description: '禁止访问内网地址' });
          }

          const upstream = await fetch(absolute.toString(), {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MJ-Workflow/1.0; +https://localhost)',
            },
          });
          if (!upstream.ok) return jsonError({ status: 502, description: `拉取视频失败: ${upstream.status}` });

          const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
          return new Response(upstream.body, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        } catch (error) {
          console.error('Video proxy error:', error);
          return jsonError({ status: 500, description: '拉取视频失败', error });
        }
      }

	    if (pathname === '/api/slice' && req.method === 'GET') {
	      try {
	        const url = new URL(req.url);
	        const src = String(url.searchParams.get('src') || '').trim();
	        const indexRaw = String(url.searchParams.get('index') || '').trim();
        const index = Number(indexRaw);
        if (!src) return jsonError({ status: 400, description: '缺少 src' });
        if (![1, 2, 3, 4].includes(index)) return jsonError({ status: 400, description: 'index 必须为 1-4' });

        let bytes: Uint8Array;
        if (src.startsWith('/uploads/')) {
          const key = basename(src);
          if (!key || key.includes('..')) return jsonError({ status: 400, description: 'src 非法' });
          const filePath = join(deps.uploads.dir, key);
          const file = Bun.file(filePath);
          if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });
          const ab = await file.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else {
          let absolute: URL;
          try {
            absolute = new URL(src);
          } catch {
            absolute = new URL(src, req.url);
          }
          if (!['http:', 'https:'].includes(absolute.protocol)) {
            return jsonError({ status: 400, description: '仅支持 http/https 图片' });
          }
          if (isUnsafeHost(absolute.hostname)) {
            return jsonError({ status: 400, description: '禁止访问内网地址' });
          }
          const key = cacheKeyFromSrc(absolute.toString());
          const cached = await readExternalImageCache(externalCacheDir, key);
          if (cached) {
            bytes = cached;
          } else {
            const fetched = await fetchExternalImageBytes(req, absolute);
            bytes = fetched.bytes;
            const sniffed = sniffImageExt(bytes);
            const isImageType = Boolean(fetched.contentType && fetched.contentType.toLowerCase().startsWith('image/'));
            if (!isImageType && !sniffed) {
              return jsonError({
                status: 502,
                description: `拉取图片失败: non-image content-type ${fetched.contentType || 'unknown'}`,
              });
            }
            await writeExternalImageCache(externalCacheDir, key, bytes);
          }
        }

        if (!sniffImageExt(bytes)) {
          return jsonError({ status: 400, description: '源不是有效图片' });
        }

        const img = sharp(bytes);
        const meta = await img.metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        if (!w || !h) return jsonError({ status: 400, description: '无法解析图片尺寸' });

        // Avoid sharp extract errors on tiny images (e.g. 1x1 test fixtures).
        if (w < 2 || h < 2) {
          const out = await img.png().toBuffer();
          return new Response(out, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }

        const halfW = Math.floor(w / 2);
        const halfH = Math.floor(h / 2);
        const leftW = halfW;
        const rightW = w - halfW;
        const topH = halfH;
        const bottomH = h - halfH;

        const region =
          index === 1
            ? { left: 0, top: 0, width: leftW, height: topH }
            : index === 2
              ? { left: halfW, top: 0, width: rightW, height: topH }
              : index === 3
                ? { left: 0, top: halfH, width: leftW, height: bottomH }
                : { left: halfW, top: halfH, width: rightW, height: bottomH };

        const out = await img.extract(region).png().toBuffer();
        return new Response(out, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=2592000',
          },
        });
      } catch (error) {
        console.error('Slice error:', error);
        return jsonError({ status: 500, description: '切图失败', error });
      }
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return jsonError({ status: 400, description: '缺少 file 字段（multipart/form-data）' });
        }

        await mkdir(deps.uploads.dir, { recursive: true });
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const extFromName = extname(file.name || '');
        const loweredExt = normalizeNonImageExt(extFromName);

        // Allow extension-less images by sniffing.
        const isImageExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(loweredExt);
        let ext = loweredExt;
        if (!ext) {
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) {
            return jsonError({ status: 400, description: `不支持的文件类型：${extFromName || '(无扩展名)'}` });
          }
          ext = normalizeImageExt(sniffedExt);
        }

        if (!allowedUploadExts.has(ext)) {
          return jsonError({ status: 400, description: `不支持的文件类型：${extFromName || '(无扩展名)'}` });
        }

        // Images: sniff bytes for safety (avoid mismatched extension).
        if (['.png', '.jpg', '.webp', '.gif'].includes(normalizeImageExt(ext))) {
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) {
            return jsonError({ status: 400, description: '图片格式不支持或文件已损坏（仅支持 PNG/JPG/WEBP/GIF）' });
          }
          const normalizedSniff = normalizeImageExt(sniffedExt);
          const normalizedNameExt = normalizeImageExt(ext);
          ext = normalizeImageExt(ext || sniffedExt);
          if (normalizedSniff !== normalizedNameExt) {
            return jsonError({ status: 400, description: '图片文件扩展名与内容不匹配，请重新上传' });
          }
        }

        const localKey = `${randomUUID()}${ext}`;
        const safeKey = basename(localKey);
        const localPath = join(deps.uploads.dir, safeKey);
        const localUrl = `${deps.uploads.publicPath}/${safeKey}`;

        await writeFile(localPath, bytes);

        // NOTE: Do not eagerly upload to 3rd-party CDN. CDN promotion is done lazily (see /api/upload/promote)
        // only when generating MJ prompts that require a public URL.
        const cdnUrl: string | undefined = undefined;
        const url = localUrl;
        return json({
          code: 0,
          description: '成功',
          result: { url, cdnUrl, localUrl, localPath, localKey },
        });
      } catch (error) {
        console.error('Upload error:', error);
        return jsonError({ status: 500, description: '上传失败', error });
      }
    }

    if (pathname === '/api/upload/promote' && req.method === 'POST') {
      try {
        if (!deps.auth.imageproxyConfigured) {
          return jsonError({ status: 500, description: '未配置 IMAGEPROXY_TOKEN，无法上传到 CDN（promote）' });
        }
        const body = await readJson<{ localKey?: string }>(req);
        const localKey = String(body.localKey || '').trim();
        if (!localKey) return jsonError({ status: 400, description: 'localKey 不能为空' });
        if (basename(localKey) !== localKey) return jsonError({ status: 400, description: 'localKey 非法' });
        if (!/^[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]+)?$/.test(localKey)) {
          return jsonError({ status: 400, description: 'localKey 格式不正确' });
        }

        const filePath = join(deps.uploads.dir, localKey);
        const file = Bun.file(filePath);
        if (!(await file.exists())) return jsonError({ status: 404, description: '图片不存在' });

        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const sniffedExt = sniffImageExt(bytes);
        if (!sniffedExt) return jsonError({ status: 400, description: '图片格式不支持或文件已损坏（仅支持 PNG/JPG/WEBP/GIF）' });

        const ext = normalizeImageExt(extname(localKey) || sniffedExt);
        const mime = mimeFromImageExt(ext);
        const uploadFile = new File([bytes], localKey, { type: mime });

        const uploaded = await deps.imageproxy.upload(uploadFile);
        const cdnUrl = uploaded?.url ? String(uploaded.url) : '';
        if (!cdnUrl) return jsonError({ status: 502, description: 'CDN 上传失败：缺少 url' });

        return json({
          code: 0,
          description: '成功',
          result: {
            cdnUrl,
            url: cdnUrl,
            localKey,
            localUrl: `${deps.uploads.publicPath}/${localKey}`,
          },
        });
      } catch (error) {
        console.error('Upload promote error:', error);
        return jsonError({ status: 500, description: '上传到 CDN 失败', error });
      }
    }

    if (pathname === '/api/upload/delete' && req.method === 'POST') {
      try {
        const body = await readJson<{ localKey?: string }>(req);
        const localKey = String(body.localKey || '').trim();
        if (!localKey) return jsonError({ status: 400, description: 'localKey 不能为空' });
        if (basename(localKey) !== localKey) return jsonError({ status: 400, description: 'localKey 非法' });
        if (!/^[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]+)?$/.test(localKey)) {
          return jsonError({ status: 400, description: 'localKey 格式不正确' });
        }

        const filePath = join(deps.uploads.dir, localKey);
        try {
          await unlink(filePath);
        } catch {
          // already deleted
        }

        return json({ code: 0, description: '已删除', result: { ok: true } });
      } catch (error) {
        console.error('Delete upload error:', error);
        return jsonError({ status: 500, description: '删除失败', error });
      }
    }

    if (pathname === '/api/audio/process' && req.method === 'POST') {
      try {
        const body = await readJson<{
          src?: string;
          tempo?: unknown;
          stereo_delay_ms?: unknown;
          stereoDelayMs?: unknown;
          noise_dbfs?: unknown;
          noiseDbfs?: unknown;
          redundancy_preset?: unknown;
          redundancyPreset?: unknown;
          audio?: Record<string, unknown> | null;
          redundancy?: Record<string, unknown> | null;
        }>(req);
        const src = String(body.src || '').trim();
        if (!src) return jsonError({ status: 400, description: 'src 不能为空' });

        const presetRaw = String(body.redundancy_preset ?? body.redundancyPreset ?? process.env.AUDIO_REDUNDANCY_PRESET ?? '')
          .trim()
          .toLowerCase();
        const preset = presetRaw === 'distribution' || presetRaw === 'conservative' || presetRaw === 'off' ? presetRaw : '';
        const presetStereoDelayMs = preset === 'distribution' ? 0.01 : 0.0;
        const presetNoiseDbfs: number | null = preset === 'distribution' ? -84.0 : null;

        const tune =
          (body.redundancy && typeof body.redundancy === 'object' ? body.redundancy : null) ||
          (body.audio && typeof body.audio === 'object' ? body.audio : null) ||
          (body as unknown as Record<string, unknown>);

        const envTempo = parseNumberLike(process.env.AUDIO_TEMPO);
        const envStereoDelayMs = parseNumberLike(process.env.AUDIO_STEREO_DELAY_MS);
        const envNoiseDbfs = parseNullableNumberLike(process.env.AUDIO_NOISE_DBFS);

        const tempo = clampNumber(parseNumberLike(tune.tempo) ?? envTempo ?? 1.0003, 0.5, 2.0);
        const stereoDelayMs = clampNumber(
          parseNumberLike(tune.stereo_delay_ms ?? tune.stereoDelayMs) ?? envStereoDelayMs ?? presetStereoDelayMs ?? 0.0,
          -20,
          20
        );

        const noiseCandidate = parseNullableNumberLike(tune.noise_dbfs ?? tune.noiseDbfs);
        const rawNoiseDbfs =
          noiseCandidate !== undefined ? noiseCandidate : envNoiseDbfs !== undefined ? envNoiseDbfs : presetNoiseDbfs;
        const noiseDbfs = typeof rawNoiseDbfs === 'number' ? clampNumber(rawNoiseDbfs, -120, -60) : null;

        const localPath = resolveUploadsLocalPath(deps.uploads.dir, src);
        if (!localPath) return jsonError({ status: 400, description: '仅支持 /uploads/<key> 作为音频输入' });

        const file = Bun.file(localPath);
        if (!(await file.exists())) return jsonError({ status: 404, description: '音频不存在' });

        const ext = normalizeNonImageExt(extname(localPath));
        const allowedAudioExts = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg']);
        if (!allowedAudioExts.has(ext)) return jsonError({ status: 400, description: `不支持的音频格式：${ext || '(无扩展名)'}` });

        await mkdir(deps.uploads.dir, { recursive: true });
        const outKey = `${randomUUID()}_pro.wav`;
        const outPath = join(deps.uploads.dir, outKey);

        const sampleRate = await sampleRateFromFile(localPath);

        try {
          const analysisGraph = await buildAudioFiltergraph({
            sampleRate,
            includeLoudnorm: 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
            tempo,
            stereoDelayMs,
            noiseDbfs,
          });
          const analysis = await runCommand([
            'ffmpeg',
            '-hide_banner',
            '-nostdin',
            '-i',
            localPath,
            '-filter_complex',
            analysisGraph,
            '-f',
            'null',
            '-',
          ]);
          if (analysis.code !== 0) {
            throw new Error(analysis.stderr?.trim() || 'ffmpeg loudnorm analysis failed');
          }

          const measure = parseLoudnormJson(analysis.stderr || '');
          const loudnormSecondPass = formatLoudnormSecondPass(measure);
          const filterGraph = await buildAudioFiltergraph({
            sampleRate,
            includeLoudnorm: loudnormSecondPass,
            tempo,
            stereoDelayMs,
            noiseDbfs,
          });

          const proc = await runCommand([
            'ffmpeg',
            '-y',
            '-hide_banner',
            '-nostdin',
            '-i',
            localPath,
            '-filter_complex',
            filterGraph,
            '-c:a',
            'pcm_s24le',
            '-ar',
            String(sampleRate),
            outPath,
          ]);
          if (proc.code !== 0) {
            throw new Error(proc.stderr?.trim() || 'ffmpeg audio process failed');
          }
        } catch (error) {
          // Fallback: single-pass loudnorm only
          const fallback = await runCommand([
            'ffmpeg',
            '-y',
            '-hide_banner',
            '-nostdin',
            '-i',
            localPath,
            '-af',
            'loudnorm=I=-16:TP=-1.5:LRA=11',
            '-c:a',
            'pcm_s24le',
            '-ar',
            String(sampleRate),
            outPath,
          ]);
          if (fallback.code !== 0) {
            const detail = tailLines(fallback.stderr || (error as Error)?.message || '', 2000);
            return jsonError({ status: 500, description: '音频后处理失败', error: detail });
          }
        }

        const outputUrl = `${deps.uploads.publicPath}/${outKey}`;
        return json({ code: 0, description: '成功', result: { outputUrl, localKey: outKey } });
      } catch (error) {
        console.error('Audio process error:', error);
        return jsonError({ status: 500, description: '音频后处理失败', error });
      }
    }

    if (pathname === '/api/video/process' && req.method === 'POST') {
      try {
        const body = await readJson<{ src?: string; preset?: string; crf?: number }>(req);
        const src = String(body.src || '').trim();
        if (!src) return jsonError({ status: 400, description: 'src 不能为空' });

        const localPath = resolveUploadsLocalPath(deps.uploads.dir, src);
        if (!localPath) return jsonError({ status: 400, description: '仅支持 /uploads/<key> 作为视频输入' });

        const file = Bun.file(localPath);
        if (!(await file.exists())) return jsonError({ status: 404, description: '视频不存在' });

        const ext = normalizeNonImageExt(extname(localPath));
        const allowedVideoExts = new Set(['.mp4', '.mov', '.mkv', '.webm']);
        if (!allowedVideoExts.has(ext)) return jsonError({ status: 400, description: `不支持的视频格式：${ext || '(无扩展名)'}` });

        const presetRaw = String(body.preset || '').trim().toLowerCase();
        const preset =
          presetRaw === 'pet' ||
          presetRaw === 'bw' ||
          presetRaw === 'sepia' ||
          presetRaw === 'soft' ||
          presetRaw === 'sharpen' ||
          presetRaw === 'denoise' ||
          presetRaw === 'none'
            ? presetRaw
            : 'enhance';

        const crf = typeof body.crf === 'number' && Number.isFinite(body.crf) ? Math.round(body.crf) : 23;
        if (crf < 10 || crf > 40) return jsonError({ status: 400, description: 'crf 不合法（建议 10~40）' });

        await mkdir(deps.uploads.dir, { recursive: true });
        const outKey = `${randomUUID()}_post_${preset}.mp4`;
        const outPath = join(deps.uploads.dir, outKey);

        let vfGraph: string | undefined;
        const vf: string[] = [];

        if (preset === 'pet') {
          const zscale = await ffmpegHasFilter('zscale');
          const sobel = await ffmpegHasFilter('sobel');
          const maskedmerge = await ffmpegHasFilter('maskedmerge');
          const noise = await ffmpegHasFilter('noise');
          const deband = await ffmpegHasFilter('deband');
          const tmix = await ffmpegHasFilter('tmix');
          const tblend = await ffmpegHasFilter('tblend');

          if (zscale && sobel && maskedmerge && noise && tmix && tblend) {
            const linearize = `zscale=t=linear,format=gbrpf32le`;
            const delinearize = `zscale=t=bt709:d=error_diffusion,format=yuv420p`;
            const maybeDeband = deband ? ',deband=1thr=0.015:2thr=0.012:3thr=0.012:range=18:blur=1:coupling=0' : '';

            // PET-ish pipeline (fast, single ffmpeg run):
            // Linearize -> build JND-ish mask (edge + temporal diff) -> apply subtle temporally-correlated grain only on masked areas -> deband -> dither -> output.
            vfGraph = [
              `[0:v]${linearize},split=3[base0][masksrc][noise0]`,
              `[base0]eq=contrast=1.02:saturation=1.02[base]`,
              `[noise0]noise=alls=6:allf=t+u+a,tmix=frames=3:weights='1 2 1'[noisy]`,
              `[masksrc]format=gray,split=2[ly0][ly1]`,
              `[ly0]sobel=scale=2[edge]`,
              `[ly1]tblend=all_mode=difference,format=gray,lut=y='min(val*3,255)'[tdiff]`,
              `[edge][tdiff]blend=all_mode=addition:all_opacity=0.7,format=gray,lut=y='min(val*1.4,255)'[mask]`,
              `[base][noisy][mask]maskedmerge${maybeDeband},${delinearize}[vout]`,
            ].join(';');
          } else {
            // Fallback: if the required filters are missing, gracefully degrade to "enhance".
            vf.push('eq=contrast=1.06:brightness=0.01:saturation=1.10');
            vf.push('unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.7:chroma_msize_x=5:chroma_msize_y=5:chroma_amount=0');
          }
        } else if (preset === 'enhance') {
          vf.push('eq=contrast=1.08:brightness=0.02:saturation=1.15');
          vf.push('unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.9:chroma_msize_x=5:chroma_msize_y=5:chroma_amount=0');
        } else if (preset === 'bw') {
          vf.push('hue=s=0');
          vf.push('eq=contrast=1.08:brightness=0.02');
        } else if (preset === 'sepia') {
          vf.push('colorchannelmixer=0.393:0.769:0.189:0:0.349:0.686:0.168:0:0.272:0.534:0.131');
        } else if (preset === 'soft') {
          vf.push('eq=contrast=0.98:saturation=1.05');
          vf.push('boxblur=1:1');
        } else if (preset === 'sharpen') {
          vf.push('unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=1.2:chroma_msize_x=7:chroma_msize_y=7:chroma_amount=0');
        } else if (preset === 'denoise') {
          const hqdn3d = await ffmpegHasFilter('hqdn3d');
          if (hqdn3d) vf.push('hqdn3d=1.5:1.5:6:6');
          else vf.push('boxblur=1:1');
          vf.push('eq=contrast=1.04:saturation=1.05');
        }
        if (!vfGraph) {
          vf.push('format=yuv420p');
          vfGraph = vf.join(',');
        }

        const proc = await runCommand([
          'ffmpeg',
          '-y',
          '-hide_banner',
          '-nostdin',
          '-i',
          localPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?:0',
          ...(vfGraph ? ['-vf', vfGraph] : []),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          String(crf),
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          outPath,
        ]);
        if (proc.code !== 0) {
          const detail = tailLines(proc.stderr || proc.stdout || '', 2000);
          return jsonError({ status: 500, description: '视频后处理失败', error: detail });
        }

        const outputUrl = `${deps.uploads.publicPath}/${outKey}`;
        return json({ code: 0, description: '成功', result: { outputUrl, localKey: outKey, preset, crf } });
      } catch (error) {
        console.error('Video process error:', error);
        return jsonError({ status: 500, description: '视频后处理失败', error });
      }
    }

    if ((pathname === '/api/mv/compose' || pathname === '/api/mv/compose/plan') && req.method === 'POST') {
      try {
        const body = await readJson<MvComposeRequestBody>(req);
        const dryRun = pathname.endsWith('/plan');

        const fps = finiteNumberOr(body.fps, 25);
        if (fps <= 0 || fps > 120) return jsonError({ status: 400, description: 'fps 不合法' });

        const subtitleMode: MvComposeSubtitleMode = body.subtitleMode === 'burn' ? 'burn' : 'soft';
        const action: MvComposeAction = body.action === 'clip' ? 'clip' : 'mv';
        const resolutionRaw = typeof body.resolution === 'string' ? body.resolution.trim() : '';
        const resolution = resolutionRaw && resolutionRaw !== 'source' ? parseResolution(resolutionRaw) : null;

        const videoUrl = String(body.videoUrl || '').trim();
        const audioUrl = action === 'mv' ? String(body.audioUrl || '').trim() : '';
        const subtitleSrt = action === 'mv' && typeof body.subtitleSrt === 'string' ? body.subtitleSrt : '';

        const durationProvided = typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds);
        const durationSeconds = durationProvided ? (body.durationSeconds as number) : undefined;
        let trimSeconds: number | undefined = undefined;
        let imageDurationSeconds: number = 5;

        if (videoUrl) {
          trimSeconds = durationSeconds;
          if (typeof trimSeconds === 'number' && (trimSeconds <= 0 || trimSeconds > 600)) {
            return jsonError({ status: 400, description: 'durationSeconds 不合法' });
          }
          if (action === 'clip' && typeof trimSeconds !== 'number') {
            return jsonError({ status: 400, description: '视频剪辑需要提供 durationSeconds' });
          }
        } else {
          imageDurationSeconds = finiteNumberOr(body.durationSeconds, 5);
          if (imageDurationSeconds <= 0 || imageDurationSeconds > 600) return jsonError({ status: 400, description: 'durationSeconds 不合法' });
        }

        const visualSequence = normalizeMvComposeVisualSequence(body.visualSequence);
        const visualImageUrls = visualSequence.length ? visualSequence.map((it) => it.url) : normalizeMvComposeVisualImageUrls(body.visualImageUrls);

        if (!videoUrl && visualImageUrls.length === 0) {
          return jsonError({ status: 400, description: '缺少素材：需要 videoUrl 或 visualImageUrls' });
        }

        const inputVideo = videoUrl ? safeFfmpegInputForSrc(req, deps.uploads.dir, videoUrl) : '';
        const inputImage = !videoUrl ? safeFfmpegInputForSrc(req, deps.uploads.dir, visualImageUrls[0]!) : '';
        const inputAudio = audioUrl ? safeFfmpegInputForSrc(req, deps.uploads.dir, audioUrl) : '';

        const { subtitlePath } = await prepareSubtitleFileIfNeeded({ dryRun, uploadsDir: deps.uploads.dir, subtitleSrt });
        const { outPath, outputUrl } = prepareMvComposeOutput({ uploadsDir: deps.uploads.dir, uploadsPublicPath: deps.uploads.publicPath });
        const { candidates } = buildMvComposeCandidates({
          uploadsDir: deps.uploads.dir,
          inputVideo,
          inputImage,
          inputAudio,
          imageDurationSeconds,
          trimSeconds,
          fps,
          resolution,
          subtitleMode,
          subtitlePath,
          visualSequence,
          visualImageUrls,
          outPath,
          outputUrl,
          req,
        });

        if (dryRun) {
          return json({ code: 0, description: '成功', result: { outputUrl, candidates } });
        }

        const backend = mediaBackendUrlFromEnv();
        const enqueueResp = await fetch(`${backend}/api/tasks/ffmpeg/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'mv-compose', candidates }),
        });
        const enqueueJson = await enqueueResp.json();
        if (!enqueueResp.ok || enqueueJson?.code !== 0) {
          return jsonError({ status: 502, description: 'media-backend 入队失败', error: enqueueJson });
        }
        const taskId = String(enqueueJson?.result?.id || '').trim();
        if (!taskId) return jsonError({ status: 502, description: 'media-backend 入队失败：缺少 id', error: enqueueJson });

        return json({ code: 0, description: '成功', result: { taskId, outputUrl } });
      } catch (error) {
        console.error('MV compose error:', error);
        return jsonError({ status: 500, description: 'MV 合成失败', error });
      }
    }

    const mediaTaskMatch = pathname.match(/^\/api\/media\/task\/([^/]+)$/);
    if (mediaTaskMatch && req.method === 'GET') {
      try {
        const taskId = mediaTaskMatch[1]!;
        const backend = mediaBackendUrlFromEnv();
        const resp = await fetch(`${backend}/api/tasks/${encodeURIComponent(taskId)}`);
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) {
          return jsonError({ status: 502, description: 'media-backend 查询失败', error: payload || { status: resp.status } });
        }
        return json(payload);
      } catch (error) {
        console.error('media task query error:', error);
        return jsonError({ status: 500, description: '查询 media 任务失败', error });
      }
    }

    if (pathname === '/api/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ base64?: string; imageUrl?: string }>(req);
        const result = await deps.mjApi.describe({ base64: body.base64, imageUrl: body.imageUrl });
        return json(result);
      } catch (error) {
        console.error('Describe error:', error);
        return jsonError({ status: 500, description: '反推提示词失败', error });
      }
    }

    if (pathname === '/api/vision/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }
        const body = await readJson<VisionDescribeRequest>(req);
        const { imageUrl, question, model } = body;

        if (!imageUrl) return jsonError({ status: 400, description: 'imageUrl 不能为空' });
        const normalizedUrl = normalizeInputImageUrl(req, imageUrl);
        if (normalizedUrl.includes('://localhost') || normalizedUrl.includes('://127.0.0.1')) {
          return jsonError({ status: 400, description: '识图需要公网可访问图片：请使用图床 URL 或 data:image/*' });
        }

        const raw = await deps.chatApi.visionDescribe({
          imageUrl: normalizedUrl,
          question: question || '这张图片里有什么?请详细描述。',
          model,
        });

        const upstreamError = (raw as any)?.error;
        if (upstreamError?.message || upstreamError?.message_zh) {
          return json(
            {
              code: -1,
              description: upstreamError?.message_zh || upstreamError?.message || '上游识图接口返回错误',
              error: upstreamError,
            },
            { status: 502 }
          );
        }

        const text = extractAssistantText(raw);
        return json({ code: 0, description: '成功', result: { text, raw } });
      } catch (error) {
        console.error('Vision describe error:', error);
        return jsonError({ status: 500, description: '识图失败', error });
      }
    }

    if (pathname === '/api/imagine' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ prompt: string; base64Array?: string[]; notifyHook?: string; state?: string }>(req);
        const result = await deps.mjApi.imagine({
          prompt: body.prompt,
          base64Array: body.base64Array,
          notifyHook: body.notifyHook,
          state: body.state,
        });
        return json(result);
      } catch (error) {
        console.error('Imagine error:', error);
        return jsonError({ status: 500, description: '生图失败', error });
      }
    }

    if (pathname === '/api/upscale' && req.method === 'POST') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const body = await readJson<{ taskId: string; index: number }>(req);
        const { taskId, index } = body;

        if (!taskId) return jsonError({ status: 400, description: 'taskId 不能为空' });
        if (![1, 2, 3, 4].includes(Number(index))) return jsonError({ status: 400, description: 'index 必须为 1-4' });

        const customId = `MJ::JOB::upsample::${index}::${taskId}`;
        const result = await deps.mjApi.upscale({
          chooseSameChannel: true,
          customId,
          taskId,
          notifyHook: '',
          state: '',
        });

        return json(result);
      } catch (error) {
        console.error('Upscale error:', error);
        return jsonError({ status: 500, description: '扩图失败', error });
      }
    }

    const taskMatch = pathname.match(/^\/api\/task\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      try {
        if (!deps.auth.mjTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 MJ Token：请设置 YUNWU_MJ_KEY 或 MJ_API_TOKEN' });
        }
        const taskId = taskMatch[1]!;
        const result = await deps.mjApi.queryTask(taskId);
        return json(result);
      } catch (error) {
        console.error('Task query error:', error);
        return jsonError({ status: 500, description: '查询任务失败', error });
      }
    }

    if (pathname === '/api/gemini/describe' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ imageUrl?: string }>(req);
        const imageUrl = body.imageUrl;
        if (!imageUrl) return jsonError({ status: 400, description: 'imageUrl 不能为空' });

        const prompt = await deps.gemini.imageToPrompt(normalizeInputImageUrl(req, imageUrl));
        return json({ code: 0, description: '成功', result: { prompt } });
      } catch (error) {
        console.error('Gemini describe error:', error);
        return jsonError({ status: 500, description: 'Gemini 反推失败', error });
      }
    }

    if (pathname === '/api/gemini/chat' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ messages?: Array<{ role?: string; content?: string }> }>(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!messages.length) return jsonError({ status: 400, description: 'messages 不能为空' });
        const text = await deps.gemini.chat(
          messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') }))
        );
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini chat error:', error);
        return jsonError({ status: 500, description: 'Gemini 对话失败', error });
      }
    }

    if (pathname === '/api/gemini/suno' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ requirement?: string; imageUrls?: string[] }>(req);
        const requirement = String(body.requirement || '').trim();
        if (!requirement) return jsonError({ status: 400, description: 'requirement 不能为空' });

        const imageUrls = Array.isArray(body.imageUrls)
          ? body.imageUrls.map((u) => normalizeInputImageUrl(req, String(u || ''))).filter(Boolean).slice(0, 8)
          : [];

        // Basic SSRF guard: reject localhost/private IPs for absolute urls. (Relative /uploads/ is OK.)
        for (const u of imageUrls) {
          if (u.startsWith('data:')) continue;
          if (u.startsWith('/uploads/')) continue;
          let absolute: URL;
          try {
            absolute = new URL(u);
          } catch {
            absolute = new URL(u, req.url);
          }
          if (!['http:', 'https:'].includes(absolute.protocol)) {
            return jsonError({ status: 400, description: '仅支持 http/https 图片或 data:image/* 或 /uploads/*' });
          }
          if (isUnsafeHost(absolute.hostname)) {
            return jsonError({ status: 400, description: '禁止访问内网地址' });
          }
        }

        const text = await deps.gemini.sunoPrompt({ requirement, imageUrls });
        return json({ code: 0, description: '成功', result: { text } });
      } catch (error) {
        console.error('Gemini suno error:', error);
        return jsonError({ status: 500, description: 'Suno 提示词生成失败', error });
      }
    }

    if (pathname === '/api/gemini/translate' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ text?: string }>(req);
        const text = String(body.text || '').trim();
        if (!text) return jsonError({ status: 400, description: 'text 不能为空' });

        const system = [
          'You are a translation engine for Midjourney prompt text.',
          'Translate the given prompt body into natural, concise English.',
          'Rules:',
          '- Output ONLY the translated prompt body, nothing else.',
          '- Do NOT add any Midjourney parameters (e.g. --ar, --v, --style, --sref, --cref).',
          '- Do NOT add any URLs or image links.',
          '- If the input is already English, return it unchanged.',
        ].join('\n');

        const out = await deps.gemini.generateText(system, text);
        return json({ code: 0, description: '成功', result: { text: out } });
      } catch (error) {
        console.error('Gemini translate error:', error);
        return jsonError({ status: 500, description: 'Gemini 翻译失败', error });
      }
    }

    if (pathname === '/api/gemini/beautify' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ text?: string; hint?: string }>(req);
        const text = String(body.text || '').trim();
        const hint = String(body.hint || '').trim();
        if (!text) return jsonError({ status: 400, description: 'text 不能为空' });

        const system = [
          'You are a Midjourney prompt polishing assistant.',
          'Rewrite the given prompt body in Simplified Chinese (简体中文), making it more vivid, specific, cinematic, and MJ-friendly.',
          'Rules:',
          '- Output ONLY ONE line of prompt body text, nothing else.',
          '- Do NOT add any Midjourney parameters (e.g. --ar, --v, --style, --sref, --cref).',
          '- Do NOT add any URLs or image links.',
          '- Keep it concise but information-dense.',
        ].join('\n');

        const user = hint ? `PROMPT:\n${text}\n\nHINT:\n${hint}` : `PROMPT:\n${text}`;
        const out = await deps.gemini.generateText(system, user);
        return json({ code: 0, description: '成功', result: { text: out } });
      } catch (error) {
        console.error('Gemini beautify error:', error);
        return jsonError({ status: 500, description: 'Gemini 美化失败', error });
      }
    }

    if (pathname === '/api/gemini/pro-image' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }

        const body = await readJson<{
          prompt?: string;
          imageUrls?: string[];
          aspectRatio?: string;
          imageSize?: string;
        }>(req);

        const prompt = String(body.prompt || '').trim();
        if (!prompt) return jsonError({ status: 400, description: 'prompt 不能为空' });

        const imageUrls = Array.isArray(body.imageUrls)
          ? body.imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
          : [];

        const outputs = await deps.gemini.generateOrEditImages({
          prompt,
          imageUrls: imageUrls.map((u) => normalizeInputImageUrl(req, u)),
          aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined,
          imageSize: typeof body.imageSize === 'string' ? body.imageSize : undefined,
          responseModalities: ['IMAGE'],
        });

        if (!outputs.length) {
          return jsonError({ status: 502, description: 'Gemini 未返回图片' });
        }

        await mkdir(deps.uploads.dir, { recursive: true });

        const saved: Array<{ url: string; localUrl: string; localKey: string; mimeType: string }> = [];
        for (const img of outputs) {
          const mimeType = String(img.mimeType || 'image/png');
          const bytes = new Uint8Array(Buffer.from(String(img.data || ''), 'base64'));
          const sniffedExt = sniffImageExt(bytes);
          if (!sniffedExt) continue;

          const ext = normalizeImageExt(sniffedExt);
          const localKey = `${randomUUID()}${ext}`;
          const safeKey = basename(localKey);
          const localPath = join(deps.uploads.dir, safeKey);
          const localUrl = `${deps.uploads.publicPath}/${safeKey}`;
          await writeFile(localPath, bytes);
          saved.push({ url: localUrl, localUrl, localKey: safeKey, mimeType: mimeFromImageExt(ext) });
        }

        if (!saved.length) {
          return jsonError({ status: 502, description: 'Gemini 返回的图片格式不支持' });
        }

        return json({ code: 0, description: '成功', result: { images: saved } });
      } catch (error) {
        console.error('Gemini pro-image error:', error);
        return jsonError({ status: 500, description: 'Gemini 生图/编辑失败', error });
      }
    }

    if (pathname === '/api/gemini/edit' && req.method === 'POST') {
      try {
        if (!deps.auth.geminiConfigured) {
          return jsonError({ status: 500, description: '未配置 Gemini_KEY' });
        }
        const body = await readJson<{ imageUrl?: string; editPrompt?: string }>(req);
        const { imageUrl, editPrompt } = body;
        if (!imageUrl || !editPrompt) return jsonError({ status: 400, description: 'imageUrl 和 editPrompt 不能为空' });

        const result = await deps.gemini.editImage(normalizeInputImageUrl(req, imageUrl), editPrompt);
        if (!result) return jsonError({ status: 500, description: '图片编辑失败，未返回图片' });

        return json({ code: 0, description: '成功', result: { imageDataUrl: result } });
      } catch (error) {
        console.error('Gemini edit error:', error);
        return jsonError({ status: 500, description: 'Gemini 编辑失败', error });
      }
    }

    if (pathname === '/api/video/create' && req.method === 'POST') {
      try {
        const body = await readJson<{
          provider?: string;
          prompt?: string;
          model?: string;
          seconds?: number;
          mode?: string;
          aspect?: string;
          size?: string;
          startImageUrl?: string;
          endImageUrl?: string;
        }>(req);

        const provider = String(body.provider || '').trim();
        const prompt = String(body.prompt || '').trim();
        if (!provider) return jsonError({ status: 400, description: 'provider 不能为空' });
        if (!prompt) return jsonError({ status: 400, description: 'prompt 不能为空' });

        if (provider === 'gemini') {
          const model = String(body.model || '').trim();
          if (!model) return jsonError({ status: 400, description: 'model 不能为空' });
          const op = await deps.geminiVideo.generate({
            model,
            prompt,
            durationSeconds: typeof body.seconds === 'number' ? body.seconds : undefined,
            aspectRatio: body.aspect,
            resolution: body.size,
            startImageUrl: body.startImageUrl,
            endImageUrl: body.endImageUrl,
          });
          return json({
            code: 0,
            description: '成功',
            result: { provider: 'gemini', id: op.operationName, raw: op.raw },
          });
        }

        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }

        const result = await deps.videoApi.createVideo({
          provider: provider as any,
          prompt,
          model: body.model,
          seconds: body.seconds,
          mode: body.mode,
          aspect: body.aspect,
          size: body.size,
          startImageUrl: body.startImageUrl,
          endImageUrl: body.endImageUrl,
        });
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('Video create error:', error);
        return jsonError({ status: 500, description: '生视频提交失败', error });
      }
    }

    if (pathname === '/api/video/query' && req.method === 'GET') {
      try {
        const id = String(url.searchParams.get('id') || '').trim();
        const provider = String(url.searchParams.get('provider') || '').trim();
        if (!id) return jsonError({ status: 400, description: 'id 不能为空' });
        if (!provider) return jsonError({ status: 400, description: 'provider 不能为空' });

        if (provider === 'gemini') {
          const op = await deps.geminiVideo.getOperation({ operationName: id });
          const metadata = op.metadata as any;
          const progress =
            typeof metadata?.progressPercent === 'number'
              ? metadata.progressPercent
              : typeof metadata?.progress === 'number'
                ? metadata.progress
                : undefined;

          if (!op.done) {
            return json({
              code: 0,
              description: '成功',
              result: { provider: 'gemini', id, status: 'processing', progress, raw: op },
            });
          }

          if (op.error) {
            return json({
              code: 0,
              description: '成功',
              result: { provider: 'gemini', id, status: 'failed', raw: op, error: op.error },
            });
          }

          const generated = (op.response as any)?.generatedVideos?.[0]?.video;
          const uri = typeof generated?.uri === 'string' ? generated.uri.trim() : '';
          const mimeType = typeof generated?.mimeType === 'string' ? generated.mimeType.trim() : '';
          const videoBytes = typeof generated?.videoBytes === 'string' ? generated.videoBytes.trim() : '';

          let videoUrl: string | undefined;
          if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
            videoUrl = uri;
          } else {
            // Prefer downloading via SDK (supports gs:// and other backends), fallback to inline bytes.
            const ext = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/webm' ? 'webm' : 'mp4';
            const key = `gemini-video-${randomUUID()}.${ext}`;
            const filePath = join(deps.uploads.dir, key);
            if (videoBytes) {
              const buf = Buffer.from(videoBytes, 'base64');
              await writeFile(filePath, buf);
              videoUrl = `${deps.uploads.publicPath}/${key}`;
            } else if (generated) {
              await deps.geminiVideo.downloadVideo({ file: generated, downloadPath: filePath });
              videoUrl = `${deps.uploads.publicPath}/${key}`;
            } else if (uri) {
              // last resort: return uri even if non-http
              videoUrl = uri;
            }
          }

          return json({
            code: 0,
            description: '成功',
            result: { provider: 'gemini', id, status: 'completed', progress: 100, videoUrl, raw: op },
          });
        }

        if (!deps.auth.llmTokenConfigured) {
          return jsonError({ status: 500, description: '未配置 LLM Token：请设置 YUNWU_ALL_KEY 或 LLM_API_TOKEN' });
        }

        const result = await deps.videoApi.queryVideo({ provider: provider as any, id });
        return json({ code: 0, description: '成功', result });
      } catch (error) {
        console.error('Video query error:', error);
        return jsonError({ status: 500, description: '生视频查询失败', error });
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

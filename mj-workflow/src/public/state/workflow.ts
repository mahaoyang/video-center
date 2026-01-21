export type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ReferenceImage {
  id: string;
  name: string;
  createdAt: number;
  originKey?: string; // stable key for de-duplication (file hash / url / slice key)
  producedByMessageId?: string; // lineage: which StreamMessage created this asset (if any)
  url?: string; // preferred URL (CDN preferred, local fallback)
  cdnUrl?: string; // imageproxy/CDN URL
  localUrl?: string; // served by this app, e.g. /uploads/<key>
  localPath?: string; // server-side file path
  localKey?: string; // server-side key for deletion
  dataUrl?: string; // session-only preview
  base64?: string; // session-only for MJ base64Array
}

export interface WorkflowHistoryItem {
  id: string;
  createdAt: number;
  prompt: string;
  taskId: string;
  gridImageUrl?: string;
  references: Array<Pick<ReferenceImage, 'id' | 'name' | 'createdAt' | 'url' | 'cdnUrl' | 'localUrl'>>;
  upscaledImages: string[];
}

export type StreamMessageRole = 'user' | 'ai';
export type StreamMessageKind = 'deconstruct' | 'generate' | 'upscale' | 'pedit' | 'video' | 'postprocess' | 'suno' | 'youtube';

export type PostprocessOutputKind = 'image' | 'audio' | 'video';
export interface PostprocessOutput {
  kind: PostprocessOutputKind;
  url: string;
  name?: string;
}

export type TraceTarget =
  | { type: 'message'; id: string }
  | { type: 'ref'; id: string }
  | { type: 'url'; url: string; resourceType?: 'image' | 'video' };

export type PlannerMessageRole = 'user' | 'ai';
export interface PlannerMessage {
  id: string;
  createdAt: number;
  role: PlannerMessageRole;
  text: string;
}

export interface StreamMessage {
  id: string;
  createdAt: number;
  role: StreamMessageRole;
  kind: StreamMessageKind;
  text?: string;
  imageUrl?: string; // preview image (CDN preferred)
  refId?: string; // optional reference image id
  refIds?: string[]; // optional multi reference image ids (preferred)
  // Back-compat: legacy single ref id fields (prefer refIds).

  // Lineage: main-branch parent (git-like)
  parentMessageId?: string;

  // generate/upscale
  taskId?: string;
  gridImageUrl?: string;
  upscaledImageUrl?: string;
  peditImageUrl?: string; // legacy single output
  peditImageUrls?: string[]; // multi outputs (preferred)
  inputImageUrls?: string[]; // optional multi inputs for Gemini Pro Image
  videoUrl?: string;
  thumbnailUrl?: string;
  provider?: string;

  progress?: number; // 0..100 for async tasks
  error?: string;

  postOutputs?: PostprocessOutput[];

  // Trace metadata (snapshot configs, for redo)
  userPrompt?: string; // raw prompt typed by user before translation/wrapping

  // MJ Generate snapshot
  mjPadRefIds?: string[]; // PAD (垫图) - multi image reference (preferred)
  mjPadRefId?: string; // legacy single PAD ref id (back-compat)
  mjSrefRefId?: string;
  mjCrefRefId?: string;
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;

  // MJ Upscale snapshot
  upscaleSourceTaskId?: string;
  upscaleIndex?: number;

  // Gemini Pro Image snapshot
  gimageAspect?: string;
  gimageSize?: string;
  outputRefIds?: string[]; // newly created ReferenceImage ids

  // Video snapshot
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;

  // MV Compose snapshot (ffmpeg / media-backend)
  mvResolution?: string;
  mvFps?: number;
  mvDurationSeconds?: number;
  mvSubtitleMode?: string;
  mvSequence?: Array<{ refId: string; durationSeconds?: number }>;
  mvVideoUrl?: string;
  mvAudioUrl?: string;
  mvSubtitleSrt?: string;
  mvAction?: string;
}

export type CommandMode =
  | 'mj'
  | 'suno'
  | 'youtube'
  | 'video'
  | 'deconstruct'
  | 'pedit'
  | 'beautify'
  | 'post'
  // MV compose recipes (菜谱)
  | 'mv-mix'
  | 'mv-images'
  | 'mv-clip'
  | 'mv-subtitle'
  // legacy (kept for persisted state backward-compat)
  | 'mv'
  | 'mv-assets'
  | 'mv-settings'
  | 'mv-subtitles'
  | 'mv-text'
  | 'mv-plan'
  | 'mv-submit'
  | 'mv-track';
export type VideoProvider = 'jimeng' | 'kling' | 'gemini';

export type MediaAssetKind = 'video' | 'audio' | 'text' | 'subtitle';
export interface MediaAsset {
  id: string;
  kind: MediaAssetKind;
  name: string;
  createdAt: number;
  originKey?: string;
  url?: string;
  localUrl?: string;
  localPath?: string;
  localKey?: string;
  text?: string; // for subtitle/text assets
}

export interface MvSequenceItem {
  refId: string;
  durationSeconds?: number; // per-image override; fallback to mvDurationSeconds
}

export interface WorkflowState {
  step: WorkflowStep;

  uploadedImageBase64?: string;
  uploadedImageDataUrl?: string;
  uploadedImageUrl?: string;

  referenceImages: ReferenceImage[];
  // Material selection: multi-select buffer for reference images (used by postprocess/deconstruct/mv, etc.)
  selectedReferenceIds: string[];

  // MJ prompt "PAD" (垫图) - multi image reference
  mjPadRefIds: string[];

  // Active image for Step2 (describe/vision)
  activeImageId?: string;

  // Optional MJ prompt wrapper slots (CDN URL)
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;

  // Optional MJ prompt wrapper slots (reference ids; will lazily promote to CDN on generate)
  mjSrefRefId?: string;
  mjCrefRefId?: string;

  prompt?: string;

  taskId?: string;
  gridImageUrl?: string;

  selectedIndices: number[]; // 1-4
  upscaledImages: string[];

  history: WorkflowHistoryItem[];

  streamMessages: StreamMessage[];
  // UI-only: hide these message IDs from the main stream (desktop), without deleting history.
  desktopHiddenStreamMessageIds: string[];

  // UI-only: hide these message IDs from Planner Chat, without deleting local history.
  desktopHiddenPlannerMessageIds: string[];

  // UI-only: current trace drawer target
  traceTarget?: TraceTarget;
  // UI-only: if trace was opened from another overlay, return to it on close
  traceReturnTo?: 'vault';
  // UI-only: current branch HEAD for new actions (git-like)
  traceHeadMessageId?: string;

  // Pure chat mode for prompt planning
  plannerMessages: PlannerMessage[];

  // Command hub mode + video settings
  commandMode?: CommandMode;
  // SUNO prompt settings (for "Suno prompts" generator)
  // mode: auto -> inferred from text, but defaults to English + allow lyrics;
  // instrumental -> force instrumental-only control prompt;
  // lyrics -> force lyrics-capable prompt.
  sunoMode?: 'auto' | 'instrumental' | 'lyrics';
  // language: auto -> default English unless user explicitly requests; otherwise force output language.
  sunoLanguage?: 'auto' | 'en' | 'zh-cn' | 'zh-tw' | 'ja' | 'ko';
  // Prompt Beautify parameters (used by Command Mode: beautify)
  beautifyHint?: string;
  // Gemini Pro Image (text-to-image / edit / compose)
  gimageAspect?: string;
  gimageSize?: string;
  videoProvider?: VideoProvider;
  videoModel?: string;
  videoSeconds?: number;
  videoMode?: string;
  videoAspect?: string;
  videoSize?: string;
  videoStartRefId?: string;
  videoEndRefId?: string;

  // MV compose (FFmpeg)
  mediaAssets: MediaAsset[];
  // Material selection: multi-select buffer for audio/video/subtitle assets
  selectedMediaAssetIds: string[];
  mvSequence: MvSequenceItem[];
  mvSubtitleText?: string;
  mvText?: string;
  mvResolution?: string; // e.g. "source" | "1280x720" | "1920x1080"
  mvFps?: number;
  mvDurationSeconds?: number; // default image duration (seconds) for mvSequence items
  mvSubtitleMode?: 'soft' | 'burn';
  mvAction?: 'clip' | 'mv';

  // Postprocess (ffmpeg)
  postVideoPreset?: string;
  postVideoCrf?: number;
}

export function createInitialWorkflowState(): WorkflowState {
  return {
    step: 1,
    selectedIndices: [],
    upscaledImages: [],
    referenceImages: [],
    selectedReferenceIds: [],
    mjPadRefIds: [],
    history: [],
    streamMessages: [],
    desktopHiddenStreamMessageIds: [],
    plannerMessages: [],
    desktopHiddenPlannerMessageIds: [],
    commandMode: 'mj',
    sunoMode: 'auto',
    sunoLanguage: 'auto',
    beautifyHint: '',
    gimageAspect: '16:9',
    gimageSize: '2K',
    videoProvider: 'jimeng',
    videoModel: 'jimeng-video-3.0',

    mediaAssets: [],
    selectedMediaAssetIds: [],
    mvSequence: [],
    mvSubtitleText: '',
    mvText: '',
    mvResolution: '1280x720',
    mvFps: 25,
    mvDurationSeconds: 5,
    mvSubtitleMode: 'soft',
    mvAction: 'mv',

    postVideoPreset: 'pet',
    postVideoCrf: 23,
  };
}

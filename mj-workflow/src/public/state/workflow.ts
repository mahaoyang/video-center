export type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ReferenceImage {
  id: string;
  name: string;
  createdAt: number;
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
export type StreamMessageKind = 'deconstruct' | 'generate' | 'upscale';

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

  // generate/upscale
  taskId?: string;
  gridImageUrl?: string;
  upscaledImageUrl?: string;

  progress?: number; // 0..100 for async tasks
  error?: string;
}

export interface WorkflowState {
  step: WorkflowStep;

  uploadedImageBase64?: string;
  uploadedImageDataUrl?: string;
  uploadedImageUrl?: string;

  referenceImages: ReferenceImage[];
  selectedReferenceIds: string[]; // multi-select buffer (used by Deconstruct)

  // MJ prompt "PAD" (垫图) - single image reference
  mjPadRefId?: string;

  // Active image for Step2 (describe/vision)
  activeImageId?: string;

  // Optional MJ prompt wrapper slots (CDN URL)
  mjSrefImageUrl?: string;
  mjCrefImageUrl?: string;

  prompt?: string;

  taskId?: string;
  gridImageUrl?: string;

  selectedIndices: number[]; // 1-4
  upscaledImages: string[];

  history: WorkflowHistoryItem[];

  streamMessages: StreamMessage[];

  // Pure chat mode for prompt planning
  plannerMessages: PlannerMessage[];
}

export function createInitialWorkflowState(): WorkflowState {
  return {
    step: 1,
    selectedIndices: [],
    upscaledImages: [],
    referenceImages: [],
    selectedReferenceIds: [],
    history: [],
    streamMessages: [],
    plannerMessages: [],
  };
}

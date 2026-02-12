import { createApiClient } from './adapters/api';
import { createDescribeBlock } from './blocks/describe';
import { createExportBlock } from './blocks/export';
import { createGenerateBlock } from './blocks/generate';
import { initUpload } from './blocks/upload';
import { createReferencePicker } from './blocks/references';
import { createInitialWorkflowState } from './state/workflow';
import { createStore } from './state/store';
import { loadPersistedState, startPersistence } from './storage/persistence';
import { createMjPromptPreview } from './blocks/mj-prompt-preview';
import { createMjParamsPanel } from './blocks/mj-params-panel';
import { createStreamHistory } from './blocks/stream-history';
import { createStreamActions } from './blocks/stream-actions';
import { createGeminiEditBlock } from './blocks/gemini-edit';
import { createPlannerChat } from './blocks/planner-chat';
import { initOverlays } from './blocks/overlays';
import { createCommandModeBlock } from './blocks/command-mode';
import { createVideoGenerateBlock } from './blocks/video-generate';
import { createVaultTimeline } from './blocks/vault-timeline';
import { createCommandFooterControls } from './blocks/command-footer-controls';
import { setupScrollAreas } from './atoms/scroll-area';
import { createTraceBlock } from './blocks/trace';
import { keepStreamBottomPaddingClear } from './blocks/stream-bottom-padding';
import { createSunoBlock } from './blocks/suno';
import { createYoutubeMetaBlock } from './blocks/youtube';
import { cleanupOrphanUploads } from './headless/uploads-gc';
import { createPostprocessBlock } from './blocks/postprocess';

document.addEventListener('DOMContentLoaded', () => {
  const api = createApiClient('/api');
  const initial = createInitialWorkflowState();
  const persisted = loadPersistedState();
  initial.history = persisted.history;
  initial.referenceImages = persisted.referenceImages;
  initial.selectedReferenceIds = persisted.selectedReferenceIds || [];
  initial.mjPadRefIds = Array.isArray(persisted.mjPadRefIds) ? persisted.mjPadRefIds : [];
  initial.mjSrefImageUrl = persisted.mjSrefImageUrl;
  initial.mjCrefImageUrl = persisted.mjCrefImageUrl;
  initial.mjSrefRefId = persisted.mjSrefRefId;
  initial.mjCrefRefId = persisted.mjCrefRefId;
  initial.activeImageId = persisted.activeImageId;
  initial.streamMessages = persisted.streamMessages || [];
  initial.desktopHiddenStreamMessageIds = persisted.desktopHiddenStreamMessageIds || [];
  initial.plannerMessages = persisted.plannerMessages || [];
  initial.mediaAssets = persisted.mediaAssets || [];
  initial.selectedMediaAssetIds = persisted.selectedMediaAssetIds || [];
  initial.desktopHiddenPlannerMessageIds = persisted.desktopHiddenPlannerMessageIds || [];
  initial.traceHeadMessageId = persisted.traceHeadMessageId;
  if (!initial.traceHeadMessageId && initial.streamMessages.length) {
    initial.traceHeadMessageId = initial.streamMessages.at(-1)!.id;
  }
  if (persisted.commandMode) initial.commandMode = persisted.commandMode as any;
  if ((persisted as any).sunoMode) (initial as any).sunoMode = (persisted as any).sunoMode as any;
  if ((persisted as any).sunoLanguage) (initial as any).sunoLanguage = (persisted as any).sunoLanguage as any;
  if (persisted.beautifyHint) initial.beautifyHint = persisted.beautifyHint as any;
  if (persisted.gimageAspect) initial.gimageAspect = persisted.gimageAspect as any;
  if (persisted.gimageSize) initial.gimageSize = persisted.gimageSize as any;
  if (persisted.videoProvider) initial.videoProvider = persisted.videoProvider as any;
  if (persisted.videoModel) initial.videoModel = persisted.videoModel as any;
  if (typeof persisted.videoSeconds === 'number') initial.videoSeconds = persisted.videoSeconds;
  if (persisted.videoMode) (initial as any).videoMode = persisted.videoMode as any;
  if (persisted.videoAspect) initial.videoAspect = persisted.videoAspect as any;
  if (persisted.videoSize) initial.videoSize = persisted.videoSize as any;
  if (persisted.videoStartRefId) initial.videoStartRefId = persisted.videoStartRefId as any;
  if (persisted.videoEndRefId) initial.videoEndRefId = persisted.videoEndRefId as any;

  // Set stage to active immediately for stream UI
  initial.step = 4;
  const store = createStore(initial);

  // Opportunistic local uploads GC: remove orphan files (not referenced by local state/history).
  // Keep a small grace window to avoid racing with in-flight operations.
  setTimeout(() => void cleanupOrphanUploads({ api, state: store.get(), minAgeSeconds: 24 * 3600 }), 8000);

  initUpload(store, api);
  createReferencePicker({ store, api });
  createVaultTimeline({ store, api });
  createMjPromptPreview(store);
  createMjParamsPanel(store);
  createCommandFooterControls(store);
  const pedit = createGeminiEditBlock({ api, store });
  startPersistence(store);

  const generate = createGenerateBlock({ api, store, activateStep: (s) => { } });
  const suno = createSunoBlock({ api, store });
  const youtube = createYoutubeMetaBlock({ api, store });
  const describe = createDescribeBlock({ api, store });
  createExportBlock(store);

  const streamActions = createStreamActions({ api, store });
  createStreamHistory({ store });
  createPlannerChat({ api, store });
  const video = createVideoGenerateBlock({ api, store });
  const post = createPostprocessBlock({ api, store });
  const command = createCommandModeBlock({
    api,
    store,
    generate,
    suno,
    youtube,
    describe,
    pedit,
    video,
    post,
  });
  initOverlays();
  setupScrollAreas(document);
  keepStreamBottomPaddingClear();

  createTraceBlock({ store });

  const genBtn = document.getElementById('step3Next') as HTMLButtonElement | null;
  genBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const zero = document.getElementById('zeroState');
    if (zero) zero.style.display = 'none';
    void command.execute();
  });
});

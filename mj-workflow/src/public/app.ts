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
import { createMvComposeBlock } from './blocks/mv-compose';
import { createPostprocessBlock } from './blocks/postprocess';

document.addEventListener('DOMContentLoaded', () => {
  const api = createApiClient('/api');
  const initial = createInitialWorkflowState();
  const persisted = loadPersistedState();
  initial.history = persisted.history;
  initial.referenceImages = persisted.referenceImages;
  initial.selectedReferenceIds = persisted.selectedReferenceIds || [];
  initial.mjPadRefId = persisted.mjPadRefId;
  initial.mjSrefImageUrl = persisted.mjSrefImageUrl;
  initial.mjCrefImageUrl = persisted.mjCrefImageUrl;
  initial.mjSrefRefId = persisted.mjSrefRefId;
  initial.mjCrefRefId = persisted.mjCrefRefId;
  initial.activeImageId = persisted.activeImageId;
  initial.streamMessages = persisted.streamMessages || [];
  initial.desktopHiddenStreamMessageIds = persisted.desktopHiddenStreamMessageIds || [];
  initial.plannerMessages = persisted.plannerMessages || [];
  initial.mediaAssets = persisted.mediaAssets || [];
  initial.traceHeadMessageId = persisted.traceHeadMessageId;
  if (!initial.traceHeadMessageId && initial.streamMessages.length) {
    initial.traceHeadMessageId = initial.streamMessages.at(-1)!.id;
  }
  if (persisted.commandMode) initial.commandMode = persisted.commandMode as any;
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
  if (Array.isArray(persisted.mvSequence)) initial.mvSequence = persisted.mvSequence as any;
  if (persisted.mvVideoAssetId) initial.mvVideoAssetId = persisted.mvVideoAssetId as any;
  if (persisted.mvAudioAssetId) initial.mvAudioAssetId = persisted.mvAudioAssetId as any;
  if (persisted.mvSubtitleAssetId) initial.mvSubtitleAssetId = persisted.mvSubtitleAssetId as any;
  if (typeof persisted.mvSubtitleText === 'string') initial.mvSubtitleText = persisted.mvSubtitleText as any;
  if (typeof persisted.mvText === 'string') initial.mvText = persisted.mvText as any;
  if (persisted.mvResolution) initial.mvResolution = persisted.mvResolution as any;
  if (typeof persisted.mvFps === 'number') initial.mvFps = persisted.mvFps;
  if (typeof persisted.mvDurationSeconds === 'number') initial.mvDurationSeconds = persisted.mvDurationSeconds;
  if (persisted.mvSubtitleMode) initial.mvSubtitleMode = persisted.mvSubtitleMode as any;
  if (persisted.mvAction) initial.mvAction = persisted.mvAction as any;

  // Set stage to active immediately for stream UI
  initial.step = 4;
  const store = createStore(initial);

  initUpload(store, api);
  createReferencePicker({ store, api });
  createVaultTimeline(store);
  createMjPromptPreview(store);
  createMjParamsPanel(store);
  createCommandFooterControls(store);
  const pedit = createGeminiEditBlock({ api, store });
  startPersistence(store);

  const generate = createGenerateBlock({ api, store, activateStep: (s) => { } });
  const describe = createDescribeBlock({ api, store });
  createExportBlock(store);

  const streamActions = createStreamActions({ api, store });
  createStreamHistory({ store });
  createPlannerChat({ api, store });
  const video = createVideoGenerateBlock({ api, store });
  const mv = createMvComposeBlock({ api, store });
  const post = createPostprocessBlock({ api, store });
  const command = createCommandModeBlock({
    api,
    store,
    generate,
    describe,
    pedit,
    video,
    mv: { cook: mv.cook },
    post: { run: post.run },
  });
  initOverlays();
  setupScrollAreas(document);

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

import { createApiClient } from './adapters/api';
import { createDescribeBlock } from './blocks/describe';
import { createExportBlock } from './blocks/export';
import { createGenerateBlock } from './blocks/generate';
import { initUpload } from './blocks/upload';
import { createReferencePicker } from './blocks/references';
import { createInitialWorkflowState } from './state/workflow';
import { createStore } from './state/store';
import { createHistoryView } from './blocks/history';
import { loadPersistedState, startPersistence } from './storage/persistence';
import { createMjPromptPreview } from './blocks/mj-prompt-preview';
import { createMjParamsPanel } from './blocks/mj-params-panel';
import { createStreamHistory } from './blocks/stream-history';
import { createStreamActions } from './blocks/stream-actions';
import { createGeminiEditBlock } from './blocks/gemini-edit';
import { createPlannerChat } from './blocks/planner-chat';
import { initOverlays } from './blocks/overlays';
import { createPromptBeautifyBlock } from './blocks/prompt-beautify';

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
  initial.plannerMessages = persisted.plannerMessages || [];

  // Set stage to active immediately for stream UI
  initial.step = 4;
  const store = createStore(initial);

  initUpload(store, api);
  createReferencePicker({ store, api });
  createHistoryView(store);
  createMjPromptPreview(store);
  createMjParamsPanel(store);
  createGeminiEditBlock({ api, store });
  startPersistence(store);

  const generate = createGenerateBlock({ api, store, activateStep: (s) => { } });
  createDescribeBlock({ api, store });
  createExportBlock(store);

  createStreamActions({ api, store });
  createStreamHistory({ store });
  createPlannerChat({ api, store });
  createPromptBeautifyBlock({ api });
  initOverlays();

  const genBtn = document.getElementById('step3Next') as HTMLButtonElement | null;
  genBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const zero = document.getElementById('zeroState');
    if (zero) zero.style.display = 'none';
    generate.generateImage();
  });
});

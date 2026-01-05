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
import { createDescribeEnginePicker } from './blocks/describe-engine-picker';

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
  initial.activeImageId = persisted.activeImageId;
  initial.streamMessages = persisted.streamMessages || [];

  // Set stage to active immediately for stream UI
  initial.step = 4;
  const store = createStore(initial);

  initUpload(store, api);
  createReferencePicker({ store, api });
  createHistoryView(store);
  createMjPromptPreview(store);
  createMjParamsPanel(store);
  createDescribeEnginePicker();
  startPersistence(store);

  const describe = createDescribeBlock({ api, store });
  const generate = createGenerateBlock({ api, store, activateStep: (s) => { } });
  const exportBlock = createExportBlock(store);

  createStreamActions({ api, store });
  createStreamHistory({ store });

  // Global Exports for HTML
  (window as any).deconstructAssets = describe.deconstructAssets;
  (window as any).generateImage = () => {
    // Hide zeroState on first generation command
    const zero = document.getElementById('zeroState');
    if (zero) zero.style.display = 'none';
    generate.generateImage();
  };
  (window as any).downloadFinalImage = exportBlock.downloadFinalImage;
  (window as any).resetWorkflow = () => {
    if (confirm('Clear current session?')) {
      exportBlock.resetWorkflow();
      window.location.reload();
    }
  };
});

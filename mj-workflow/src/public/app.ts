import { createApiClient } from './adapters/api';
import { createDescribeBlock } from './blocks/describe';
import { createExportBlock } from './blocks/export';
import { createGenerateBlock } from './blocks/generate';
import { createSelectionBlock } from './blocks/select';
import { createStepper } from './blocks/stepper';
import { initUpload } from './blocks/upload';
import { createUpscaleBlock } from './blocks/upscale';
import { createReferencePicker } from './blocks/references';
import { createInitialWorkflowState } from './state/workflow';
import { createStore } from './state/store';
import { createHistoryView } from './blocks/history';
import { loadPersistedState, startPersistence } from './storage/persistence';
import { createMjPromptPreview } from './blocks/mj-prompt-preview';
import { createActiveImagePicker } from './blocks/active-image-picker';
import { createMjParamsPanel } from './blocks/mj-params-panel';

document.addEventListener('DOMContentLoaded', () => {
  const api = createApiClient('/api');
  const initial = createInitialWorkflowState();
  const persisted = loadPersistedState();
  initial.history = persisted.history;
  initial.referenceImages = persisted.referenceImages;
  initial.selectedReferenceIds = persisted.selectedReferenceIds || [];
  initial.mjSrefImageUrl = persisted.mjSrefImageUrl;
  initial.mjCrefImageUrl = persisted.mjCrefImageUrl;
  initial.activeImageId = persisted.activeImageId;
  const store = createStore(initial);

  const step1UseHistoryBtn = document.getElementById('step1UseHistoryBtn') as HTMLButtonElement | null;
  const toggleUseHistory = () => {
    if (!step1UseHistoryBtn) return;
    const hasHistory = store.get().referenceImages.length > 0;
    step1UseHistoryBtn.classList.toggle('hidden', !hasHistory);
  };
  toggleUseHistory();
  store.subscribe(toggleUseHistory);

  initUpload(store, api);
  createReferencePicker({ store, api });
  createActiveImagePicker({ store, api });
  createHistoryView(store);
  createMjPromptPreview(store);
  createMjParamsPanel(store);
  startPersistence(store);

  const stepper = createStepper(store);
  const selection = createSelectionBlock(store);
  const describe = createDescribeBlock({ api, store });
  const generate = createGenerateBlock({ api, store, activateStep: stepper.activateStep });
  const upscale = createUpscaleBlock({ api, store, activateStep: stepper.activateStep });
  const exportBlock = createExportBlock(store);

  const engineKey = 'mj-workflow:describe-engine';
  const engineSelect = document.getElementById('describeEngineSelect') as HTMLSelectElement | null;
  const savedEngine = localStorage.getItem(engineKey);
  if (engineSelect) {
    if (savedEngine) {
      engineSelect.value = savedEngine;
    } else {
      const oldProvider = localStorage.getItem('mj-workflow:describe-provider');
      const oldModel = localStorage.getItem('mj-workflow:vision-model');
      if (oldProvider === 'mj') engineSelect.value = 'mj';
      else if (oldProvider === 'gemini') engineSelect.value = 'gemini';
      else if (oldModel) engineSelect.value = `vision:${oldModel}`;
      else engineSelect.value = 'gemini';
    }

    engineSelect.addEventListener('change', () => {
      localStorage.setItem(engineKey, engineSelect.value);
      updateDescribeButtonLabel();
    });
  }

  function updateDescribeButtonLabel() {
    const btn = document.getElementById('describeBtn') as HTMLButtonElement | null;
    if (!btn || !engineSelect) return;
    const v = engineSelect.value;
    if (v === 'mj') btn.textContent = 'MJ Describe';
    else if (v.startsWith('vision:')) btn.textContent = 'Vision Describe';
    else btn.textContent = 'Gemini Describe';
  }

  updateDescribeButtonLabel();

  function nextStep(step: number) {
    stepper.activateStep(step as any);
    if (step === 3) describe.tryPrefillPrompt();
    if (step === 5) selection.renderSplitGrid();
  }

  // Auto-advance to Step 5 when MJ grid becomes available.
  let autoAdvancedOnce = false;
  store.subscribe((s) => {
    if (autoAdvancedOnce) return;
    if (s.step === 4 && s.gridImageUrl) {
      autoAdvancedOnce = true;
      nextStep(5);
    }
  });

  async function describePrompt() {
    const engine = engineSelect?.value || 'gemini';
    await describe.describePrompt(engine);
  }

  (window as any).skipToStep3 = () => nextStep(3);
  (window as any).nextStep = (step: number) => nextStep(step);
  (window as any).scrollToTop = exportBlock.scrollToTop;
  (window as any).scrollToCurrentStep = stepper.scrollToCurrentStep;
  (window as any).describePrompt = describePrompt;
  (window as any).generateImage = generate.generateImage;
  (window as any).upscaleSelected = upscale.upscaleSelected;
  (window as any).geminiEditUpscaled = upscale.geminiEditUpscaled;
  (window as any).downloadFinalImage = exportBlock.downloadFinalImage;
  (window as any).resetWorkflow = exportBlock.resetWorkflow;
});

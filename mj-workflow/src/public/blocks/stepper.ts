import type { Store } from '../state/store';
import type { WorkflowState, WorkflowStep } from '../state/workflow';
import { byId, scrollIntoView, setDisabled, show } from '../atoms/ui';

function updateWorkflowProgress(step: number) {
  const stepText = document.getElementById('workflowStepText');
  if (stepText) {
    const stepNum = step.toString().padStart(2, '0');
    stepText.textContent = `Step ${stepNum}`;
  }

  const progressBar = document.getElementById('workflowProgressBar') as HTMLDivElement | null;
  if (progressBar) {
    const progress = Math.max(1, Math.min(7, step)) / 7;
    progressBar.style.width = `${(progress * 100).toFixed(4)}%`;
  }
}

export function createStepper(store: Store<WorkflowState>) {
  function activateStep(step: WorkflowStep) {
    document.querySelectorAll('.step-card').forEach((card) => {
      card.classList.remove('active');
      card.classList.add('opacity-40');
    });

    const current = document.getElementById(`step${step}`);
    if (current) {
      current.classList.add('active');
      current.classList.remove('opacity-40');
      scrollIntoView(current);
    }

    for (let i = 1; i < step; i++) {
      const prev = document.getElementById(`step${i}`);
      prev?.classList.add('completed');
      prev?.classList.remove('opacity-40');
    }

    store.update((s) => ({ ...s, step }));
    updateWorkflowProgress(step);

    if (step === 2) {
      setDisabled(byId<HTMLButtonElement>('describeBtn'), false);
      setDisabled(byId<HTMLSelectElement>('describeEngineSelect'), false);
    }

    if (step === 3) {
      setDisabled(byId<HTMLTextAreaElement>('promptInput'), false);
      setDisabled(byId<HTMLButtonElement>('step3Next'), false);
    }

    if (step === 4) {
      show(byId<HTMLElement>('generatingStatus'));
    }
  }

  function scrollToCurrentStep() {
    const step = store.get().step;
    document.getElementById(`step${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  updateWorkflowProgress(store.get().step);

  return { activateStep, scrollToCurrentStep };
}

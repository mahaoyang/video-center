import type { Store } from '../state/store';
import type { WorkflowState, WorkflowStep } from '../state/workflow';
import { byId, scrollIntoView, setDisabled, show } from '../atoms/ui';

function updateWorkflowProgress(step: number) {
  const stepText = document.getElementById('workflowStepText');
  if (stepText) {
    const stepNum = step.toString().padStart(2, '0');
    stepText.textContent = `${stepNum}`;
  }

  const phaseText = document.getElementById('currentPhaseName');
  if (phaseText) {
    if (step <= 2) phaseText.textContent = 'Preparation';
    else if (step === 3) phaseText.textContent = 'Orchestration';
    else if (step <= 6) phaseText.textContent = 'Synthesis';
    else phaseText.textContent = 'Completion';
  }

  const dots = document.getElementById('stepDots');
  if (dots) {
    dots.querySelectorAll('div').forEach((dot, idx) => {
      const dotStep = idx + 1;
      dot.className = 'w-1.5 h-1.5 rounded-full transition-all duration-500';
      if (dotStep === step) {
        dot.classList.add('bg-studio-dark', 'scale-125');
      } else if (dotStep < step) {
        dot.classList.add('bg-studio-dark/40');
      } else {
        dot.classList.add('bg-studio-dark/10');
      }
    });
  }

  const progressBar = document.getElementById('workflowProgressBar') as HTMLDivElement | null;
  if (progressBar) {
    const progress = Math.max(1, Math.min(7, step)) / 7;
    progressBar.style.width = `${(progress * 100).toFixed(4)}%`;
  }
}

export function createStepper(store: Store<WorkflowState>) {
  function activateStep(step: WorkflowStep) {
    // Phase 1 (1, 2, 3) -> Section 1
    // Phase 2 (4, 5, 6, 7) -> Section 4
    let visualStep: number;
    if (step <= 3) visualStep = 1;
    else visualStep = 4;

    document.querySelectorAll('.step-section').forEach((card) => {
      card.classList.remove('active');
    });

    const current = document.getElementById(`step${visualStep}`);
    if (current) {
      current.classList.add('active');
      scrollIntoView(current);
    }

    // Mark previous visual blocks as completed
    for (let i = 1; i < visualStep; i++) {
      const prev = document.getElementById(`step${i}`);
      prev?.classList.add('completed');
    }

    store.update((s) => ({ ...s, step }));
    updateWorkflowProgress(step);

    // Re-enable inputs for the active phase
    if (step <= 3) {
      setDisabled(byId<HTMLTextAreaElement>('promptInput'), false);
      setDisabled(byId<HTMLButtonElement>('step3Next'), false);
      setDisabled(byId<HTMLButtonElement>('describeBtn'), false);
      setDisabled(byId<HTMLSelectElement>('describeEngineSelect'), false);
    }

    if (step === 4) {
      show(byId<HTMLElement>('generatingStatus'));
    }
  }

  function scrollToCurrentStep() {
    const s = store.get();
    const visualStep = s.step <= 3 ? 1 : s.step;
    document.getElementById(`step${visualStep}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  updateWorkflowProgress(store.get().step);

  return { activateStep, scrollToCurrentStep };
}

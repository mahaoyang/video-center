import type { Store } from '../state/store';
import type { WorkflowState } from '../state/workflow';
import { showError } from '../atoms/notify';

export function createExportBlock(store: Store<WorkflowState>) {
  function downloadFinalImage() {
    const images = store.get().upscaledImages;
    if (!images.length) {
      showError('没有可下载的图片');
      return;
    }

    const url = images[images.length - 1]!;
    const a = document.createElement('a');
    a.href = url;
    a.download = `mj-upscaled-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function resetWorkflow() {
    if (confirm('确定要重新开始吗？')) location.reload();
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return { downloadFinalImage, resetWorkflow, scrollToTop };
}

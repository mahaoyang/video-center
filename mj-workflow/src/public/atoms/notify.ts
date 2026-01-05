function ensurePanel(): {
  container: HTMLDivElement;
  title: HTMLDivElement;
  pre: HTMLPreElement;
  copyBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
} {
  const existing = document.getElementById('mjNotifyPanel') as HTMLDivElement | null;
  if (existing) {
    return {
      container: existing,
      title: existing.querySelector('[data-role="title"]') as HTMLDivElement,
      pre: existing.querySelector('pre') as HTMLPreElement,
      copyBtn: existing.querySelector('[data-action="copy"]') as HTMLButtonElement,
      closeBtn: existing.querySelector('[data-action="close"]') as HTMLButtonElement,
    };
  }

  const container = document.createElement('div');
  container.id = 'mjNotifyPanel';
  container.className =
    'fixed bottom-4 right-4 left-4 md:left-auto md:w-[720px] z-[9999] hidden rounded-2xl border border-white/10 bg-studio-panel/85 text-studio-text backdrop-blur-xl p-4 shadow-2xl';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-3 mb-3';

  const title = document.createElement('div');
  title.dataset.role = 'title';
  title.className = 'text-[10px] uppercase tracking-[0.3em] font-black opacity-50';
  title.textContent = 'Message';

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-2';

  const copyBtn = document.createElement('button');
  copyBtn.dataset.action = 'copy';
  copyBtn.className =
    'px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black uppercase tracking-widest';
  copyBtn.textContent = 'Copy';

  const closeBtn = document.createElement('button');
  closeBtn.dataset.action = 'close';
  closeBtn.className =
    'px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest';
  closeBtn.textContent = 'Close';

  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  const pre = document.createElement('pre');
  pre.className =
    'whitespace-pre-wrap break-words text-sm leading-relaxed p-4 rounded-xl bg-black/30 border border-white/10 max-h-[40vh] overflow-auto select-text text-studio-text';
  pre.textContent = '';

  container.appendChild(header);
  container.appendChild(pre);
  document.body.appendChild(container);

  closeBtn.addEventListener('click', () => {
    container.classList.add('hidden');
  });

  copyBtn.addEventListener('click', async () => {
    const text = pre.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    } catch {
      // fallback: select text for manual copy
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      copyBtn.textContent = 'Select';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    }
  });

  return { container, title, pre, copyBtn, closeBtn };
}

function shouldShowInfoMessages(): boolean {
  try {
    if ((window as any).__mjNotifyDebug) return true;
    return localStorage.getItem('mj-workflow:debug-notify') === '1';
  } catch {
    return false;
  }
}

export function showMessage(message: string) {
  if (!shouldShowInfoMessages()) {
    console.info('[mj-workflow]', message);
    return;
  }
  const now = Date.now();
  const key = '__mjNotifyLast';
  const last = (window as any)[key] as { msg: string; at: number } | undefined;
  if (last && last.msg === message && now - last.at < 800) return;
  (window as any)[key] = { msg: message, at: now };

  const panel = ensurePanel();
  panel.title.textContent = 'Message';
  panel.pre.textContent = message;
  panel.container.classList.remove('hidden');
}

export function showError(message: string) {
  const now = Date.now();
  const key = '__mjNotifyLastErr';
  const last = (window as any)[key] as { msg: string; at: number } | undefined;
  if (last && last.msg === message && now - last.at < 800) return;
  (window as any)[key] = { msg: message, at: now };

  const panel = ensurePanel();
  panel.title.textContent = 'Error';
  panel.pre.textContent = message;
  panel.container.classList.remove('hidden');
}

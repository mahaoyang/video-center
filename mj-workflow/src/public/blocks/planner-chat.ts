import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { byId } from '../atoms/ui';
import { setPromptInput } from '../atoms/prompt-input';
import { extractShotPrompts } from '../atoms/prompt-extract';
import type { Store } from '../state/store';
import type { PlannerMessage, WorkflowState } from '../state/workflow';

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createPlannerChat(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const list = byId<HTMLElement>('plannerMessages');
  const input = byId<HTMLTextAreaElement>('plannerInput');
  const send = byId<HTMLButtonElement>('plannerSend');
  const clear = byId<HTMLButtonElement>('plannerClear');

  let usedSeq = 0;
  const usedOrderByItem = new Map<string, number>();
  const editByItem = new Map<string, string>();

  function normalizePrompt(prompt: string): string {
    return String(prompt || '').trim().replace(/\s+/g, ' ');
  }

  function getUsedIndexByItem(itemKey: string): number | undefined {
    return usedOrderByItem.get(itemKey);
  }

  function markUsedByItem(itemKey: string): number {
    const existing = usedOrderByItem.get(itemKey);
    if (existing) return existing;
    usedSeq += 1;
    usedOrderByItem.set(itemKey, usedSeq);
    return usedSeq;
  }

  function getEditedText(itemKey: string, fallback: string): string {
    return editByItem.get(itemKey) ?? fallback;
  }

  function setEditedText(itemKey: string, value: string) {
    editByItem.set(itemKey, value);
  }

  function applyUsedStyle(btn: HTMLButtonElement, usedIndex: number | undefined) {
    const used = typeof usedIndex === 'number' && Number.isFinite(usedIndex);
    btn.className =
      (used
        ? 'px-4 py-2 rounded-full bg-studio-accent text-studio-bg border border-studio-accent/60 hover:opacity-95 transition-all text-[9px] font-black tracking-[0.1em] flex items-center gap-2'
        : 'px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black tracking-[0.1em] flex items-center gap-2');
    btn.dataset.usedIndex = used ? String(usedIndex) : '';
  }

  function autosizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(220, textarea.scrollHeight)}px`;
  }

  function renderEditableShot(params2: { itemKey: string; label?: string; initial: string }): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'mt-4 rounded-2xl border border-white/10 bg-black/20 p-4';

    const top = document.createElement('div');
    top.className = 'flex items-center justify-between gap-3 mb-3';

    const left = document.createElement('div');
    left.className = 'flex items-center gap-2 min-w-0';
    if (params2.label) {
      const tag = document.createElement('span');
      tag.className = 'px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[8px] font-mono opacity-60 flex-shrink-0';
      tag.textContent = params2.label;
      left.appendChild(tag);
    }
    const hint = document.createElement('span');
    hint.className = 'text-[9px] font-black uppercase tracking-[0.25em] opacity-30 truncate';
    hint.textContent = 'Shot Prompt';
    left.appendChild(hint);
    top.appendChild(left);

    const btn = document.createElement('button');
    btn.type = 'button';
    const usedIndex = getUsedIndexByItem(params2.itemKey);
    applyUsedStyle(btn, usedIndex);
    btn.innerHTML = usedIndex
      ? `<i class="fas fa-check text-[9px]"></i><span>Used</span><span class="text-[8px] font-mono opacity-70">#${usedIndex}</span>`
      : `<i class="fas fa-plus text-[9px] opacity-60"></i><span>Use</span>`;
    btn.title = '保存该分镜并填入主提示词输入框';
    top.appendChild(btn);
    wrap.appendChild(top);

    const textarea = document.createElement('textarea');
    textarea.className =
      'w-full bg-transparent border border-white/10 rounded-2xl p-4 text-[11px] font-medium leading-relaxed focus:border-studio-accent/50 transition-all resize-none min-h-[64px]';
    textarea.value = getEditedText(params2.itemKey, params2.initial);
    autosizeTextarea(textarea);
    textarea.addEventListener('input', () => {
      setEditedText(params2.itemKey, textarea.value);
      autosizeTextarea(textarea);
    });
    wrap.appendChild(textarea);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = normalizePrompt(textarea.value);
      if (!text) return;
      setEditedText(params2.itemKey, text);
      const n = markUsedByItem(params2.itemKey);
      applyUsedStyle(btn, n);
      btn.innerHTML = `<i class="fas fa-check text-[9px]"></i><span>Used</span><span class="text-[8px] font-mono opacity-70">#${n}</span>`;
      setPromptInput(text);
      requestAnimationFrame(() => (window as any).togglePlanner?.(false));
    });

    return wrap;
  }

  function render(messages: PlannerMessage[]) {
    list.innerHTML = '';
    for (const m of messages) {
      const row = document.createElement('div');
      row.className = m.role === 'user' ? 'flex justify-end' : 'flex justify-start';

      const bubble = document.createElement('div');
      bubble.className =
        (m.role === 'user'
          ? 'max-w-[85%] rounded-[1.8rem] border border-white/10 bg-white/5 px-5 py-4'
          : 'max-w-[85%] rounded-[1.8rem] border border-white/10 bg-studio-panel/60 px-5 py-4') +
        ' shadow-xl';

      const textBlock = document.createElement('div');
      textBlock.className = 'text-[11px] leading-relaxed whitespace-pre-wrap break-words text-white/80';
      textBlock.textContent = m.text;
      bubble.appendChild(textBlock);

      if (m.role === 'ai') {
        const prompts = extractShotPrompts(m.text);
        const raw = m.text.trim();
        const isSinglePrompt = prompts.length === 1 && (prompts[0] || '').trim() === raw;

        if (isSinglePrompt) {
          const key = `${m.id}:shot:0`;
          bubble.appendChild(renderEditableShot({ itemKey: key, label: 'S1', initial: prompts[0] || raw }));
        } else if (prompts.length) {
          for (let i = 0; i < prompts.length; i++) {
            const p = prompts[i]!;
            const key = `${m.id}:shot:${i}`;
            bubble.appendChild(renderEditableShot({ itemKey: key, label: `S${i + 1}`, initial: p }));
          }
        }
      }

      row.appendChild(bubble);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const user: PlannerMessage = { id: randomId('msg'), createdAt: Date.now(), role: 'user', text };
    const aiId = randomId('msg');
    const pending: PlannerMessage = { id: aiId, createdAt: Date.now(), role: 'ai', text: 'Thinking…' };
    params.store.update((s) => ({ ...s, plannerMessages: [...s.plannerMessages, user, pending].slice(-200) }));

    try {
      const msgs = params.store.get().plannerMessages
        .filter((m) => m.id !== aiId)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));

      const res = await params.api.geminiChat({ messages: msgs });
      if (res?.code !== 0) throw new Error(res?.description || '对话失败');
      const out = String(res?.result?.text || '').trim();
      if (!out) throw new Error('对话失败：空响应');

      const shots = extractShotPrompts(out);
      if (shots.length > 1) {
        const now = Date.now();
        const split = shots.map((t, i) => ({ id: randomId('msg'), createdAt: now + i, role: 'ai' as const, text: t }));
        params.store.update((s) => ({
          ...s,
          plannerMessages: [...s.plannerMessages.filter((m) => m.id !== aiId), ...split].slice(-200),
        }));
      } else {
        params.store.update((s) => ({
          ...s,
          plannerMessages: s.plannerMessages.map((m) => (m.id === aiId ? { ...m, text: out } : m)),
        }));
      }
    } catch (e) {
      console.error('planner chat failed:', e);
      const msg = (e as Error)?.message || '对话失败';
      showError(msg);
      params.store.update((s) => ({
        ...s,
        plannerMessages: s.plannerMessages.map((m) => (m.id === aiId ? { ...m, text: `ERROR: ${msg}` } : m)),
      }));
    }
  }

  send.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void sendMessage();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void sendMessage();
    }
  });

  clear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm('清空 Planner 对话？');
    if (!ok) return;
    params.store.update((s) => ({ ...s, plannerMessages: [] }));
  });

  render(params.store.get().plannerMessages);
  params.store.subscribe((s) => render(s.plannerMessages));

  return { sendMessage };
}

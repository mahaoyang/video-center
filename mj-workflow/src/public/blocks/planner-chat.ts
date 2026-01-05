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

      bubble.innerHTML = `<div class="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-white/80">${escapeHtml(
        m.text
      )}</div>`;

      if (m.role === 'ai') {
        const prompts = extractShotPrompts(m.text);
        if (prompts.length) {
          const bar = document.createElement('div');
          bar.className = 'mt-4 flex flex-wrap gap-2';
          for (let i = 0; i < prompts.length; i++) {
            const p = prompts[i]!;
            const b = document.createElement('button');
            b.type = 'button';
            b.className =
              'px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-studio-accent/40 hover:text-studio-accent transition-all text-[9px] font-black tracking-[0.1em] flex items-center gap-2';
            const tag = document.createElement('span');
            tag.className = 'text-[8px] font-mono opacity-50';
            tag.textContent = `S${i + 1}`;
            const plus = document.createElement('i');
            plus.className = 'fas fa-plus text-[9px] opacity-60';
            const preview = document.createElement('span');
            preview.className = 'max-w-[240px] truncate';
            preview.textContent = p;
            b.appendChild(tag);
            b.appendChild(plus);
            b.appendChild(preview);
            b.title = p;
            b.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              setPromptInput(p);
            });
            bar.appendChild(b);
          }
          bubble.appendChild(bar);
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
    const pending: PlannerMessage = { id: aiId, createdAt: Date.now(), role: 'ai', text: '…' };
    params.store.update((s) => ({ ...s, plannerMessages: [...s.plannerMessages, user, pending].slice(-200) }));

    try {
      const msgs = params.store.get().plannerMessages
        .filter((m) => m.id !== aiId)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));

      const res = await params.api.geminiChat({ messages: msgs });
      if (res?.code !== 0) throw new Error(res?.description || '对话失败');
      const out = String(res?.result?.text || '').trim();
      if (!out) throw new Error('对话失败：空响应');

      params.store.update((s) => ({
        ...s,
        plannerMessages: s.plannerMessages.map((m) => (m.id === aiId ? { ...m, text: out } : m)),
      }));
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

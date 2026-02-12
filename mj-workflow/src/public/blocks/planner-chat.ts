import type { ApiClient } from '../adapters/api';
import { showError } from '../atoms/notify';
import { randomId } from '../atoms/id';
import { byId } from '../atoms/ui';
import { setPromptInput } from '../atoms/prompt-input';
import { extractPlannerShots, extractSunoSongPrompts } from '../atoms/prompt-extract';
import { setPlannerOpen } from '../atoms/overlays';
import { beautifyPromptBodyZh } from '../adapters/mj-prompt-ai';
import type { Store } from '../state/store';
import type { PlannerMessage, WorkflowState } from '../state/workflow';
import { hidePlannerMessageUiOnly } from '../headless/conversation-actions';

export function createPlannerChat(params: { api: ApiClient; store: Store<WorkflowState> }) {
  const list = byId<HTMLElement>('plannerMessages');
  const input = byId<HTMLTextAreaElement>('plannerInput');
  const send = byId<HTMLButtonElement>('plannerSend');
  const sendMv = byId<HTMLButtonElement>('plannerSendMv');
  const clear = byId<HTMLButtonElement>('plannerClear');

  let usedSeq = 0;
  const usedOrderByItem = new Map<string, number>();
  const editByItem = new Map<string, string>();
  const shotInitialByItem = new Map<string, string>();
  const shotOrderByMessage = new Map<string, string[]>();
  const shotEnteringByItem = new Set<string>();

  function normalizePrompt(prompt: string): string {
    return String(prompt || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeMultiline(text: string): string {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  function rerender() {
    render(params.store.get());
  }

  function autosizeComposer(textarea: HTMLTextAreaElement) {
    const min = 72;
    const max = 260;
    textarea.style.height = 'auto';
    const next = Math.min(max, Math.max(min, textarea.scrollHeight));
    textarea.style.height = `${next}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    const value = normalizeMultiline(text);
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
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

  function ensureShotsForMessage(messageId: string, extracted: string[]): string[] {
    const existing = shotOrderByMessage.get(messageId);
    if (existing && Array.isArray(existing)) return existing;

    const keys: string[] = [];
    for (let i = 0; i < extracted.length; i++) {
      const key = `${messageId}:shot:${i}`;
      keys.push(key);
      if (!shotInitialByItem.has(key)) shotInitialByItem.set(key, extracted[i] || '');
    }
    shotOrderByMessage.set(messageId, keys);
    return keys;
  }

  function getShotText(itemKey: string): string {
    const initial = shotInitialByItem.get(itemKey) || '';
    return normalizePrompt(getEditedText(itemKey, initial));
  }

  function getShotContext(messageId: string, itemKey: string): { prev: string; next: string } {
    const order = shotOrderByMessage.get(messageId) || [];
    const idx = order.indexOf(itemKey);
    const prevKey = idx > 0 ? order[idx - 1] : undefined;
    const nextKey = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
    const prev = prevKey ? getShotText(prevKey) : '';
    const next = nextKey ? getShotText(nextKey) : '';
    return { prev, next };
  }

  function updateMessageShotsText(messageId: string) {
    const current = params.store.get().plannerMessages.find((m) => m.id === messageId);
    if (!current) return;

    const order = shotOrderByMessage.get(messageId) || [];
    const shots = order.map((k) => getShotText(k)).filter(Boolean);
    const suno = extractSunoSongPrompts(current.text);

    const shotsBlock = ['SHOTS:', ...shots.map((t, i) => `${i + 1}. ${t}`)].join('\n');
    const nextText = suno
      ? `${shotsBlock}\n\nLYRICS_PROMPT:\n${suno.lyricsPrompt}\n\nSTYLE_PROMPT:\n${suno.stylePrompt}`.trim()
      : shotsBlock.trim();

    params.store.update((s) => ({
      ...s,
      plannerMessages: s.plannerMessages.map((m) => (m.id === messageId ? { ...m, text: nextText } : m)),
    }));
  }

  function insertShot(messageId: string, index: number) {
    const order = [...(shotOrderByMessage.get(messageId) || [])];
    const id = randomId('shot');
    const key = `${messageId}:shot:${id}`;
    shotInitialByItem.set(key, '');
    editByItem.set(key, '');
    shotEnteringByItem.add(key);

    const at = Math.min(Math.max(0, index), order.length);
    order.splice(at, 0, key);
    shotOrderByMessage.set(messageId, order);
    rerender();
  }

  function deleteShot(messageId: string, itemKey: string) {
    const order = [...(shotOrderByMessage.get(messageId) || [])];
    const idx = order.indexOf(itemKey);
    if (idx === -1) return;
    order.splice(idx, 1);
    shotOrderByMessage.set(messageId, order);
    usedOrderByItem.delete(itemKey);
    editByItem.delete(itemKey);
    rerender();
    updateMessageShotsText(messageId);
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
    textarea.style.height = `${Math.min(640, Math.max(160, textarea.scrollHeight))}px`;
  }

  function applyUsedIconStyle(btn: HTMLButtonElement, usedIndex: number | undefined) {
    const used = typeof usedIndex === 'number' && Number.isFinite(usedIndex);
    btn.className =
      (used
        ? 'relative w-10 h-10 rounded-2xl bg-studio-accent text-studio-bg border border-studio-accent/60 hover:opacity-95 transition-all flex items-center justify-center'
        : 'relative w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-studio-accent hover:border-studio-accent/40 transition-all flex items-center justify-center');
    btn.dataset.usedIndex = used ? String(usedIndex) : '';
  }

  function iconUsedBadgeHtml(usedIndex: number | undefined) {
    if (!usedIndex) return '';
    return `<span class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 border border-white/10 text-[9px] font-mono text-white/80 flex items-center justify-center">${usedIndex}</span>`;
  }

  function renderEditableBlock(params2: {
    itemKey: string;
    label?: string;
    hint: string;
    initial: string;
    placeholder: string;
    normalize: (text: string) => string;
    onUse: (text: string) => void | Promise<void>;
    useTitle: string;
    enableBeautify?: boolean;
    getBeautifyHint?: () => string;
    enableSave?: boolean;
    saveTitle?: string;
    onSave?: (text: string) => void | Promise<void>;
    enableDelete?: boolean;
    deleteTitle?: string;
    onDelete?: () => void | Promise<void>;
    animateIn?: boolean;
  }): DocumentFragment {
    const frag = document.createDocumentFragment();

    const wrapper = document.createElement('div');
    wrapper.className =
      'relative transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0';
    wrapper.dataset.plannerItemKey = params2.itemKey;
    frag.appendChild(wrapper);

    const bar = document.createElement('div');
    bar.className = 'mt-6 mb-3 flex items-center justify-between gap-3';

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
    hint.textContent = params2.hint;
    left.appendChild(hint);
    bar.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 flex-shrink-0';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-red-300 hover:border-red-500/30 transition-all flex items-center justify-center';
    deleteBtn.innerHTML = '<i class="fas fa-minus text-[11px]"></i>';
    deleteBtn.title = params2.deleteTitle || '删除弃用';
    deleteBtn.style.display = params2.enableDelete ? '' : 'none';

    const beautifyBtn = document.createElement('button');
    beautifyBtn.type = 'button';
    beautifyBtn.className =
      'w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-studio-accent hover:border-studio-accent/40 transition-all flex items-center justify-center';
    beautifyBtn.innerHTML = '<i class="fas fa-pen-nib text-[11px]"></i>';
    beautifyBtn.title = '提示词美化（Gemini）';
    beautifyBtn.style.display = params2.enableBeautify ? '' : 'none';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center';
    resetBtn.innerHTML = '<i class="fas fa-arrows-rotate text-[11px]"></i>';
    resetBtn.title = '重置为原始文本';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className =
      'w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center';
    saveBtn.innerHTML = '<i class="fas fa-check text-[12px]"></i>';
    saveBtn.title = params2.saveTitle || '保存';
    saveBtn.style.display = params2.enableSave ? '' : 'none';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    const usedIndex = getUsedIndexByItem(params2.itemKey);
    applyUsedIconStyle(useBtn, usedIndex);
    useBtn.innerHTML = usedIndex
      ? `<i class="fas fa-check text-[12px]"></i>${iconUsedBadgeHtml(usedIndex)}`
      : `<i class="fas fa-copy text-[12px] opacity-80"></i>`;
    useBtn.title = params2.useTitle;

    actions.appendChild(beautifyBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(useBtn);
    if (params2.enableDelete) actions.appendChild(deleteBtn);
    bar.appendChild(actions);
    wrapper.appendChild(bar);

    const textarea = document.createElement('textarea');
    textarea.className =
      'w-full bg-transparent border border-white/10 rounded-2xl p-5 text-[12px] font-medium leading-relaxed focus:border-studio-accent/50 transition-all resize-none min-h-[160px] whitespace-pre-wrap';
    textarea.value = getEditedText(params2.itemKey, params2.initial);
    textarea.placeholder = params2.placeholder;
    autosizeTextarea(textarea);
    textarea.addEventListener('input', () => {
      setEditedText(params2.itemKey, textarea.value);
      autosizeTextarea(textarea);
    });
    wrapper.appendChild(textarea);

    if (params2.animateIn) {
      wrapper.classList.add('opacity-0', 'translate-y-2', 'scale-95');
      requestAnimationFrame(() => {
        wrapper.classList.remove('opacity-0', 'translate-y-2', 'scale-95');
      });
    }

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      textarea.value = params2.initial;
      setEditedText(params2.itemKey, params2.initial);
      autosizeTextarea(textarea);
    });

    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = params2.normalize(textarea.value);
      setEditedText(params2.itemKey, text);
      textarea.value = text;
      autosizeTextarea(textarea);
      void params2.onSave?.(text);
    });

    beautifyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = params2.normalize(textarea.value);
      if (!current) {
        showError('请输入提示词');
        return;
      }

      const origHtml = beautifyBtn.innerHTML;
      beautifyBtn.disabled = true;
      resetBtn.disabled = true;
      saveBtn.disabled = true;
      useBtn.disabled = true;
      deleteBtn.disabled = true;
      beautifyBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-[11px]"></i>';
      try {
        const hint = params2.getBeautifyHint?.() || '';
        try {
          const next = await beautifyPromptBodyZh({ api: params.api, prompt: current, hint });
          const cleaned = params2.normalize(next);
          if (cleaned) {
            textarea.value = cleaned;
            setEditedText(params2.itemKey, cleaned);
            autosizeTextarea(textarea);
          }
        } catch (error) {
          showError((error as Error)?.message || '提示词美化失败');
        }
      } finally {
        beautifyBtn.disabled = false;
        resetBtn.disabled = false;
        saveBtn.disabled = false;
        useBtn.disabled = false;
        deleteBtn.disabled = false;
        beautifyBtn.innerHTML = origHtml;
      }
    });

    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const doDelete = () => void params2.onDelete?.();
      if (!params2.enableDelete) return doDelete();

      // Animate-out (collapse + fade) before removing from state.
      deleteBtn.disabled = true;
      beautifyBtn.disabled = true;
      resetBtn.disabled = true;
      saveBtn.disabled = true;
      useBtn.disabled = true;

      const h = Math.max(0, wrapper.getBoundingClientRect().height);
      wrapper.style.overflow = 'hidden';
      wrapper.style.maxHeight = `${h}px`;
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'translateY(0)';
      wrapper.style.transition =
        'max-height 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1)';

      requestAnimationFrame(() => {
        wrapper.style.maxHeight = '0px';
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'translateY(-8px)';
      });

      setTimeout(() => doDelete(), 310);
    });

    useBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = params2.normalize(textarea.value);
      if (!text) return;
      setEditedText(params2.itemKey, text);
      const n = markUsedByItem(params2.itemKey);
      applyUsedIconStyle(useBtn, n);
      useBtn.innerHTML = `<i class="fas fa-check text-[12px]"></i>${iconUsedBadgeHtml(n)}`;
      void params2.onUse(text);
    });

    return frag;
  }

  function renderEditableShot(params2: { messageId: string; itemKey: string; label?: string; initial: string }): DocumentFragment {
    return renderEditableBlock({
      itemKey: params2.itemKey,
      label: params2.label,
      hint: 'Shot Prompt',
      initial: params2.initial,
      placeholder: params2.label ? `分镜 ${params2.label}` : '分镜提示词',
      normalize: normalizePrompt,
      useTitle: '保存并填入主输入框（自动收起）',
      enableBeautify: true,
      getBeautifyHint: () => {
        const { prev, next } = getShotContext(params2.messageId, params2.itemKey);
        return [
          '请在保持与前后分镜叙事连贯的前提下，美化当前分镜提示词（更具体、更具电影感、更适合 MJ）。',
          `前一分镜：${prev || '（无）'}`,
          `后一分镜：${next || '（无）'}`,
        ].join('\n');
      },
      enableSave: true,
      saveTitle: '保存（更新分镜序列）',
      onSave: async () => {
        updateMessageShotsText(params2.messageId);
      },
      enableDelete: true,
      deleteTitle: '删除弃用',
      onDelete: async () => {
        deleteShot(params2.messageId, params2.itemKey);
      },
      animateIn: shotEnteringByItem.has(params2.itemKey),
      onUse: async (text) => {
        setPromptInput(text);
        requestAnimationFrame(() => setPlannerOpen(false));
      },
    });
  }

  function renderInsertButton(params2: { messageId: string; index: number }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-center py-2';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'w-9 h-9 rounded-2xl bg-white/5 border border-white/10 text-white/50 hover:text-studio-accent hover:border-studio-accent/40 transition-all flex items-center justify-center';
    btn.innerHTML = '<i class="fas fa-plus text-[11px]"></i>';
    btn.title = '插入分镜';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertShot(params2.messageId, params2.index);
    });

    row.appendChild(btn);
    return row;
  }

  function render(state: WorkflowState) {
    const hidden = new Set(state.desktopHiddenPlannerMessageIds || []);
    const messages = (state.plannerMessages || []).filter((m) => !hidden.has(m.id));
    list.innerHTML = '';
    for (const m of messages) {
      const row = document.createElement('div');
      row.className = m.role === 'user' ? 'flex justify-end' : 'flex justify-start';

      const bubble = document.createElement('div');
      bubble.className =
        (m.role === 'user'
          ? 'max-w-[85%] rounded-[1.8rem] border border-white/10 bg-white/5 px-5 py-4'
          : 'w-full max-w-none rounded-[1.8rem] border border-white/10 bg-studio-panel/60 px-5 py-4') +
        ' shadow-xl relative group';

      const del = document.createElement('button');
      del.type = 'button';
      del.title = '删除（仅从对话界面移出）';
      del.className =
        'absolute top-3 right-3 w-8 h-8 rounded-2xl bg-white/5 border border-white/10 text-white/50 hover:border-red-400/30 hover:text-red-200 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100';
      del.innerHTML = '<i class="fas fa-trash text-[10px]"></i>';
      del.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.store.update((s) => hidePlannerMessageUiOnly(s, m.id));
      });
      bubble.appendChild(del);

      if (m.role === 'ai') {
        const shotPrompts = extractPlannerShots(m.text);
        const hasShotsHeader = /^(?:\s*)(shots|mj_shots|分镜|镜头)\s*[:：]?\s*$/im.test(String(m.text || ''));
        const shouldShowShots = shotPrompts.length > 0 || shotOrderByMessage.has(m.id) || hasShotsHeader;
        if (shouldShowShots) {
          const keys = ensureShotsForMessage(m.id, shotPrompts);
          if (!keys.length) {
            bubble.appendChild(renderInsertButton({ messageId: m.id, index: 0 }));
          } else {
            for (let i = 0; i < keys.length; i++) {
              bubble.appendChild(renderInsertButton({ messageId: m.id, index: i }));
              const key = keys[i]!;
              const initial = shotInitialByItem.get(key) ?? (i < shotPrompts.length ? (shotPrompts[i] ?? '') : '');
              if (!shotInitialByItem.has(key)) shotInitialByItem.set(key, initial);
              bubble.appendChild(renderEditableShot({ messageId: m.id, itemKey: key, label: `S${i + 1}`, initial }));
              shotEnteringByItem.delete(key);
            }
            bubble.appendChild(renderInsertButton({ messageId: m.id, index: keys.length }));
          }
        }

        const suno = extractSunoSongPrompts(m.text);
        if (suno) {
          const lyricsKey = `${m.id}:suno:lyrics`;
          bubble.appendChild(
            renderEditableBlock({
              itemKey: lyricsKey,
              label: 'LYRICS',
              hint: 'Suno Lyrics Prompt',
              initial: suno.lyricsPrompt,
              placeholder: 'LYRICS_PROMPT（元标签 + 歌词；纯音乐则只用元标签）',
              normalize: normalizeMultiline,
              useTitle: '复制到剪贴板',
              onUse: async (text) => {
                await copyToClipboard(text);
              },
            })
          );

          const styleKey = `${m.id}:suno:style`;
          bubble.appendChild(
            renderEditableBlock({
              itemKey: styleKey,
              label: 'STYLE',
              hint: 'Suno Style Prompt',
              initial: suno.stylePrompt,
              placeholder: 'STYLE_PROMPT（Suno Style of Music）',
              normalize: normalizePrompt,
              useTitle: '复制到剪贴板',
              onUse: async (text) => {
                await copyToClipboard(text);
              },
            })
          );
        }

        if (!shotPrompts.length && !suno) {
          const textBlock = document.createElement('div');
          textBlock.className = 'text-[11px] leading-relaxed whitespace-pre-wrap break-words text-white/80';
          textBlock.textContent = m.text;
          bubble.appendChild(textBlock);
        }
      } else {
        const textBlock = document.createElement('div');
        textBlock.className = 'text-[11px] leading-relaxed whitespace-pre-wrap break-words text-white/80';
        textBlock.textContent = m.text;
        bubble.appendChild(textBlock);
      }

      row.appendChild(bubble);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  }

  async function sendMessage(mode: 'chat' | 'mv' = 'chat') {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    autosizeComposer(input);

    const user: PlannerMessage = { id: randomId('msg'), createdAt: Date.now(), role: 'user', text };
    const aiId = randomId('msg');
    const pending: PlannerMessage = { id: aiId, createdAt: Date.now(), role: 'ai', text: 'Thinking…' };
    params.store.update((s) => ({ ...s, plannerMessages: [...s.plannerMessages, user, pending].slice(-200) }));

    try {
      let res: any;
      if (mode === 'mv') {
        res = await params.api.geminiMvStoryboard({ requirement: text });
      } else {
        const msgs = params.store.get().plannerMessages
          .filter((m) => m.id !== aiId)
          .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
        res = await params.api.geminiPlanner({ messages: msgs });
      }
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
    void sendMessage('chat');
  });

  sendMv.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void sendMessage('mv');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      void sendMessage('mv');
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void sendMessage('chat');
    }
  });

  input.addEventListener('input', () => autosizeComposer(input));
  autosizeComposer(input);

  clear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm('清空 Planner 对话？');
    if (!ok) return;
    params.store.update((s) => ({ ...s, plannerMessages: [] }));
  });

  render(params.store.get());
  params.store.subscribe((s) => render(s));

  return { sendMessage };
}

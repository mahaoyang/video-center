type AiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
type UiRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: UiRole;
  content: string;
  createdAt: number;
  toolCalls?: string[];
}

interface AiLocalState {
  model: AiModel;
  messages: ChatMessage[];
  draft: string;
}

const STORAGE_KEY = 'mj-workflow:ai-chat:v1';
const DEFAULT_MODEL: AiModel = 'gemini-3-flash-preview';
const MAX_MESSAGES = 120;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

function normalizeModel(raw: unknown): AiModel {
  return raw === 'gemini-3-pro-preview' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
}

function safeParseState(raw: string | null): AiLocalState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const model = normalizeModel((parsed as any).model);
    const draft = typeof (parsed as any).draft === 'string' ? (parsed as any).draft : '';
    const rawMsgs = Array.isArray((parsed as any).messages) ? (parsed as any).messages : [];
    const messages: ChatMessage[] = rawMsgs
      .map((m: any) => ({
        id: String(m?.id || '').trim(),
        role: m?.role === 'assistant' ? 'assistant' : 'user',
        content: String(m?.content || ''),
        createdAt: Number(m?.createdAt) || Date.now(),
        toolCalls: Array.isArray(m?.toolCalls)
          ? m.toolCalls.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 8)
          : undefined,
      }))
      .filter((m: ChatMessage) => Boolean(m.id) && Boolean(m.content.trim()))
      .slice(-MAX_MESSAGES);

    return { model, draft, messages };
  } catch {
    return null;
  }
}

function makeDefaultState(): AiLocalState {
  return { model: DEFAULT_MODEL, messages: [], draft: '' };
}

function loadState(): AiLocalState {
  return safeParseState(localStorage.getItem(STORAGE_KEY)) || makeDefaultState();
}

function saveState(state: AiLocalState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function modelLabel(model: AiModel): string {
  return model === 'gemini-3-pro-preview' ? 'Gemini 3 Pro' : 'Gemini 3 Flash';
}

document.addEventListener('DOMContentLoaded', () => {
  const modelSelect = byId<HTMLSelectElement>('modelSelect');
  const clearBtn = byId<HTMLButtonElement>('clearBtn');
  const sendBtn = byId<HTMLButtonElement>('sendBtn');
  const inputText = byId<HTMLTextAreaElement>('inputText');
  const messagesEl = byId<HTMLDivElement>('messages');
  const statusText = byId<HTMLDivElement>('statusText');

  let state = loadState();
  let busy = false;

  function setStatus(text: string) {
    statusText.textContent = text;
  }

  function setBusy(next: boolean) {
    busy = next;
    sendBtn.disabled = next;
    modelSelect.disabled = next;
    inputText.disabled = next;
    clearBtn.disabled = next;
  }

  function persistAndRender(needScroll = false) {
    saveState(state);
    render(needScroll);
  }

  function appendMessage(role: UiRole, content: string, toolCalls?: string[]) {
    const clean = String(content || '').trim();
    if (!clean) return;
    state.messages.push({
      id: randomId(role === 'user' ? 'u' : 'a'),
      role,
      content: clean,
      createdAt: Date.now(),
      toolCalls:
        Array.isArray(toolCalls) && toolCalls.length
          ? toolCalls.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8)
          : undefined,
    });
    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }
  }

  function render(needScroll = false) {
    modelSelect.value = state.model;
    inputText.value = state.draft;

    messagesEl.innerHTML = '';
    if (!state.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = [
        '开始和 Gemini 对话。',
        '技能由模型在后端自动调度，页面不写死工具调用逻辑。',
        '会话与模型选择会自动保存在浏览器本地。',
      ].join('<br/>');
      messagesEl.appendChild(empty);
    } else {
      for (const msg of state.messages) {
        const row = document.createElement('div');
        row.className = `msg ${msg.role}`;
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
          const meta = document.createElement('div');
          meta.className = 'msg-meta';
          meta.textContent = `技能调用: ${msg.toolCalls.join(', ')}`;
          bubble.appendChild(meta);
        }
        const body = document.createElement('div');
        body.textContent = msg.content;
        bubble.appendChild(body);
        row.appendChild(bubble);
        messagesEl.appendChild(row);
      }
    }

    if (needScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  async function sendMessage() {
    if (busy) return;
    const prompt = String(inputText.value || '').trim();
    if (!prompt) return;

    state.draft = '';
    appendMessage('user', prompt);
    persistAndRender(true);

    const payloadMessages = state.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    setBusy(true);
    setStatus(`正在请求 ${modelLabel(state.model)}...`);

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.model,
          messages: payloadMessages,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.code !== 0) {
        throw new Error(String(data?.description || `请求失败: HTTP ${resp.status}`));
      }

      const text = String(data?.result?.text || '').trim();
      if (!text) throw new Error('模型返回空响应');
      const toolTrace = Array.isArray(data?.result?.toolTrace) ? data.result.toolTrace : [];
      const calledTools: string[] = Array.from(
        new Set(
          toolTrace
            .map((t: any) => String(t?.name || '').trim())
            .filter(Boolean)
        )
      );

      appendMessage('assistant', text, calledTools.length ? calledTools : undefined);

      setStatus(
        calledTools.length
          ? `已完成 · ${modelLabel(state.model)} · 技能=${calledTools.join(',')}`
          : `已完成 · ${modelLabel(state.model)}`
      );
      persistAndRender(true);
    } catch (error) {
      const msg = (error as Error)?.message || '对话失败';
      appendMessage('assistant', `ERROR: ${msg}`);
      setStatus(`失败: ${msg}`);
      persistAndRender(true);
    } finally {
      setBusy(false);
      inputText.focus();
    }
  }

  modelSelect.addEventListener('change', () => {
    state.model = normalizeModel(modelSelect.value);
    saveState(state);
    setStatus(`已切换模型: ${modelLabel(state.model)}`);
  });

  inputText.addEventListener('input', () => {
    state.draft = inputText.value;
    saveState(state);
  });

  inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => {
    void sendMessage();
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('确认清空本地聊天记录？')) return;
    state = { ...makeDefaultState(), model: state.model };
    setStatus('已清空本地会话');
    persistAndRender(true);
    inputText.focus();
  });

  render(true);
  setStatus(`就绪 · ${modelLabel(state.model)}`);
});

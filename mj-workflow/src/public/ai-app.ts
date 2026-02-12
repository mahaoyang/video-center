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

interface SkillMeta {
  name: string;
  title: string;
  description: string;
  keywords?: string[];
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

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function modelLabel(model: AiModel): string {
  return model === 'gemini-3-pro-preview' ? 'Gemini 3 Pro' : 'Gemini 3 Flash';
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

function toPayloadMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  const modelSelect = byId<HTMLSelectElement>('modelSelect');
  const clearBtn = byId<HTMLButtonElement>('clearBtn');
  const sendBtn = byId<HTMLButtonElement>('sendBtn');
  const inputText = byId<HTMLTextAreaElement>('inputText');
  const messagesEl = byId<HTMLDivElement>('messages');
  const statusText = byId<HTMLDivElement>('statusText');
  const skillOverlay = byId<HTMLDivElement>('skillOverlay');
  const skillListEl = byId<HTMLDivElement>('skillList');
  const skillSearchInput = byId<HTMLInputElement>('skillSearchInput');
  const skillCloseBtn = byId<HTMLButtonElement>('skillCloseBtn');

  let state = loadState();
  let busy = false;
  let skillCatalog: SkillMeta[] = [];
  let pickerSkills: SkillMeta[] = [];
  let pickerKeyword = '';
  let pickerTargetAssistantId = '';

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

  function persistAndRender(needScroll = false) {
    saveState(state);
    render(needScroll);
  }

  function renderSkillPicker() {
    const kw = pickerKeyword.trim().toLowerCase();
    const all = pickerSkills.length ? pickerSkills : skillCatalog;
    const filtered = kw
      ? all.filter((s) => {
          const text = [s.name, s.title, s.description, ...(s.keywords || [])].join(' ').toLowerCase();
          return text.includes(kw);
        })
      : all;

    skillListEl.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'skill-empty';
      empty.textContent = '没有匹配技能，换个关键词再试。';
      skillListEl.appendChild(empty);
      return;
    }

    for (const skill of filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skill-item';
      btn.innerHTML = `<strong>${skill.title} (${skill.name})</strong><span>${skill.description}</span>`;
      btn.addEventListener('click', () => {
        void forceRerunWithSkill(skill.name, pickerTargetAssistantId);
      });
      skillListEl.appendChild(btn);
    }
  }

  function openSkillPicker(skills: SkillMeta[], targetAssistantId: string) {
    pickerSkills = skills;
    pickerKeyword = '';
    pickerTargetAssistantId = targetAssistantId;
    skillSearchInput.value = '';
    renderSkillPicker();
    skillOverlay.classList.add('open');
  }

  function closeSkillPicker() {
    skillOverlay.classList.remove('open');
    pickerSkills = [];
    pickerKeyword = '';
    pickerTargetAssistantId = '';
    skillSearchInput.value = '';
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
        '每条 AI 回复后可点“技能”按钮，自动筛选技能并可强制技能重跑。',
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

        if (msg.role === 'assistant') {
          const actions = document.createElement('div');
          actions.className = 'msg-actions';
          const skillBtn = document.createElement('button');
          skillBtn.type = 'button';
          skillBtn.className = 'mini-btn';
          skillBtn.textContent = '技能';
          skillBtn.disabled = busy;
          skillBtn.addEventListener('click', () => {
            void handleSkillButton(msg.id);
          });
          actions.appendChild(skillBtn);
          bubble.appendChild(actions);
        }

        row.appendChild(bubble);
        messagesEl.appendChild(row);
      }
    }

    if (needScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  async function requestAiChat(params: {
    messages: Array<{ role: string; content: string }>;
    forceSkill?: string;
    skillPromptHint?: string;
  }): Promise<{ text: string; calledTools: string[] }> {
    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: state.model,
        messages: params.messages,
        forceSkill: params.forceSkill || undefined,
        skillPromptHint: params.skillPromptHint || undefined,
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
    return { text, calledTools };
  }

  function findConversationAnchorForAssistant(assistantId: string): { userText: string; replay: ChatMessage[] } {
    const idx = state.messages.findIndex((m) => m.id === assistantId && m.role === 'assistant');
    if (idx < 0) return { userText: '', replay: state.messages.slice() };

    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (state.messages[i]?.role === 'user') {
        userIdx = i;
        break;
      }
    }

    if (userIdx < 0) {
      return { userText: '', replay: state.messages.slice(0, idx) };
    }

    return {
      userText: state.messages[userIdx]?.content || '',
      replay: state.messages.slice(0, userIdx + 1),
    };
  }

  async function forceRerunWithSkill(skillName: string, assistantId: string) {
    if (busy) return;
    closeSkillPicker();

    const anchor = findConversationAnchorForAssistant(assistantId);
    const replay = anchor.replay.length ? anchor.replay : state.messages.slice();
    const payload = toPayloadMessages(replay);

    setBusy(true);
    setStatus(`强制技能重跑: ${skillName} · ${modelLabel(state.model)}...`);
    try {
      const out = await requestAiChat({
        messages: payload,
        forceSkill: skillName,
        skillPromptHint: 'User clicked skill rerun button; prioritize this selected skill.',
      });
      appendMessage('assistant', `【技能重跑:${skillName}】\n${out.text}`, out.calledTools.length ? out.calledTools : undefined);
      setStatus(
        out.calledTools.length
          ? `重跑完成 · ${modelLabel(state.model)} · 技能=${out.calledTools.join(',')}`
          : `重跑完成 · ${modelLabel(state.model)}`
      );
      persistAndRender(true);
    } catch (error) {
      const msg = (error as Error)?.message || '技能重跑失败';
      appendMessage('assistant', `ERROR: ${msg}`);
      setStatus(`失败: ${msg}`);
      persistAndRender(true);
    } finally {
      setBusy(false);
      inputText.focus();
    }
  }

  async function handleSkillButton(assistantId: string) {
    if (busy) return;
    const target = state.messages.find((m) => m.id === assistantId && m.role === 'assistant');
    if (!target) return;
    const anchor = findConversationAnchorForAssistant(assistantId);
    const query = `${anchor.userText}\n${target.content}`.trim();

    setStatus('正在用 AI 筛选技能...');
    try {
      const resp = await fetch('/api/ai/skills/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.model,
          query,
          userText: anchor.userText,
          assistantText: target.content,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.code !== 0) {
        throw new Error(String(data?.description || `请求失败: HTTP ${resp.status}`));
      }

      const suggested: SkillMeta[] = Array.isArray(data?.result?.skills)
        ? data.result.skills
            .map((s: any) => ({
              name: String(s?.name || '').trim(),
              title: String(s?.title || s?.name || '').trim(),
              description: String(s?.description || '').trim(),
              keywords: Array.isArray(s?.keywords) ? s.keywords.map((k: any) => String(k || '').trim()).filter(Boolean) : [],
            }))
            .filter((s: SkillMeta) => Boolean(s.name))
        : [];

      const candidate = suggested.length ? suggested : skillCatalog;
      if (!candidate.length) {
        setStatus('没有可用技能');
        return;
      }

      if (candidate.length === 1) {
        setStatus(`筛选到单技能: ${candidate[0]!.name}，开始强制重跑...`);
        await forceRerunWithSkill(candidate[0]!.name, assistantId);
        return;
      }

      setStatus(`筛选到 ${candidate.length} 个技能，请选择`);
      openSkillPicker(candidate, assistantId);
    } catch (error) {
      const msg = (error as Error)?.message || '技能筛选失败';
      setStatus(`失败: ${msg}`);
    }
  }

  async function sendMessage() {
    if (busy) return;
    const prompt = String(inputText.value || '').trim();
    if (!prompt) return;

    state.draft = '';
    appendMessage('user', prompt);
    persistAndRender(true);

    setBusy(true);
    setStatus(`正在请求 ${modelLabel(state.model)}...`);
    try {
      const out = await requestAiChat({ messages: toPayloadMessages(state.messages) });
      appendMessage('assistant', out.text, out.calledTools.length ? out.calledTools : undefined);
      setStatus(
        out.calledTools.length
          ? `已完成 · ${modelLabel(state.model)} · 技能=${out.calledTools.join(',')}`
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

  async function loadSkillCatalog() {
    try {
      const resp = await fetch('/api/ai/skills');
      const data = await resp.json();
      if (!resp.ok || data?.code !== 0) throw new Error(String(data?.description || `请求失败: HTTP ${resp.status}`));
      skillCatalog = Array.isArray(data?.result?.skills)
        ? data.result.skills
            .map((s: any) => ({
              name: String(s?.name || '').trim(),
              title: String(s?.title || s?.name || '').trim(),
              description: String(s?.description || '').trim(),
              keywords: Array.isArray(s?.keywords) ? s.keywords.map((k: any) => String(k || '').trim()).filter(Boolean) : [],
            }))
            .filter((s: SkillMeta) => Boolean(s.name))
        : [];
    } catch (error) {
      console.error('load skill catalog failed:', error);
      skillCatalog = [];
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

  skillCloseBtn.addEventListener('click', () => {
    closeSkillPicker();
  });

  skillOverlay.addEventListener('click', (e) => {
    if (e.target === skillOverlay) closeSkillPicker();
  });

  skillSearchInput.addEventListener('input', () => {
    pickerKeyword = skillSearchInput.value || '';
    renderSkillPicker();
  });

  render(true);
  setStatus(`就绪 · ${modelLabel(state.model)}`);
  void loadSkillCatalog();
});

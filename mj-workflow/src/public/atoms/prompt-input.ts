import { byId } from './ui';

export function setPromptInput(text: string) {
  const input = byId<HTMLTextAreaElement>('promptInput');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}


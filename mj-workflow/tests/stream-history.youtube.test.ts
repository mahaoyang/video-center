import { expect, test } from 'bun:test';
import { youtubeReconcileSignature } from '../src/public/blocks/stream-history';

test('youtubeReconcileSignature changes when YouTube result completes', () => {
  const pending = {
    kind: 'youtube',
    role: 'ai',
    progress: 1,
    error: '',
    text: '生成中…',
    userPrompt: '主题：x',
    inputImageUrls: ['a', 'b'],
  } as any;

  const done = {
    ...pending,
    progress: 100,
    text: 'TITLE:\nHello\n\nDESCRIPTION:\nWorld',
  } as any;

  expect(youtubeReconcileSignature(pending)).not.toBe(youtubeReconcileSignature(done));
});

test('youtubeReconcileSignature changes when YouTube input changes', () => {
  const m1 = {
    kind: 'youtube',
    role: 'ai',
    progress: 1,
    error: '',
    text: '生成中…',
    userPrompt: '主题：x',
    inputImageUrls: ['a'],
  } as any;

  const m2 = { ...m1, userPrompt: '主题：y' } as any;
  const m3 = { ...m1, inputImageUrls: ['b'] } as any;

  expect(youtubeReconcileSignature(m1)).not.toBe(youtubeReconcileSignature(m2));
  expect(youtubeReconcileSignature(m1)).not.toBe(youtubeReconcileSignature(m3));
});


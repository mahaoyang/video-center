import { randomId } from '../../atoms/id';
import { showError } from '../../atoms/notify';
import type { MvComposeCtx, MvComposeParams, MvRecipeMode } from './types';
import { addOutputVideoAsset, buildMvComposePayload } from './state';

function stopPolling(ctx: MvComposeCtx, taskId: string) {
  ctx.pollers.get(taskId)?.stop();
}

function startPollingTask(ctx: MvComposeCtx, params: { taskId: string; messageId: string; outputUrl?: string }) {
  const taskId = String(params.taskId || '').trim();
  if (!taskId) return;
  if (ctx.pollers.has(taskId)) return;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    ctx.pollers.delete(taskId);
  };
  ctx.pollers.set(taskId, { stop });

  const loop = async () => {
    while (!stopped) {
      const st = await ctx.api.mediaTask({ taskId });
      const status = st?.result;
      const rawStatus = String(status?.status || '');
      const p = Math.max(0, Math.min(100, Number.isFinite(status?.progress) ? status.progress : 0));

      ctx.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) => (m.id === params.messageId ? { ...m, progress: p } : m)),
      }));

      if (rawStatus === 'finished') {
        ctx.store.update((s) => ({
          ...s,
          streamMessages: s.streamMessages.map((m) => (m.id === params.messageId ? { ...m, progress: 100 } : m)),
        }));
        if (typeof params.outputUrl === 'string' && params.outputUrl.trim()) addOutputVideoAsset(ctx.store, params.outputUrl);
        stop();
        return;
      }
      if (rawStatus === 'failed') {
        const err = String(status?.error || status?.message || '合成失败');
        ctx.store.update((s) => ({
          ...s,
          streamMessages: s.streamMessages.map((m) => (m.id === params.messageId ? { ...m, error: err } : m)),
        }));
        stop();
        return;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  };

  void loop().catch((error) => {
    console.error('MV poll failed:', error);
    stop();
  });
}

export function createMvComposeActions(ctx: MvComposeCtx) {
  async function submitWith(params: { built: ReturnType<typeof buildMvComposePayload>; payload: MvComposeParams; startPolling: boolean }) {
    const built = params.built;
    const payload = params.payload;

    const aiMsgId = randomId('msg');
    const parentMessageId = ctx.store.get().traceHeadMessageId;
    const effectiveAction = payload.action === 'clip' ? 'clip' : 'mv';
    const effectiveSubtitleMode = payload.subtitleMode === 'burn' ? 'burn' : 'soft';
    const effectiveVideoUrl = typeof payload.videoUrl === 'string' && payload.videoUrl.trim() ? payload.videoUrl.trim() : undefined;
    const effectiveAudioUrl = typeof payload.audioUrl === 'string' && payload.audioUrl.trim() ? payload.audioUrl.trim() : undefined;
    const effectiveHasVisuals = Array.isArray(payload.visualSequence) && payload.visualSequence.length > 0;

    ctx.store.update((s) => ({
      ...s,
      traceHeadMessageId: aiMsgId,
      streamMessages: [
        ...s.streamMessages,
        {
          id: aiMsgId,
          createdAt: Date.now(),
          role: 'ai',
          kind: 'video',
          provider: 'mv',
          text: built.text,
          parentMessageId: typeof parentMessageId === 'string' ? parentMessageId : undefined,
          progress: 0,
          mvResolution: s.mvResolution,
          mvFps: s.mvFps,
          mvDurationSeconds: s.mvDurationSeconds,
          mvSubtitleMode: effectiveSubtitleMode,
          mvSequence: effectiveHasVisuals ? built.selectedRefIds.slice(0, 24).map((refId) => ({ refId })) : [],
          mvVideoUrl: effectiveVideoUrl,
          mvAudioUrl: effectiveAudioUrl,
          mvSubtitleSrt: typeof payload.subtitleSrt === 'string' && payload.subtitleSrt.trim() ? payload.subtitleSrt.trim().slice(0, 50_000) : undefined,
          mvAction: effectiveAction,
          inputImageUrls: built.inputImageUrls,
        },
      ].slice(-200),
    }));

    try {
      const created = await ctx.api.mvCompose(payload);
      if (created?.code !== 0) throw new Error(created?.description || 'MV 合成提交失败');
      const taskId = String(created?.result?.taskId || '').trim();
      const outputUrl = String(created?.result?.outputUrl || '').trim();
      if (!taskId || !outputUrl) throw new Error('MV 合成提交失败：缺少 taskId/outputUrl');

      ctx.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, taskId, videoUrl: outputUrl, progress: 0 } : m)),
      }));

      if (params.startPolling) {
        startPollingTask(ctx, { taskId, messageId: aiMsgId, outputUrl });
      } else {
        stopPolling(ctx, taskId);
      }
      return { taskId, outputUrl, messageId: aiMsgId };
    } catch (error) {
      console.error('MV submit failed:', error);
      const msg = (error as Error)?.message || 'MV 合成失败';
      showError(msg);
      ctx.store.update((s) => ({
        ...s,
        streamMessages: s.streamMessages.map((m) => (m.id === aiMsgId ? { ...m, error: msg } : m)),
      }));
      return null;
    }
  }

  async function cook(recipe: MvRecipeMode) {
    try {
      const built = buildMvComposePayload({ store: ctx.store, promptInput: ctx.dom.promptInput });
      const payload: MvComposeParams = { ...built.payload };

      if (recipe === 'mv-images') {
        if (!built.selectedRefIds.length) throw new Error('图片→视频 需要先在上方素材区选择至少 1 张图片');
        payload.action = 'clip';
        payload.videoUrl = undefined;
        payload.audioUrl = undefined;
        payload.subtitleSrt = undefined;
        payload.subtitleMode = undefined;
      } else if (recipe === 'mv-clip') {
        if (!payload.videoUrl || !String(payload.videoUrl).trim()) throw new Error('视频剪辑需要先选择一个视频素材');
        payload.action = 'clip';
        payload.audioUrl = undefined;
        payload.subtitleSrt = undefined;
        payload.subtitleMode = undefined;
        payload.visualSequence = [];
      } else if (recipe === 'mv-subtitle') {
        const srt = String(built.subtitleAsset?.text || '').trim();
        if (!srt) throw new Error('加字幕需要先在上方素材区选择一个 SRT 字幕素材');
        if (!payload.videoUrl || !String(payload.videoUrl).trim()) throw new Error('加字幕需要先选择一个视频素材');
        payload.action = 'mv';
        payload.subtitleMode = payload.subtitleMode === 'burn' ? 'burn' : 'soft';
        payload.subtitleSrt = srt;
        payload.durationSeconds = undefined;
        payload.fps = undefined;
        payload.visualSequence = [];
      } else {
        payload.action = 'mv';
        // mv-mix: if images are selected, treat as image-sequence MV (ignore videoUrl);
        // otherwise treat as video mix (do not trim by default).
        if (built.selectedRefIds.length > 0) {
          payload.videoUrl = undefined;
        } else {
          payload.visualSequence = [];
          payload.durationSeconds = undefined;
          payload.fps = undefined;
        }
      }

      await submitWith({ built, payload, startPolling: true });
    } catch (error) {
      showError((error as Error)?.message || 'MV 合成失败');
    }
  }

  return { cook };
}

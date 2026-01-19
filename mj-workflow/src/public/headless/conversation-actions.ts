import type { WorkflowState } from '../state/workflow';

function uniqTail(values: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.slice(-max);
}

function sanitizeTraceAfterMessageRemoval(state: WorkflowState): WorkflowState {
  const ids = new Set((state.streamMessages || []).map((m) => m.id));

  const traceTarget = state.traceTarget?.type === 'message' && !ids.has(state.traceTarget.id) ? undefined : state.traceTarget;
  const traceHeadMessageId =
    state.traceHeadMessageId && !ids.has(state.traceHeadMessageId) ? (state.streamMessages.at(-1)?.id || undefined) : state.traceHeadMessageId;

  return traceTarget === state.traceTarget && traceHeadMessageId === state.traceHeadMessageId ? state : { ...state, traceTarget, traceHeadMessageId };
}

export function hideStreamMessageUiOnly(state: WorkflowState, messageId: string): WorkflowState {
  const id = String(messageId || '').trim();
  if (!id) return state;
  return {
    ...state,
    desktopHiddenStreamMessageIds: uniqTail([...(state.desktopHiddenStreamMessageIds || []), id], 400),
  };
}

export function hidePlannerMessageUiOnly(state: WorkflowState, messageId: string): WorkflowState {
  const id = String(messageId || '').trim();
  if (!id) return state;
  return {
    ...state,
    desktopHiddenPlannerMessageIds: uniqTail([...(state.desktopHiddenPlannerMessageIds || []), id], 400),
  };
}

export function hideAllStreamMessagesUiOnly(state: WorkflowState): WorkflowState {
  const allIds = (state.streamMessages || []).map((m) => m.id);
  return { ...state, desktopHiddenStreamMessageIds: uniqTail(allIds, 400) };
}

export function deleteVaultMessage(state: WorkflowState, messageId: string): WorkflowState {
  const id = String(messageId || '').trim();
  if (!id) return state;
  const next: WorkflowState = {
    ...state,
    streamMessages: (state.streamMessages || []).filter((m) => m.id !== id),
    desktopHiddenStreamMessageIds: (state.desktopHiddenStreamMessageIds || []).filter((x) => x !== id),
  };
  return sanitizeTraceAfterMessageRemoval(next);
}

export function clearVaultMessages(state: WorkflowState): WorkflowState {
  const next: WorkflowState = { ...state, streamMessages: [], desktopHiddenStreamMessageIds: [] };
  return sanitizeTraceAfterMessageRemoval(next);
}


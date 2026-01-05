export function getUpstreamErrorMessage(payload: any): string | null {
  const err = payload?.error;
  if (err?.message_zh || err?.message) return String(err.message_zh || err.message);
  const code = payload?.code;
  if (typeof code === 'number' && code !== 0 && code !== 1) {
    if (typeof payload?.description === 'string' && payload.description) return payload.description;
    return '上游接口返回错误';
  }
  return null;
}

export function getSubmitTaskId(payload: any): string | null {
  const result = payload?.result;
  if (typeof result === 'string' || typeof result === 'number') return String(result);
  if (typeof result?.taskId === 'string' || typeof result?.taskId === 'number') return String(result.taskId);
  if (typeof payload?.taskId === 'string' || typeof payload?.taskId === 'number') return String(payload.taskId);
  return null;
}


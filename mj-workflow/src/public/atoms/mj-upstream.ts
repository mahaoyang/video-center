function unwrapJsonString(value: unknown, maxDepth = 2): any {
  let cur: any = value;
  for (let i = 0; i < maxDepth; i++) {
    if (typeof cur !== 'string') break;
    const text = cur.replace(/\uFEFF/g, '').trim();
    if (!(text.startsWith('{') || text.startsWith('['))) break;
    try {
      cur = JSON.parse(text);
    } catch {
      break;
    }
  }
  if (cur && typeof cur === 'object') {
    const result = (cur as any).result;
    const props = (cur as any).properties;
    const unwrappedResult = unwrapJsonString(result, 1);
    const unwrappedProps = unwrapJsonString(props, 1);
    if (unwrappedResult !== result || unwrappedProps !== props) {
      return { ...(cur as any), result: unwrappedResult, properties: unwrappedProps };
    }
  }
  return cur;
}

export function getUpstreamErrorMessage(payload: any): string | null {
  const p = unwrapJsonString(payload);
  const err = (p as any)?.error;
  if (err?.message_zh || err?.message) return String(err.message_zh || err.message);
  const code = (p as any)?.code;
  if (typeof code === 'number' && code !== 0 && code !== 1) {
    if (typeof (p as any)?.description === 'string' && (p as any).description) return (p as any).description;
    return '上游接口返回错误';
  }
  return null;
}

export function getSubmitTaskId(payload: any): string | null {
  const p = unwrapJsonString(payload);
  const result = (p as any)?.result;
  if (typeof result === 'string' || typeof result === 'number') return String(result);
  if (typeof result?.taskId === 'string' || typeof result?.taskId === 'number') return String(result.taskId);
  if (typeof (p as any)?.taskId === 'string' || typeof (p as any)?.taskId === 'number') return String((p as any).taskId);
  return null;
}

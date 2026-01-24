function unwrapJsonString(value: unknown, maxDepth = 2): any {
  let cur: any = value;
  for (let i = 0; i < maxDepth; i++) {
    if (typeof cur !== 'string') break;
    const raw = cur.replace(/\uFEFF/g, '').trim();
    if (!raw) break;

    const tryParse = (text: string) => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    };

    let parsed: any | undefined;
    if (raw.startsWith('{') || raw.startsWith('[')) {
      parsed = tryParse(raw);
    } else {
      const firstBrace = raw.indexOf('{');
      const firstBracket = raw.indexOf('[');
      const start =
        firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
      if (start !== -1) parsed = tryParse(raw.slice(start));
    }

    if (parsed === undefined) break;
    cur = parsed;
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

  const type = (p as any)?.type;
  if (typeof type === 'string' && /error/i.test(type)) {
    const desc = typeof (p as any)?.description === 'string' ? (p as any).description.trim() : '';
    return desc || `上游接口返回错误（${type}）`;
  }

  const code = (p as any)?.code;
  if (typeof code === 'number' && code !== 0 && code !== 1) {
    if (typeof (p as any)?.description === 'string' && (p as any).description) return (p as any).description;
    return '上游接口返回错误';
  }
  return null;
}

export function getSubmitTaskId(payload: any): string | null {
  const p = unwrapJsonString(payload);

  const asId = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const s = value.trim();
      return s ? s : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };

  const pickIdFromObj = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    return (
      asId(obj.taskId) ||
      asId(obj.task_id) ||
      asId(obj.taskID) ||
      asId(obj.id) ||
      asId(obj.jobId) ||
      asId(obj.job_id)
    );
  };

  if (typeof p === 'string') {
    const raw = p.replace(/\uFEFF/g, '').trim();
    const m =
      raw.match(/"result"\s*:\s*"([^"]+)"/) ||
      raw.match(/"taskId"\s*:\s*"([^"]+)"/) ||
      raw.match(/"task_id"\s*:\s*"([^"]+)"/) ||
      raw.match(/"id"\s*:\s*"([^"]+)"/) ||
      raw.match(/"result"\s*:\s*(\d+)/) ||
      raw.match(/"taskId"\s*:\s*(\d+)/) ||
      raw.match(/"task_id"\s*:\s*(\d+)/) ||
      raw.match(/"id"\s*:\s*(\d+)/);
    if (m?.[1]) return String(m[1]);
  }
  const result = (p as any)?.result;
  const scalar = asId(result);
  if (scalar) return scalar;

  return (
    pickIdFromObj(result) ||
    pickIdFromObj(result?.result) ||
    pickIdFromObj(result?.data) ||
    pickIdFromObj(result?.properties) ||
    pickIdFromObj((p as any)?.data) ||
    pickIdFromObj((p as any)?.properties) ||
    pickIdFromObj(p) ||
    null
  );
}

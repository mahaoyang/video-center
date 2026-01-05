export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function jsonError(params: {
  status: number;
  code?: number;
  description: string;
  error?: unknown;
}): Response {
  const toJsonSafe = (value: unknown) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return value;
  };

  return json(
    {
      code: params.code ?? -1,
      description: params.description,
      error: params.error === undefined ? undefined : toJsonSafe(params.error),
    },
    { status: params.status }
  );
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch (error) {
    throw new Error(`JSON 解析失败: ${String(error)}`);
  }
}

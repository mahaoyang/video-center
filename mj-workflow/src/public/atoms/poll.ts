export async function poll<T>(params: {
  intervalMs: number;
  maxAttempts: number;
  run: (attempt: number) => Promise<{ done: boolean; value?: T }>;
}): Promise<T> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= params.maxAttempts; attempt++) {
    const { done, value } = await params.run(attempt);
    if (done) return value as T;
    await sleep(params.intervalMs);
  }

  throw new Error('任务超时');
}


type Json = Record<string, any>;

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s ? s : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isUpstreamError(payload: any): boolean {
  const type = pickString(payload?.type);
  if (type && /error/i.test(type)) return true;
  const code = pickNumber(payload?.code);
  if (typeof code === 'number' && code !== 0 && code !== 1) return true;
  return false;
}

function describeError(payload: any): string {
  const desc = pickString(payload?.description);
  if (desc) return desc;
  const err = payload?.error;
  if (pickString(err?.message_zh)) return String(err.message_zh);
  if (pickString(err?.message)) return String(err.message);
  return '上游接口返回错误';
}

function extractTaskId(payload: any): string | undefined {
  const result = payload?.result;
  if (typeof result === 'string') return pickString(result);
  if (typeof result === 'number' && Number.isFinite(result)) return String(result);
  return (
    pickString(result?.taskId) ||
    pickString(result?.task_id) ||
    pickString(result?.id) ||
    pickString(payload?.taskId) ||
    pickString(payload?.task_id) ||
    pickString(payload?.id)
  );
}

function extractImageUrl(taskPayload: any): string | undefined {
  const p = taskPayload;
  return (
    pickString(p?.imageUrl) ||
    pickString(p?.image_url) ||
    pickString(p?.result?.imageUrl) ||
    pickString(p?.result?.image_url) ||
    pickString(p?.properties?.imageUrl) ||
    pickString(p?.properties?.image_url) ||
    pickString(p?.result?.properties?.imageUrl) ||
    pickString(p?.result?.properties?.image_url)
  );
}

function extractStatus(taskPayload: any): string {
  const s =
    pickString(taskPayload?.status) ||
    pickString(taskPayload?.result?.status) ||
    pickString(taskPayload?.properties?.status) ||
    pickString(taskPayload?.result?.properties?.status) ||
    '';
  return s || 'PROCESSING';
}

function extractProgress(taskPayload: any): number | undefined {
  return (
    pickNumber(taskPayload?.progress) ||
    pickNumber(taskPayload?.result?.progress) ||
    pickNumber(taskPayload?.properties?.progress) ||
    pickNumber(taskPayload?.result?.properties?.progress)
  );
}

async function requestJson(method: string, url: string, body?: Json): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: -1, type: 'client_error', description: `Non-JSON response (${res.status}): ${text.slice(0, 200)}` };
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollTask(baseUrl: string, taskId: string): Promise<{ imageUrl: string; raw: any }> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.MJFLOW_TIMEOUT_MS || 6 * 60_000);
  while (true) {
    const task = await requestJson('GET', `${baseUrl}/api/task/${encodeURIComponent(taskId)}`);
    if (isUpstreamError(task)) throw new Error(`task query failed: ${describeError(task)} (${JSON.stringify(task)})`);

    const imageUrl = extractImageUrl(task);
    const status = extractStatus(task);
    const progress = extractProgress(task);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r[task ${taskId}] status=${status} progress=${progress ?? '-'} elapsed=${elapsed}s`.padEnd(80)
    );

    if (imageUrl) {
      process.stdout.write('\n');
      return { imageUrl, raw: task };
    }
    if (Date.now() - startedAt > timeoutMs) {
      process.stdout.write('\n');
      throw new Error(`timeout waiting for imageUrl (status=${status})`);
    }
    await sleep(2000);
  }
}

async function main() {
  const baseUrl = pickString(process.env.MJFLOW_BASE_URL) || 'http://localhost:3015';
  const prompt =
    pickString(process.env.MJFLOW_PROMPT) ||
    'a cute corgi in a studio photo, cinematic lighting, ultra detailed';
  const index = pickNumber(process.env.MJFLOW_UPSCALE_INDEX) || 1;

  console.log(`[mjflow] baseUrl=${baseUrl}`);
  console.log(`[mjflow] imagine prompt=${JSON.stringify(prompt)}`);

  const imagine = await requestJson('POST', `${baseUrl}/api/imagine`, { prompt });
  if (isUpstreamError(imagine)) throw new Error(`imagine failed: ${describeError(imagine)} (${JSON.stringify(imagine)})`);

  const taskId = extractTaskId(imagine);
  if (!taskId) throw new Error(`imagine: missing taskId (${JSON.stringify(imagine)})`);
  console.log(`[mjflow] imagine taskId=${taskId}`);

  const grid = await pollTask(baseUrl, taskId);
  console.log(`[mjflow] grid imageUrl=${grid.imageUrl}`);

  console.log(`[mjflow] upscale index=${index}`);
  const upscale = await requestJson('POST', `${baseUrl}/api/upscale`, { taskId, index });
  if (isUpstreamError(upscale)) throw new Error(`upscale failed: ${describeError(upscale)} (${JSON.stringify(upscale)})`);

  const upscaleTaskId = extractTaskId(upscale);
  if (!upscaleTaskId) throw new Error(`upscale: missing taskId (${JSON.stringify(upscale)})`);
  console.log(`[mjflow] upscale taskId=${upscaleTaskId}`);

  const upscaled = await pollTask(baseUrl, upscaleTaskId);
  console.log(`[mjflow] upscaled imageUrl=${upscaled.imageUrl}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

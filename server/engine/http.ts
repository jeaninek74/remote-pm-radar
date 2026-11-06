import { REFRESH, USER_AGENT } from '../config';

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url: string, timeoutMs: number, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON with one retry. Throws HttpError with a short, loggable message. */
export async function fetchJson<T = unknown>(url: string, timeoutMs = REFRESH.timeoutMs): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request(url, timeoutMs, 'application/json');
      if (res.status === 404) throw new HttpError('Not found (404)', 404);
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err as Error;
      if ((lastError as HttpError).status === 404) break;
      if (attempt === 0) await sleep(400);
    }
  }
  throw lastError ?? new HttpError('Unknown fetch failure');
}

export async function fetchText(url: string, timeoutMs = REFRESH.timeoutMs): Promise<string> {
  const res = await request(url, timeoutMs, 'text/html,application/xhtml+xml');
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
  return res.text();
}

/** Lightweight reachability check used to verify application links. */
export async function checkLink(url: string): Promise<{ ok: boolean; status: number; finalUrl: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    });
    // Some ATS return 403 to non-browser clients while the page is still live for humans.
    const ok = res.ok || res.status === 403;
    return { ok, status: res.status, finalUrl: res.url };
  } catch (err) {
    return { ok: false, status: 0, finalUrl: url, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded-concurrency map, preserving result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(Math.max(limit, 1), items.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

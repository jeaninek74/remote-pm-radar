import { request as httpsRequestRaw } from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable, Transform } from 'node:stream';
import { REFRESH, USER_AGENT } from '../config';

const HTTPS_RESPONSE_MAX_BYTES = 20 * 1024 * 1024;

export interface HttpsRequestOptions {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Buffer | Uint8Array;
  timeoutMs?: number;
}

export interface HttpsResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

function decompressor(encoding: string): Transform | null {
  switch (encoding) {
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'br':
      return createBrotliDecompress();
    case 'deflate':
      return createInflate();
    default:
      throw new Error(`Unsupported HTTPS content encoding: ${encoding}`);
  }
}

export function httpsRequest(url: string | URL, options: HttpsRequestOptions = {}): Promise<HttpsResponse> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy(error);
      reject(error);
    };
    const finishResponse = (response: HttpsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };

    const request = httpsRequestRaw(
      url,
      { method: options.method ?? 'GET', headers: options.headers },
      (response) => {
        response.on('error', finishError);
        response.on('aborted', () => finishError(new Error('HTTPS response aborted')));

        let bodyStream: Readable = response;
        const contentEncoding = response.headers['content-encoding'];
        const encodings = (Array.isArray(contentEncoding) ? contentEncoding.join(',') : contentEncoding ?? '')
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
          .reverse();
        try {
          for (const encoding of encodings) {
            const decoder = decompressor(encoding);
            if (!decoder) continue;
            decoder.on('error', finishError);
            bodyStream = bodyStream.pipe(decoder);
          }
        } catch (error) {
          const encodingError = error as Error;
          finishError(encodingError);
          return;
        }

        const chunks: Buffer[] = [];
        let bytesRead = 0;
        bodyStream.on('data', (chunk: Buffer | string) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesRead += buffer.length;
          if (bytesRead > HTTPS_RESPONSE_MAX_BYTES) {
            const sizeError = new Error(`HTTPS response exceeds ${HTTPS_RESPONSE_MAX_BYTES} byte limit`);
            finishError(sizeError);
            bodyStream.destroy();
            return;
          }
          chunks.push(buffer);
        });
        bodyStream.on('error', finishError);
        bodyStream.on('end', () => finishResponse({
          status: response.statusCode ?? 0,
          headers: response.headers,
          text: Buffer.concat(chunks, bytesRead).toString('utf8'),
        }));
      },
    );
    request.on('error', finishError);
    timer = setTimeout(() => {
      const timeoutError = new Error(`HTTPS request timeout after ${timeoutMs}ms`);
      finishError(timeoutError);
    }, timeoutMs);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const HOST_CONCURRENCY: Record<string, number> = { 'boards-api.greenhouse.io': 4 };
const hostSemaphores = new Map<string, { active: number; waiters: Array<() => void> }>();

export function setHostConcurrencyLimit(hostname: string, limit: number | null): void {
  const host = hostname.toLowerCase();
  if (limit === null) {
    delete HOST_CONCURRENCY[host];
    return;
  }
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Host concurrency limit must be a positive integer');
  HOST_CONCURRENCY[host] = limit;
}

async function acquireHostSlot(hostname: string): Promise<() => void> {
  const limit = HOST_CONCURRENCY[hostname];
  if (limit === undefined) return () => {};

  let semaphore = hostSemaphores.get(hostname);
  if (!semaphore) {
    semaphore = { active: 0, waiters: [] };
    hostSemaphores.set(hostname, semaphore);
  }
  if (semaphore.active < limit) {
    semaphore.active += 1;
  } else {
    await new Promise<void>((resolve) => semaphore!.waiters.push(resolve));
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = semaphore!.waiters.shift();
    if (next) next();
    else semaphore!.active -= 1;
  };
}

async function request(
  url: string,
  timeoutMs: number,
  accept: string,
): Promise<{ response: Response; release: () => void }> {
  const hostname = new URL(url).hostname.toLowerCase();
  const releaseHostSlot = await acquireHostSlot(hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    releaseHostSlot();
  };
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return { response, release };
  } catch (error) {
    release();
    throw error;
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('Retry-After');
  const retryAfterSeconds = retryAfter?.trim();
  if (retryAfterSeconds) {
    const seconds = Number(retryAfterSeconds);
    if (Number.isFinite(seconds)) return Math.min(20_000, Math.max(0, seconds * 1000));
  }
  const backoff = [2_000, 5_000, 10_000][Math.min(attempt, 2)];
  return backoff + Math.floor(Math.random() * 501);
}

function discardResponseBody(response: Response): void {
  if (response.body) void response.body.cancel().catch(() => undefined);
}

/** GET JSON with status-aware retries. Throws HttpError with a short, loggable message. */
export async function fetchJson<T = unknown>(url: string, timeoutMs = REFRESH.timeoutMs): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let retryDelay: number | null = null;
    try {
      const { response: res, release } = await request(url, timeoutMs, 'application/json');
      try {
        if (res.status === 404) {
          discardResponseBody(res);
          throw new HttpError('Not found (404)', 404);
        }
        if (res.status === 429 || res.status === 503) {
          retryDelay = retryDelayMs(res, attempt);
          discardResponseBody(res);
          throw new HttpError(`HTTP ${res.status}`, res.status);
        }
        if (!res.ok) {
          discardResponseBody(res);
          throw new HttpError(`HTTP ${res.status}`, res.status);
        }
        return (await res.json()) as T;
      } finally {
        release();
      }
    } catch (err) {
      lastError = err as Error;
      const status = (lastError as HttpError).status;
      if (status === 404) break;
      if (status === 429 || status === 503) {
        if (attempt === 3) break;
        await sleep(retryDelay ?? [2_000, 5_000, 10_000][attempt] + Math.floor(Math.random() * 501));
      } else if (attempt === 0) {
        await sleep(400);
      } else {
        break;
      }
    }
  }
  throw lastError ?? new HttpError('Unknown fetch failure');
}

export async function fetchText(url: string, timeoutMs = REFRESH.timeoutMs): Promise<string> {
  const { response: res, release } = await request(url, timeoutMs, 'text/html,application/xhtml+xml');
  try {
    if (!res.ok) {
      discardResponseBody(res);
      throw new HttpError(`HTTP ${res.status}`, res.status);
    }
    return await res.text();
  } finally {
    release();
  }
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

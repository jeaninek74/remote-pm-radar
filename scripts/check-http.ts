import { createServer } from 'node:http';
import {
  fetchJson,
  fetchText,
  fetchTextWithHttpsFallback,
  getHttpsFallbackMetrics,
  HttpError,
  resetHttpsFallbackMetrics,
  setHostConcurrencyLimit,
} from '../server/engine/http';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

async function main(): Promise<void> {
  let retryAfterRequests = 0;
  let exhaustedRequests = 0;
  let notFoundRequests = 0;
  let forbiddenTextRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let stalledBodyRequests = 0;
  let stalledTextRequests = 0;
  let delayedBodyRequests = 0;
  let markStallStarted: () => void = () => {};
  const stallStarted = new Promise<void>((resolve) => { markStallStarted = resolve; });

  const server = createServer((req, res) => {
    if (req.url === '/retry-after') {
      retryAfterRequests += 1;
      if (retryAfterRequests === 1) {
        res.writeHead(429, { 'Retry-After': '1' }).end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      }
      return;
    }
    if (req.url === '/exhaust') {
      exhaustedRequests += 1;
      res.writeHead(429, { 'Retry-After': '0' }).end();
      return;
    }
    if (req.url === '/not-found') {
      notFoundRequests += 1;
      res.writeHead(404).end();
      return;
    }
    if (req.url === '/text-forbidden') {
      forbiddenTextRequests += 1;
      res.writeHead(403).end();
      return;
    }
    if (req.url === '/stalled-body') {
      stalledBodyRequests += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.flushHeaders();
      res.write('{"waiting":');
      if (stalledBodyRequests === 1) markStallStarted();
      const finishTimer = setTimeout(() => res.end('true}'), 1_500);
      res.on('close', () => clearTimeout(finishTimer));
      return;
    }
    if (req.url === '/stalled-text') {
      stalledTextRequests += 1;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.flushHeaders();
      res.write('waiting');
      const finishTimer = setTimeout(() => res.end(' complete'), 1_500);
      res.on('close', () => clearTimeout(finishTimer));
      return;
    }
    if (req.url === '/quick') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (req.url === '/delayed-body') {
      delayedBodyRequests += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.flushHeaders();
      setTimeout(() => res.end('{"ok":true}'), 800);
      return;
    }
    if (req.url === '/limited') {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      setTimeout(() => {
        activeRequests -= 1;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      }, 50);
      return;
    }
    res.writeHead(500).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local test server did not bind to a TCP port');
  const host = '127.0.0.1';
  const baseUrl = `http://${host}:${address.port}`;

  try {
    const startedAt = Date.now();
    const retried = await fetchJson<{ ok: boolean }>(`${baseUrl}/retry-after`);
    const elapsedMs = Date.now() - startedAt;
    check(
      `429 Retry-After: 1 retries and returns JSON after about 1s (${elapsedMs}ms)`,
      retried.ok && retryAfterRequests === 2 && elapsedMs >= 900 && elapsedMs < 5_000,
    );

    let exhaustedError: unknown;
    try {
      await fetchJson(`${baseUrl}/exhaust`);
    } catch (error) {
      exhaustedError = error;
    }
    check(
      'four 429 responses end with HttpError status 429',
      exhaustedError instanceof HttpError && exhaustedError.status === 429 && exhaustedRequests === 4,
    );

    let notFoundError: unknown;
    try {
      await fetchJson(`${baseUrl}/not-found`);
    } catch (error) {
      notFoundError = error;
    }
    check(
      '404 is not retried',
      notFoundError instanceof HttpError && notFoundError.status === 404 && notFoundRequests === 1,
    );

    resetHttpsFallbackMetrics();
    let forbiddenTextError: unknown;
    try {
      await fetchText(`${baseUrl}/text-forbidden`);
    } catch (error) {
      forbiddenTextError = error;
    }
    check(
      'fetchText does not retry sweep reads through node:https',
      forbiddenTextError instanceof HttpError
        && forbiddenTextError.status === 403
        && forbiddenTextRequests === 1
        && getHttpsFallbackMetrics().attempts === 0,
    );

    setHostConcurrencyLimit(host, 1);
    const stalledRequest = fetchJson(`${baseUrl}/stalled-body`, 200).then(
      () => ({ error: null as unknown }),
      (error: unknown) => ({ error }),
    );
    await stallStarted;
    const queuedRequest = fetchJson<{ ok: boolean }>(`${baseUrl}/quick`, 1_000);
    const queuedResult = await queuedRequest;
    const stalledResult = await stalledRequest;
    check(
      'timed-out body surfaces as an abort and frees the host slot for a queued request',
      stalledResult.error instanceof Error
        && !(stalledResult.error instanceof HttpError && stalledResult.error.status === 429)
        && ['AbortError', 'TimeoutError'].includes(stalledResult.error.name)
        && stalledBodyRequests === 2
        && queuedResult.ok,
    );

    setHostConcurrencyLimit(host, 2);
    await Promise.all(Array.from({ length: 6 }, () => fetchJson(`${baseUrl}/limited`)));
    check('host limiter never exceeds two concurrent requests', maxActiveRequests === 2);

    setHostConcurrencyLimit(host, null);
    resetHttpsFallbackMetrics();
    let stalledTextError: unknown;
    try {
      await fetchTextWithHttpsFallback(`${baseUrl}/stalled-text`, 150);
    } catch (error) {
      stalledTextError = error;
    }
    check(
      'opt-in text fallback aborts a stalled fetch body without retrying over HTTPS',
      stalledTextError instanceof Error
        && ['AbortError', 'TimeoutError'].includes(stalledTextError.name)
        && stalledTextRequests === 1
        && getHttpsFallbackMetrics().attempts === 0,
    );

    const delayedStartedAt = Date.now();
    const delayedResult = await fetchJson<{ ok: boolean }>(`${baseUrl}/delayed-body`, 500);
    const delayedElapsedMs = Date.now() - delayedStartedAt;
    check(
      'unlimited host completes a response body after the request timeout',
      delayedResult.ok && delayedBodyRequests === 1 && delayedElapsedMs >= 700,
    );
  } finally {
    setHostConcurrencyLimit(host, null);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (failures) throw new Error(`${failures} HTTP check(s) failed`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

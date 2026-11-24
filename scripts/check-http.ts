import { createServer } from 'node:http';
import { fetchJson, HttpError, setHostConcurrencyLimit } from '../server/engine/http';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

async function main(): Promise<void> {
  let retryAfterRequests = 0;
  let exhaustedRequests = 0;
  let notFoundRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

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

    setHostConcurrencyLimit(host, 2);
    await Promise.all(Array.from({ length: 6 }, () => fetchJson(`${baseUrl}/limited`)));
    check('host limiter never exceeds two concurrent requests', maxActiveRequests === 2);
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

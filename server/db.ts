import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema';

/**
 * One shared pool, configured from DATABASE_URL.
 *
 * The local fallback exists only so a developer can run against a throwaway
 * database. In a container it is actively harmful: a missing secret used to be
 * silently replaced by 127.0.0.1, which surfaced as `ECONNREFUSED 127.0.0.1:5432`
 * and looked like a database outage rather than an unset variable. Outside
 * development, refuse to start and say so.
 */
const configured = process.env.DATABASE_URL;
if (!configured && process.env.NODE_ENV === 'production') {
  console.error(
    '[db] DATABASE_URL is not set. The container has no database to connect to; ' +
      'add the PostgreSQL connection string as a project secret and redeploy.',
  );
  process.exit(1);
}
const connectionString = configured ?? 'postgres://radar:radar@127.0.0.1:5432/radar';

const needsSsl =
  /sslmode=require|railway|proxy\.rlwy\.net|neon\.tech/i.test(connectionString) ||
  process.env.PGSSL === '1';

/**
 * Sizing notes, learned from production (Render free + Neon free):
 *
 * - A sweep runs `REFRESH.concurrency` workers that each issue a handful of statements per
 *   employer, plus the API. Twelve connections is comfortably more than that; a bigger pool
 *   only means more simultaneous TLS + SCRAM handshakes against Neon's proxy when idle
 *   clients are recycled, which is what produced "Authentication timed out".
 * - Boards are read for 30-90 seconds between statements, so a 30-second idle timeout threw
 *   away every connection mid-sweep and the next statement paid for a brand-new handshake,
 *   sometimes against a compute that Neon had just suspended. Idle clients are now kept for
 *   ten minutes and the socket is kept alive.
 * - `connectionTimeoutMillis` bounds a *new* handshake. Neon resumes a suspended compute in
 *   a few seconds normally, but a cold start can take longer than fifteen.
 */
export const pool = new Pool({
  connectionString,
  // Neon rejects connection handshakes under pressure and reports it as
  // "Authentication timed out". A larger pool makes that worse, not better: the sweep
  // adds one connection per statement while the site keeps serving. Keep it small.
  max: Number(process.env.PG_POOL_MAX ?? 8),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 600_000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 60_000),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ssl: needsSsl && !/sslmode=disable/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

/**
 * Errors that mean "the connection went away", not "the statement is wrong". Every one of
 * these has been seen in production against Neon: the proxy drops a client during a compute
 * resume, the handshake outlasts the pool's connection timeout, or an idle socket is reset.
 * A statement that failed this way is safe to run again.
 */
const TRANSIENT_CODES = new Set([
  '08000', '08003', '08006', '08001', '08004', // connection exception family
  '57P01', '57P02', '57P03',                   // admin shutdown / crash shutdown / cannot connect now
  '53300',                                     // too many connections
]);
const TRANSIENT_MESSAGE = /connection (terminated|timeout|reset|refused|closed)|authentication timed out|timeout exceeded when trying to connect|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EAI_AGAIN|socket hang up|server closed the connection|the database system is (starting|shutting)/i;

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: string; message?: string };
  if (code && TRANSIENT_CODES.has(code)) return true;
  return TRANSIENT_MESSAGE.test(message ?? '');
}

const RETRY_ATTEMPTS = Number(process.env.PG_RETRY_ATTEMPTS ?? 4);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a statement, retrying only when the failure is a lost connection. Backoff is
 * 1s, 3s, 9s — long enough for Neon to finish resuming a suspended compute. Anything
 * else (syntax, constraint, type errors) is thrown immediately.
 */
export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await pool.query<T>(sql, params as never[]);
      return res.rows;
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === RETRY_ATTEMPTS - 1) throw err;
      const wait = 1000 * 3 ** attempt;
      console.warn(`[db] transient error (${(err as Error).message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastError;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

async function connectWithRetry(): Promise<PoolClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === RETRY_ATTEMPTS - 1) throw err;
      const wait = 1000 * 3 ** attempt;
      console.warn(`[db] connect failed (${(err as Error).message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastError;
}

/**
 * One sweep per database, across processes. The in-process `running` flag cannot see a
 * second container (a rolling deploy, a second service, an old copy still pointed at the
 * same DATABASE_URL); at 08:00Z on 2026-11-07 three schedulers fired together and the
 * connection storm produced "Authentication timed out" for all of them.
 *
 * The lock is a transaction-level advisory lock inside a transaction that stays open on a
 * dedicated client for the length of the run. Transaction scope matters: Neon's pooled
 * endpoint (PgBouncer, transaction mode) hands a backend to a client only for the duration
 * of a transaction, so a session-level lock could be taken on one backend and "released" on
 * another. An open transaction pins the backend; ROLLBACK drops the lock; and if the
 * connection dies the server drops it too, so a crash cannot leave it stuck.
 */
const REFRESH_LOCK_KEY = 7_420_119;

export interface RefreshLock {
  /** False once the lock connection has errored or closed — the lock is gone with it. */
  readonly held: boolean;
  release(): Promise<void>;
}

/** Returns the lock, or null when another process already holds it. */
export async function acquireRefreshLock(): Promise<RefreshLock | null> {
  const client = await connectWithRetry();
  let locked = false;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1) AS locked', [REFRESH_LOCK_KEY],
    );
    locked = rows[0]?.locked === true;
    if (!locked) await client.query('ROLLBACK');
  } catch (err) {
    client.release(true);
    throw err;
  }
  if (!locked) {
    client.release();
    return null;
  }

  let alive = true;
  let released = false;
  const lost = (reason: string) => {
    if (!alive) return;
    alive = false;
    if (!released) console.error(`[db] refresh lock connection ${reason}; the lock is no longer held`);
  };
  const onError = (err: Error) => lost(`errored (${err.message})`);
  const onEnd = () => lost('closed');
  client.on('error', onError);
  client.on('end', onEnd);

  return {
    get held() { return alive; },
    async release() {
      if (released) return;
      released = true;
      try {
        if (alive) await client.query('ROLLBACK');
        client.release(!alive);
      } catch {
        client.release(true);
      } finally {
        // Detached only after ROLLBACK: a disconnect during it must still have a listener,
        // and the client goes back to the pool without listeners from this run.
        client.off('error', onError);
        client.off('end', onEnd);
      }
    },
  };
}

/** True while some process — this one or another — is inside a refresh. */
export async function refreshLockHeldElsewhere(): Promise<boolean> {
  const lock = await acquireRefreshLock();
  if (!lock) return true;
  await lock.release();
  return false;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

let migrated = false;

/** Creates every table/index if missing. Never destructive. */
export async function migrate(): Promise<void> {
  if (migrated) return;
  await q(SCHEMA_SQL);
  migrated = true;
}

export async function healthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

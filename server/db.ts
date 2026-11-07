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
  /sslmode=require|railway|proxy\.rlwy\.net/i.test(connectionString) ||
  process.env.PGSSL === '1';

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 24),
  idleTimeoutMillis: 30_000,
  // A sweep writes several statements per employer while the API keeps serving. Eight
  // connections and a fifteen-second wait exhausted the pool and the refresh died with
  // "Connection terminated due to connection timeout" before searching a single board.
  connectionTimeoutMillis: 60_000,
  ssl: needsSsl && !/sslmode=disable/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
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
  await pool.query(SCHEMA_SQL);
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

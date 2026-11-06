import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema';

/**
 * One shared pool. Railway injects DATABASE_URL for its Postgres plugin; the
 * same variable is used locally and in Docker.
 */
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://radar:radar@127.0.0.1:5432/radar';

const needsSsl =
  /sslmode=require|railway|proxy\.rlwy\.net/i.test(connectionString) ||
  process.env.PGSSL === '1';

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
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

import { migrate, pool } from '../server/db';
import { runRefresh, seedEmployers } from '../server/engine/ingest';
import { getStats } from '../server/queries';
import { q } from '../server/db';

async function main(): Promise<void> {
  const trigger = process.argv[2] ?? 'manual-cli';
  await migrate();
  const employers = await q<{ count: string }>(`SELECT count(*)::text AS count FROM employers`);
  if (!employers[0] || employers[0].count === '0') {
    const seeded = await seedEmployers();
    console.log(`Seeded ${seeded} employers`);
  }
  const started = Date.now();
  const runId = await runRefresh(trigger);
  const stats = await getStats();
  const run = await q<Record<string, unknown>>(`SELECT * FROM refresh_runs WHERE id = $1`, [runId]);
  console.log('--- run summary ---');
  console.log(JSON.stringify(run[0], null, 2));
  console.log('--- dashboard ---');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await pool.end();
}

void main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});

import { migrate, pool } from '../server/db';
import { seedEmployers } from '../server/engine/ingest';

async function main(): Promise<void> {
  await migrate();
  const inserted = await seedEmployers();
  console.log(`Schema ready. Seeded ${inserted} new employer rows.`);
  await pool.end();
}

void main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});

import { q, pool } from '../server/db';
import { fetchBoard } from '../server/engine/sources';
import { evaluateLocation } from '../server/engine/location';

async function main() {
  const rows = await q<any>(
    `SELECT * FROM employers WHERE careers_url ILIKE '%myworkdayjobs%' AND active ORDER BY name LIMIT 4`);
  for (const row of rows) {
    const res = await fetchBoard(row);
    const remote = res.jobs.filter((j) => evaluateLocation({ locations: j.locations, description: j.descriptionText ?? '', workplaceType: j.workplaceType ?? '' }).remote === 'remote');
    const paid = res.jobs.filter((j) => j.salary?.min);
    console.log(`${row.name.padEnd(26)} ok=${res.ok} listed=${res.totalListed} pmJobs=${res.jobs.length} remote=${remote.length} withPay=${paid.length}`);
    for (const j of res.jobs.slice(0, 3)) console.log('   ', j.title, '|', j.locations.join(';').slice(0, 40), '|', j.salary?.min ?? '-');
  }
  await pool.end();
}
void main();

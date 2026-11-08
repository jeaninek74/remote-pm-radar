import { pool, q } from '../server/db';
import { fetchBoard } from '../server/engine/sources';
import { evaluateLocation } from '../server/engine/location';
import type { EmployerRow } from '../server/engine/types';

async function main(): Promise<void> {
  const names = (process.argv[2] ?? 'gitlab,zapier,automattic,reddit,instacart,coinbase').split(',');
  const employers = await q<EmployerRow>(
    `SELECT id, slug, ats, name, industry, company_size, hq_state, careers_url,
            black_owned, ownership_status, ownership_source, last_searched_at::text, active
       FROM employers WHERE slug = ANY($1)`,
    [names],
  );
  for (const employer of employers) {
    const result = await fetchBoard(employer);
    console.log(`\n### ${employer.name} [${employer.ats}] ok=${result.ok} listed=${result.totalListed} pmJobs=${result.jobs.length}`);
    for (const job of result.jobs.slice(0, 8)) {
      const verdict = evaluateLocation({
        locations: job.locations,
        workplaceType: job.workplaceType,
        isRemote: job.isRemote,
        restrictions: job.restrictions,
        description: (job.descriptionText ?? '').slice(0, 4000),
        title: job.title,
      });
      console.log(`  ${verdict.remote.padEnd(8)} ${verdict.ca.padEnd(16)} wp=${String(job.workplaceType)} isRemote=${String(job.isRemote)} | ${job.locations.join(' / ') || '(none)'} | ${job.title}`);
    }
  }
  await pool.end();
}

void main().catch(async (err) => { console.error(err); await pool.end(); });

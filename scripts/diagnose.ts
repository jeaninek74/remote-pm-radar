import { pool, q } from '../server/db';
import { fetchBoard } from '../server/engine/sources';
import { isPmTitle } from '../server/engine/titles';
import { evaluateLocation } from '../server/engine/location';
import { classifySalary } from '../server/engine/salary';
import { evaluateRaw } from '../server/engine/ingest';
import type { EmployerRow } from '../server/engine/types';

async function main(): Promise<void> {
  const employers = await q<EmployerRow>(
    `SELECT id, slug, ats, name, industry, company_size, hq_state, careers_url,
            black_owned, ownership_status, ownership_source, last_searched_at::text, active
       FROM employers WHERE active = TRUE AND ats <> 'manual' LIMIT $1`,
    [Number(process.argv[2] ?? 12)],
  );

  let totalListed = 0;
  let pmTitles = 0;
  let remote = 0;
  let withSalary = 0;
  let inWindow = 0;
  const samples: string[] = [];

  for (const employer of employers) {
    const result = await fetchBoard(employer);
    if (!result.ok) {
      console.log(`${employer.name}: FAILED ${result.error}`);
      continue;
    }
    totalListed += result.totalListed;
    console.log(`${employer.name} [${employer.ats}] postings=${result.totalListed} pmJobs=${result.jobs.length}`);
    for (const job of result.jobs) {
      pmTitles += 1;
      const loc = evaluateLocation({
        locations: job.locations, workplaceType: job.workplaceType,
        isRemote: job.isRemote, restrictions: job.restrictions, description: job.descriptionText ?? '',
      });
      if (loc.remote === 'remote') remote += 1;
      if (job.salary?.min) withSalary += 1;
      if (job.postedAt && new Date(job.postedAt) >= new Date(Date.now() - 7 * 86_400_000)) inWindow += 1;
      if (samples.length < 25) {
        samples.push(
          `${loc.remote}/${loc.ca} | $${job.salary?.min ?? '-'} | ${job.postedAt ?? '-'} | ${job.title} @ ${employer.name} | loc=${job.locations.join(',')}`,
        );
      }
      if (job.salary?.min) {
        const cls = classifySalary(job.salary.min, job.salary.max, job.salary.interval);
        if (cls.bucket !== 'none' && loc.remote === 'remote') {
          const ev = evaluateRaw(job, employer);
          console.log(`   CANDIDATE ${cls.bucket}: ${job.title} @ ${employer.name} -> ${ev ? ev.bucket : 'dropped'}`);
        }
      }
    }
  }

  console.log('\n--- funnel ---');
  console.log({ totalListed, pmTitles, remote, withSalary, inWindow });
  console.log('\n--- sample PM jobs (remote/ca | min salary | posted | title) ---');
  for (const line of samples) console.log(line);
  await pool.end();
}

void main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});

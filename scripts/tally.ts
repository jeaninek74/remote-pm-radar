import { pool, q } from '../server/db';
import { fetchBoard } from '../server/engine/sources';
import { evaluateLocation } from '../server/engine/location';
import { mapLimit } from '../server/engine/http';
import type { EmployerRow } from '../server/engine/types';

async function main(): Promise<void> {
  const employers = await q<EmployerRow>(
    `SELECT id, slug, ats, name, industry, company_size, hq_state, careers_url, black_owned,
            ownership_status, ownership_source, last_searched_at::text, active
       FROM employers WHERE active AND ats <> 'manual'`,
  );
  let pm = 0;
  const verdicts: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  await mapLimit(employers, 6, async (employer) => {
    const result = await fetchBoard(employer);
    for (const job of result.jobs) {
      pm += 1;
      const verdict = evaluateLocation({
        locations: job.locations,
        workplaceType: job.workplaceType,
        isRemote: job.isRemote,
        restrictions: job.restrictions,
        description: (job.descriptionText ?? '').slice(0, 4000),
      });
      const key = `${verdict.remote}/${verdict.ca}`;
      verdicts[key] = (verdicts[key] ?? 0) + 1;
      samples[key] = samples[key] ?? [];
      if (samples[key].length < 4) {
        samples[key].push(`${job.locations.join(' ; ') || '(none)'} :: ${job.title.slice(0, 46)}`);
      }
    }
  });
  console.log('pm total', pm);
  console.log(verdicts);
  for (const key of Object.keys(samples)) console.log(`\n[${key}]\n  ${samples[key].join('\n  ')}`);
  await pool.end();
}

void main().catch(async (err) => { console.error(err); await pool.end(); });

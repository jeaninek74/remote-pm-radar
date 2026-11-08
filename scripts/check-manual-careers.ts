import { fetchCareersPage } from '../server/engine/careers';
import type { EmployerRow } from '../server/engine/types';

const specs = process.argv.slice(2);
async function main(): Promise<void> {
  if (!specs.length) {
    console.error('usage: npx tsx scripts/check-manual-careers.ts "<name>|<careers-url>" [...]');
    process.exitCode = 2;
    return;
  }
  for (const [index, spec] of specs.entries()) {
    const separator = spec.indexOf('|');
    if (separator < 1) {
      console.error(`invalid employer spec: ${spec}`);
      process.exitCode = 2;
      continue;
    }
    const name = spec.slice(0, separator);
    const careersUrl = spec.slice(separator + 1);
    const url = new URL(careersUrl);
    const employer: EmployerRow = {
      id: -(index + 1),
      ats: 'manual',
      slug: `${url.hostname}${url.pathname}`,
      name,
      industry: null,
      company_size: null,
      hq_state: null,
      careers_url: careersUrl,
      black_owned: false,
      ownership_status: 'Not researched',
      ownership_source: null,
      last_searched_at: null,
      last_resolve_at: null,
      active: true,
    };
    const result = await fetchCareersPage(employer);
    console.log(`${name} | ok=${result.ok} listed=${result.totalListed} matches=${result.jobs.length} truncated=${result.truncated === true}`);
    for (const job of result.jobs.slice(0, 3)) {
      console.log(JSON.stringify({
        title: job.title,
        applyUrl: job.applyUrl,
        location: job.locations.join('; '),
        postedAt: job.postedAt ?? null,
      }));
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

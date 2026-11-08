/**
 * Reads one or more employer boards exactly as a refresh does, without a database.
 *
 *   npx tsx scripts/check-board.ts greenhouse:stripe smartrecruiters:caci \
 *       workday:https://accenture.wd103.myworkdayjobs.com/AccentureCareers \
 *       'icims:careers-peraton.icims.com|Peraton' \
 *       'neogov:www.schooljobs.com/hawaiiedu|University of Hawaiʻi'
 *
 * Prints postings listed, role-family matches, and the time taken, so pagination and the
 * per-employer budget can be proven against live boards instead of inferred from a run.
 * Exit code is 1 when any board fails for a non-retryable reason.
 */
import { fetchBoard } from '../server/engine/sources';
import type { Ats, EmployerRow } from '../server/engine/types';

function employerFor(spec: string, index: number): EmployerRow {
  const [ats, ...rest] = spec.split(':');
  const target = rest.join(':');
  const isWorkday = ats === 'workday';
  const isIcims = ats === 'icims';
  const isNewDirectAts = ats === 'ukg' || ats === 'taleo' || ats === 'successfactors' || ats === 'neogov' || ats === 'phenom';
  const boardTarget = target.split('|')[0];
  const icimsTarget = isIcims ? boardTarget : target;
  const sourceName = ats === 'oracle'
    ? target.startsWith('egud.') ? 'AutoZone' : 'International Paper'
    : ats === 'dayforce' ? 'Bristol Bay Native Corporation'
      : isIcims ? target.split('|')[1] ?? icimsTarget.replace(/^careers-/i, '').split('.')[0]
        : ats === 'neogov' ? target.split('|')[1] ?? boardTarget.split('/')[1] ?? target
          : isNewDirectAts ? target.split('|')[1] ?? boardTarget.split('/')[0].split('.')[0] : target;
  return {
    id: -(index + 1),
    ats: ats as Ats,
    slug: isWorkday ? target.replace(/^https?:\/\//, '') : isIcims || isNewDirectAts ? boardTarget : target,
    name: isWorkday ? target.replace(/^https?:\/\/([^.]+).*/, '$1') : sourceName,
    industry: null, company_size: null, hq_state: null,
    careers_url: isWorkday ? target : null,
    black_owned: false, ownership_status: 'Not researched', ownership_source: null,
    last_searched_at: null, last_resolve_at: null, active: true,
  };
}

async function main(): Promise<void> {
  const specs = process.argv.slice(2);
  if (!specs.length) {
    console.error('usage: npx tsx scripts/check-board.ts <ats>:<slug|url> [...]');
    process.exitCode = 2;
    return;
  }
  let hardFailures = 0;
  for (const [index, spec] of specs.entries()) {
    const employer = employerFor(spec, index);
    const isNewDirectAts = ['ukg', 'taleo', 'successfactors', 'neogov'].includes(employer.ats);
    const started = Date.now();
    const result = await fetchBoard(employer);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!result.ok) {
      if (!result.retryable) hardFailures += 1;
      console.log(`FAIL ${spec}  ${result.error}${result.retryable ? '  (retryable: not counted against the board)' : ''}  ${seconds}s`);
      continue;
    }
    const withSalary = result.jobs.filter((job) => job.salary?.min).length;
    const dated = result.jobs.filter((job) => job.postedAt).length;
    console.log(
      `ok   ${spec}  listed=${result.totalListed} uniqueRead=${result.uniqueRead ?? result.jobs.length} matches=${result.jobs.length} withSalary=${withSalary} dated=${dated} truncated=${result.truncated === true}  ${seconds}s`,
    );
    for (const job of result.jobs.slice(0, isNewDirectAts ? 2 : 3)) {
      if (employer.ats === 'icims') {
        console.log(`       sample ${JSON.stringify({
          title: job.title,
          postedAt: job.postedAt,
          workplaceType: job.workplaceType,
          locations: job.locations,
          restrictions: job.restrictions ?? [],
          descriptionLength: job.descriptionText?.length ?? 0,
          salary: job.salary ? {
            min: job.salary.min,
            max: job.salary.max,
            interval: job.salary.interval,
            hourlyRate: job.salary.hourlyRate,
          } : null,
          applyUrl: job.applyUrl,
        })}`);
      } else if (isNewDirectAts) {
        console.log(`       sample ${JSON.stringify({
          title: job.title,
          postedAt: job.postedAt,
          locations: job.locations,
          salary: job.salary ? {
            min: job.salary.min,
            max: job.salary.max,
            interval: job.salary.interval,
            hourlyRate: job.salary.hourlyRate,
          } : null,
          description: (job.descriptionText ?? '').slice(0, 150),
          applyUrl: job.applyUrl,
        })}`);
      } else {
        console.log(`       ${job.title} | ${job.locations.join('; ').slice(0, 50)} | ${job.postedAt ?? 'no date'} | ${job.applyUrl}`);
      }
    }
  }
  if (hardFailures) process.exitCode = 1;
}

void main();

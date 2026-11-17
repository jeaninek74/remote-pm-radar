import {
  isWorkdayIngestPayload,
  sweepSkipsEmployer,
} from '../server/engine/workday-pull';

const job = {
  source: 'Workday',
  ats: 'workday',
  externalId: '/job/Seattle-WA/Program-Manager_REQ123',
  company: 'Example Co',
  title: 'Program Manager',
  locations: ['Seattle, WA'],
  applyUrl: 'https://example.wd1.myworkdayjobs.com/jobs/job/Seattle-WA/Program-Manager_REQ123',
  linkType: 'employer',
};

const checks: Array<[string, boolean]> = [
  ['accept valid success payload', isWorkdayIngestPayload({
    employerId: 12,
    result: { jobs: [job], totalListed: 1, truncated: false, closedKeys: ['Workday:/job/Seattle-WA/Old_REQ456'] },
  })],
  ['accept valid error payload', isWorkdayIngestPayload({ employerId: 12, error: 'workday search 429' })],
  ['reject missing employer ID', !isWorkdayIngestPayload({
    result: { jobs: [], totalListed: 0, truncated: false },
  })],
  ['reject missing result fields', !isWorkdayIngestPayload({
    employerId: 12, result: { jobs: [], truncated: false },
  })],
  ['reject invalid RawJob types', !isWorkdayIngestPayload({
    employerId: 12,
    result: { jobs: [{ ...job, locations: 'Seattle' }], totalListed: 1, truncated: false },
  })],
  ['reject nonnumeric listing total', !isWorkdayIngestPayload({
    employerId: 12, result: { jobs: [], totalListed: '1', truncated: false },
  })],
  ['skip Workday while runner is enabled', sweepSkipsEmployer(
    { ats: 'workday' }, { workdayViaRunner: true },
  )],
  ['include Workday while runner is disabled', !sweepSkipsEmployer(
    { ats: 'workday' }, { workdayViaRunner: false },
  )],
  ['do not skip non-Workday employer', !sweepSkipsEmployer(
    { ats: 'greenhouse' }, { workdayViaRunner: true },
  )],
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed += 1;
}
if (failed) process.exitCode = 1;
else console.log(`All ${checks.length} Workday pull checks passed.`);

import { evaluateRaw, evaluateRawDetailed } from '../server/engine/ingest';
import type { EmployerRow, RawJob } from '../server/engine/types';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

const employer: EmployerRow = {
  id: 1,
  slug: 'acme',
  ats: 'workday',
  name: 'Acme',
  industry: 'Technology',
  company_size: 'Large',
  hq_state: 'CA',
  careers_url: 'https://acme.wd1.myworkdayjobs.com/careers',
  black_owned: false,
  ownership_status: 'Not researched',
  ownership_source: null,
  last_searched_at: null,
  last_resolve_at: null,
  active: true,
};

function rawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: 'workday:acme',
    ats: 'workday',
    externalId: '1234',
    company: employer.name,
    title: 'Technical Project Manager',
    locations: ['United States'],
    workplaceType: 'remote',
    isRemote: true,
    descriptionText: 'Fully remote role leading project delivery and cross-functional initiatives.',
    applyUrl: 'https://acme.wd1.myworkdayjobs.com/careers/job/1234',
    linkType: 'employer',
    postedAt: new Date().toISOString().slice(0, 10),
    postedConfidence: 'confirmed',
    ...overrides,
  };
}

const foreign = evaluateRawDetailed(rawJob({ locations: ['Bangkok, THA'] }), employer);
check(
  'foreign raw job is rejected with location reason',
  foreign.job === null && foreign.reason.includes('outside the United States'),
);

const hybrid = evaluateRawDetailed(rawJob({
  workplaceType: 'hybrid',
  isRemote: false,
  descriptionText: 'Hybrid schedule with three days in the office each week.',
}), employer);
check(
  'hybrid raw job is rejected with arrangement reason',
  hybrid.job === null && hybrid.reason.toLowerCase().includes('hybrid'),
);

const validRaw = rawJob();
const valid = evaluateRawDetailed(validRaw, employer);
check('remote US project manager is accepted', valid.job !== null && valid.reason === null);
check(
  'evaluateRaw returns the detailed evaluation job',
  JSON.stringify(evaluateRaw(validRaw, employer)) === JSON.stringify(valid.job),
);

if (failures) throw new Error(`${failures} evaluation check(s) failed`);

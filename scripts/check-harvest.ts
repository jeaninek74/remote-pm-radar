import {
  classifyBoardCandidate,
  blocksForPrefix,
  extractBoardSlug,
  isBoardCandidatePayload,
  pageTitle,
  surtPrefix,
} from '../server/engine/harvest';
import { HARVEST_BOARDS_OIDC_POLICY } from '../server/engine/github-oidc';
import { discoveryBudget } from '../server/engine/discovery-budget';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

const urls: [string, string, string][] = [
  ['https://jobs.lever.co/Acme-Co/job/123?source=career', 'lever', 'acme-co'],
  ['https://boards.greenhouse.io/Acme_Inc/jobs/123?gh_jid=123', 'greenhouse', 'acme_inc'],
  ['https://job-boards.greenhouse.io/UPPERCASE/jobs/123', 'greenhouse', 'uppercase'],
  ['https://boards.greenhouse.io/embed/job_board?for=AcmeCo', 'greenhouse', 'acmeco'],
  ['https://jobs.ashbyhq.com/Example.Org/senior-pm', 'ashby', 'example.org'],
  ['https://apply.workable.com/AcmeCo/j/123?source=jobs', 'workable', 'acmeco'],
  ['https://careers.smartrecruiters.com/AcmeCo/123?ref=site', 'smartrecruiters', 'acmeco'],
  ['https://jobs.smartrecruiters.com/ACME/jobs/123', 'smartrecruiters', 'acme'],
  ['https://Bright-Co.recruitee.com/o/project-manager?source=career', 'recruitee', 'bright-co'],
];
for (const [url, ats, slug] of urls) {
  const candidate = extractBoardSlug(url);
  check(`extract ${ats} from ${url}`, candidate?.ats === ats && candidate.slug === slug);
}

for (const path of ['embed', 'api', 'v1', 'v0', 'careers', 'jobs', 'www', 'static', 'assets', 'favicon.ico', 'robots.txt']) {
  check(`reject reserved path ${path}`, extractBoardSlug(`https://jobs.lever.co/${path}/anything`) === null);
}
check('reject unknown ATS host', extractBoardSlug('https://jobs.example.com/acme') === null);
check('reject malformed URL', extractBoardSlug('not a URL') === null);
check('reject invalid slug characters', extractBoardSlug('https://jobs.lever.co/acme%2Fother') === null);

check('validate a board-candidate batch', isBoardCandidatePayload({
  candidates: [{ ats: 'greenhouse', slug: 'example-board', source: 'CC-MAIN-2026-47' }],
}));
check('reject unsupported ATS in payload', !isBoardCandidatePayload({
  candidates: [{ ats: 'bamboohr', slug: 'example-board', source: 'CC-MAIN-2026-47' }],
}));
check('reject invalid payload slug', !isBoardCandidatePayload({
  candidates: [{ ats: 'lever', slug: '../example', source: 'CC-MAIN-2026-47' }],
}));
check('reject batch over endpoint limit', !isBoardCandidatePayload({
  candidates: new Array(2001).fill({ ats: 'lever', slug: 'example', source: 'crawl' }),
}));

check('empty board is classified empty', classifyBoardCandidate('Acme', []) === 'empty');
check('missing company name is classified no_name',
  classifyBoardCandidate(null, [['United States']]) === 'no_name');
check('all-foreign postings are classified foreign',
  classifyBoardCandidate('Acme', [['London, GBR'], ['Bangkok, THA']]) === 'foreign');
check('matching existing employer is classified duplicate',
  classifyBoardCandidate('Acme', [['United States']], true) === 'duplicate');
check('eligible nonduplicate board is accepted',
  classifyBoardCandidate('Acme', [['United States']]) === 'added');
check('strip a bare Ashby jobs title suffix',
  pageTitle('<title>OpenAI Jobs</title>') === 'OpenAI');
check('strip ATS and job-title suffixes',
  pageTitle('<title>Acme - Jobs | Lever</title>') === 'Acme');
check('strip Ashby suffix after the role label',
  pageTitle('<title>Crusoe Careers | Ashby</title>') === 'Crusoe');
check('keep a company name without a title suffix',
  pageTitle('<title>Acme, Inc.</title>') === 'Acme, Inc.');
const dayStart = Date.UTC(2026, 0, 1);
check('decline discovery 20 seconds before a sweep slot',
  discoveryBudget(dayStart + 29 * 60_000 + 40_000, 20 * 60_000) === null);
check('cap discovery at 19 minutes with 20 minutes before a sweep',
  discoveryBudget(dayStart + 10 * 60_000, 30 * 60_000) === 19 * 60_000);
check('discovery budget is capped by the configured budget',
  discoveryBudget(dayStart + 10 * 60_000, 5 * 60_000) === 5 * 60_000);
check('leave one minute of headroom at two minutes before a sweep',
  discoveryBudget(dayStart + 28 * 60_000, 30 * 60_000) === 60_000);
check('harvest OIDC is scoped to the master workflow',
  HARVEST_BOARDS_OIDC_POLICY.workflowRef
    === 'jeaninek74/remote-pm-radar/.github/workflows/harvest-boards.yml@refs/heads/master'
    && HARVEST_BOARDS_OIDC_POLICY.ref === 'refs/heads/master'
    && HARVEST_BOARDS_OIDC_POLICY.eventNames.includes('schedule')
    && HARVEST_BOARDS_OIDC_POLICY.eventNames.includes('workflow_dispatch'));

const surtPatterns: [string, string][] = [
  ['jobs.lever.co/*', 'co,lever,jobs)/'],
  ['boards.greenhouse.io/*', 'io,greenhouse,boards)/'],
  ['job-boards.greenhouse.io/*', 'io,greenhouse,job-boards)/'],
  ['jobs.ashbyhq.com/*', 'com,ashbyhq,jobs)/'],
  ['apply.workable.com/*', 'com,workable,apply)/'],
  ['jobs.smartrecruiters.com/*', 'com,smartrecruiters,jobs)/'],
  ['careers.smartrecruiters.com/*', 'com,smartrecruiters,careers)/'],
  ['*.recruitee.com/*', 'com,recruitee,'],
];
for (const [pattern, prefix] of surtPatterns) {
  check(`map ${pattern} to its SURT prefix`, surtPrefix(pattern) === prefix);
}
const indexEntry = (key: string) => ({ key, file: 'cdx-00000.gz', offset: 0, length: 1, clusterId: '0' });
check('select the block spanning a prefix inside the first index range',
  blocksForPrefix([indexEntry('a'), indexEntry('c')], 'b').map((entry) => entry.key).join(',') === 'a');
check('select the preceding and every block spanning a prefix',
  blocksForPrefix([
    indexEntry('a'),
    indexEntry('co,lever,jobs)/'),
    indexEntry('co,lever,jobs)/a'),
    indexEntry('co,lever,jobs)/z'),
    indexEntry('z'),
  ], 'co,lever,jobs)/').map((entry) => entry.key).join('|')
    === 'a|co,lever,jobs)/|co,lever,jobs)/a|co,lever,jobs)/z');
check('select the preceding block when a prefix is absent',
  blocksForPrefix([indexEntry('a'), indexEntry('z')], 'm').map((entry) => entry.key).join(',') === 'a');
check('return no block when a prefix is before the first index key',
  blocksForPrefix([indexEntry('m'), indexEntry('z')], 'a').length === 0);

if (failures) throw new Error(`${failures} harvest check(s) failed`);

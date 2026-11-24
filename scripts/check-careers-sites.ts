import {
  aggregateWdcQuads,
  filterWebsiteCandidates,
  isCareersSitesPayload,
  mergeWdcAggregates,
  parseWdcQuad,
  type WdcDomainAggregate,
} from '../server/engine/website';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

function quad(subject: string, predicate: string, object: string, graph: string): string {
  return `${subject} <http://schema.org/${predicate}> ${object} <${graph}> .`;
}

function posting(
  graph: string,
  options: {
    organization?: string;
    country?: string;
    telecommute?: boolean;
    organizations?: string[];
  } = {},
): string[] {
  const lines = [
    `<${graph}/posting> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/JobPosting> <${graph}> .`,
  ];
  for (const [index, organization] of (options.organizations ?? (options.organization ? [options.organization] : [])).entries()) {
    const node = `<${graph}/organization/${index}>`;
    lines.push(
      quad(`<${graph}/posting-${index}`, 'hiringOrganization', node, graph),
      quad(node, 'name', `"${organization}"`, graph),
    );
  }
  if (options.country) lines.push(quad(`<${graph}/address`, 'addressCountry', `"${options.country}"`, graph));
  if (options.telecommute) {
    lines.push(quad(`<${graph}/posting`, 'jobLocationType', '<http://schema.org/TELECOMMUTE>', graph));
  }
  return lines;
}

const fixtureLines = [
  ...posting('https://jobs.example.com/careers/one', { organization: 'Example Corp', country: 'US' }),
  ...posting('https://www.example.com/careers/two', { organization: 'Example Corp', country: 'USA' }),
  quad(
    '<https://jobs.example.com/careers/one/another>',
    'type',
    '<http://schema.org/JobPosting>',
    'https://jobs.example.com/careers/one',
  ),
  ...posting('https://agency-board.net/jobs/1', {
    organizations: ['First Employer', 'Second Employer', 'Third Employer'],
    country: 'US',
  }),
  ...posting('https://foreigncorp.ca/jobs/1', { organization: 'Foreign Corp', country: 'Canada' }),
  ...posting('https://nomadwork.net/jobs/1', { organization: 'Nomad Work', telecommute: true }),
  ...posting('https://unbranded.io/roles/1', { country: 'UNITED STATES OF AMERICA' }),
  ...posting('https://jobs.lever.co/acme/role', { organization: 'Acme', country: 'US' }),
  ...posting('https://remotejobs.io/roles/1', { organization: 'Remote Jobs', country: 'US' }),
  ...posting('https://jobgether.com/roles/1', { organization: 'Jobgether', country: 'US' }),
];
for (let index = 0; index < 21; index += 1) {
  fixtureLines.push(...posting(`https://company-${index}.test/jobs/${index}`, {
    organization: 'Google',
    country: 'US',
  }));
}

const typeLine = fixtureLines.find((line) => line.includes('#type'))!;
check('WDC parser splits rdf:type on #', parseWdcQuad(typeLine)?.property === 'type');
check('registrable-domain rule handles co.uk and ordinary domains',
  aggregateWdcQuads([
    ...posting('https://careers.example.co.uk/jobs/1', { organization: 'Example UK', country: 'US' }),
    ...posting('https://jobs.example.com/jobs/1', { organization: 'Example US', country: 'US' }),
  ]).map((site) => site.domain).sort().join(',') === 'example.co.uk,example.com');

const part13 = aggregateWdcQuads(fixtureLines);
const merged = new Map<string, WdcDomainAggregate>();
mergeWdcAggregates(merged, part13);
const result = filterWebsiteCandidates([...merged.values()]);
const byDomain = new Map(result.candidates.map((candidate) => [candidate.domain, candidate]));
const example = merged.get('example.com');
check('domain aggregation counts unique JobPosting pages and org names',
  example?.pageCount === 2
    && example.organizationNameCounts['Example Corp'] === 2
    && example.pageUrls.length === 2);
check('US careers page with an organization name is retained',
  byDomain.get('example.com')?.name === 'Example Corp');
check('candidate without an organization name falls back to its domain',
  byDomain.get('unbranded.io')?.name === 'unbranded.io');
check('multi-organization job board is rejected',
  !byDomain.has('agency-board.net'));
check('foreign-only domain is rejected',
  !byDomain.has('foreigncorp.ca'));
check('telecommute-only domain without a country is retained',
  byDomain.has('nomadwork.net'));
check('ATS and job-board domains are rejected',
  !byDomain.has('lever.co') && !byDomain.has('remotejobs.io'));
check('known non-employer board domain is rejected',
  !byDomain.has('jobgether.com'));
check('template organization on more than 20 domains is rejected',
  result.counts.templateOrganizationNames === 1
    && ![...byDomain.keys()].some((domain) => domain.startsWith('company-')));
const manyPages = aggregateWdcQuads(Array.from({ length: 10 }, (_value, index) =>
  posting(`https://sample.net/jobs/${index}`, { country: 'US' })).flat());
check('domain aggregation keeps at most eight sample page URLs',
  manyPages.find((site) => site.domain === 'sample.net')?.pageCount === 10
    && manyPages.find((site) => site.domain === 'sample.net')?.pageUrls.length === 8);

const validPayload = {
  results: [{
    domain: 'example.com',
    name: 'Example Corp',
    source: 'Web Data Commons JobPosting 2024-12',
    result: { kind: 'board', ats: 'greenhouse', slug: 'example', careersUrl: 'https://boards.greenhouse.io/example', total: 2 },
  }],
};
check('careers-sites payload guard accepts a valid board result',
  isCareersSitesPayload(validPayload));
check('careers-sites payload guard rejects a malformed result',
  !isCareersSitesPayload({
    results: [{
      domain: '',
      name: 'Example Corp',
      source: 'Web Data Commons JobPosting 2024-12',
      result: { kind: 'careers', careersUrl: 'https://example.com/careers', postings: 'two', matching: 1 },
    }],
  }));
check('careers-sites payload guard rejects a missing results array',
  !isCareersSitesPayload({ candidates: [] }));
check('careers-sites payload guard rejects duplicate domains in one batch',
  !isCareersSitesPayload({
    results: [
      ...validPayload.results,
      { ...validPayload.results[0] },
    ],
  }));

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
  ...posting('https://mixed-keep.com/jobs/us', { organization: 'Mixed Site', country: 'US' }),
  ...posting('https://mixed-keep.com/jobs/ca', { organization: 'Mixed Site', country: 'Canada' }),
  ...posting('https://mixed-reject.com/jobs/us', { organization: 'Mixed Reject', country: 'USA' }),
  ...posting('https://mixed-reject.com/jobs/ca1', { organization: 'Mixed Reject', country: 'Canada' }),
  ...posting('https://mixed-reject.com/jobs/ca2', { organization: 'Mixed Reject', country: 'Canada' }),
  ...posting('https://foreign-tld.hu/jobs/1', { organization: 'Foreign TLD', country: 'US' }),
  ...posting('https://foreign-tld.co.uk/jobs/1', { organization: 'Foreign UK', country: 'US' }),
  ...posting('https://allowed-co.co/jobs/1', { organization: 'Allowed Co', country: 'US' }),
  ...posting('https://allowed-ai.ai/jobs/1', { organization: 'Allowed AI', country: 'US' }),
  ...posting('https://allowed-us.us/jobs/1', { organization: 'Allowed US', country: 'US' }),
  ...posting('https://generic-tech.tech/jobs/1', { organization: 'Generic Tech', country: 'US' }),
  ...posting('https://google-one.test/jobs/1', { organization: 'Google', country: 'US' }),
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
check('US country counts at exactly half of the total are retained',
  byDomain.get('mixed-keep.com')?.name === 'Mixed Site');
check('sites with less than half US country counts are rejected',
  !byDomain.has('mixed-reject.com'));
check('foreign country-code TLDs are rejected even with US country data',
  !byDomain.has('foreign-tld.hu') && !byDomain.has('foreign-tld.co.uk'));
check('allowed two-letter TLD exceptions remain eligible',
  byDomain.get('allowed-co.co')?.name === 'Allowed Co'
    && byDomain.get('allowed-ai.ai')?.name === 'Allowed AI'
    && byDomain.get('allowed-us.us')?.name === 'Allowed US');
check('generic multi-character TLDs remain eligible',
  byDomain.get('generic-tech.tech')?.name === 'Generic Tech');
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
check('template organization on more than 20 domains falls back to the domain',
  result.counts.templateOrganizationNames === 1
    && byDomain.get('company-0.test')?.name === 'company-0.test');
check('Google organization name falls back even below the template threshold',
  byDomain.get('google-one.test')?.name === 'google-one.test');
const templatePartA = aggregateWdcQuads(Array.from({ length: 11 }, (_value, index) =>
  posting(`https://multi-${index}.test/jobs/1`, { organization: 'Komplex Web+', country: 'US' })).flat());
const templatePartB = aggregateWdcQuads(Array.from({ length: 10 }, (_value, index) =>
  posting(`https://multi-${index + 11}.test/jobs/1`, { organization: 'Komplex Web+', country: 'US' })).flat());
const acrossParts = new Map<string, WdcDomainAggregate>();
mergeWdcAggregates(acrossParts, templatePartA);
mergeWdcAggregates(acrossParts, templatePartB);
const acrossPartsResult = filterWebsiteCandidates([...acrossParts.values()]);
check('template-name frequency is counted across merged parts before filtering',
  acrossPartsResult.counts.templateOrganizationNames === 1
    && acrossPartsResult.candidates.every((candidate) => candidate.name === candidate.domain));
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
check('careers-sites payload guard accepts unreadable diagnostics',
  isCareersSitesPayload({
    results: [{
      domain: 'example.org',
      name: 'Example',
      source: 'Web Data Commons JobPosting 2024-12',
      result: { kind: 'unreadable', platform: 'Phenom', reason: 'widget request failed' },
    }],
  }));
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

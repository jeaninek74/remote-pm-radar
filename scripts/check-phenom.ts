import { readFileSync } from 'node:fs';
import {
  parsePhenomConfig,
  parsePhenomBaseSalary,
  parsePhenomResponse,
  phenomDetailRedirectTarget,
  phenomEndpointMatchesPageHost,
  phenomJobUrl,
  phenomPrimaryLocations,
  phenomRemoteInfo,
  selectPhenomSalary,
} from '../server/engine/phenom';
import { evaluateLocation } from '../server/engine/location';
import { classifySalary, parseSalaryFromText } from '../server/engine/salary';

let failures = 0;

function check(label: string, passed: boolean): void {
  if (passed) console.log(`PASS ${label}`);
  else {
    console.error(`FAIL ${label}`);
    failures += 1;
  }
}

const fixture = JSON.parse(readFileSync('server/engine/phenom-response.fixture.json', 'utf8')) as unknown;
const parsed = parsePhenomResponse(fixture);
check('Phenom parser preserves totalHits and skips malformed items', parsed.totalHits === 2 && parsed.itemsCount === 2 && parsed.jobs.length === 1);
check('Phenom parser reads posting fields', parsed.jobs[0]?.title === 'Desktop Support Technician - Apple / Windows 11'
  && parsed.jobs[0]?.locations[0] === 'Sunnyvale,CA,94085,USA'
  && parsed.jobs[0]?.description.startsWith('We are recruiting a Desktop Support Technician'));
const primaryLocations = phenomPrimaryLocations(['Remote, US'], ['San Francisco, CA']);
const feedRemote = phenomRemoteInfo(['Remote, US'], null);
check('Phenom feed remote location remains primary over detail office address',
  primaryLocations.length === 1 && primaryLocations[0] === 'Remote, US'
    && feedRemote.isRemote === true && feedRemote.workplaceType === 'remote');
const hybridDetailLocations = ['Hybrid - Boston, MA'];
const hybridDetailRemote = phenomRemoteInfo(['Remote, US'], null, hybridDetailLocations);
const hybridDetailVerdict = evaluateLocation({
  locations: phenomPrimaryLocations(['Remote, US'], hybridDetailLocations),
  workplaceType: hybridDetailRemote.workplaceType,
  isRemote: hybridDetailRemote.isRemote,
});
check('Phenom hybrid detail location excludes the remote feed posting',
  hybridDetailRemote.workplaceType === 'hybrid' && hybridDetailVerdict.remote === 'hybrid');

const config = parsePhenomConfig(
  '<title>Careers at Acme Corp</title><script>phApp.phAppConfig={"widgetApiEndpoint":"https://jobs.acme.com/widgets","refNum":"ACMEUS","locale":"en_us","siteType":"external","baseUrl":"https://jobs.acme.com/us/en/","pageName":"home"};</script>',
  'https://jobs.acme.com/us/en',
);
check('Phenom config is parsed from tenant page data', config?.refNum === 'ACMEUS'
  && config.locale === 'en_us' && config.siteType === 'external' && config.companyName === 'Acme Corp');
check('Phenom widget endpoint must match the final page host', !!config
  && phenomEndpointMatchesPageHost(config.widgetApiEndpoint, config.pageHost));
const crossHostConfig = parsePhenomConfig(
  '<script>phApp.phAppConfig={"widgetApiEndpoint":"https://api.example.net/widgets"};</script>',
  'https://careers.example.com/us/en/',
);
check('Phenom cross-host widget endpoint is rejected', !!crossHostConfig
  && !phenomEndpointMatchesPageHost(crossHostConfig.widgetApiEndpoint, crossHostConfig.pageHost));
check('Phenom detail redirects can stay on the careers host',
  phenomDetailRedirectTarget('https://jobs.acme.com/job/1', '/us/en/job/1', 'jobs.acme.com', 0)
    === 'https://jobs.acme.com/us/en/job/1');
check('Phenom detail cross-host redirects are rejected',
  phenomDetailRedirectTarget('https://jobs.acme.com/job/1', 'https://evil.example/job/1', 'jobs.acme.com', 0) === null);
check('Phenom detail HTTPS downgrade redirects are rejected',
  phenomDetailRedirectTarget('https://jobs.acme.com/job/1', 'http://jobs.acme.com/job/2', 'jobs.acme.com', 0) === null);
check('Phenom detail redirects stop after five hops',
  phenomDetailRedirectTarget('https://jobs.acme.com/job/1', '/job/2', 'jobs.acme.com', 5) === null);
const maxOnlySalary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { maxValue: '120000', unitText: 'YEAR' },
});
check('Phenom max-only salary preserves a null minimum and does not enter a band',
  maxOnlySalary?.min === null && maxOnlySalary.max === 120000
    && classifySalary(maxOnlySalary.min, maxOnlySalary.max, maxOnlySalary.interval).bucket === 'none');
const minOnlySalary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { minValue: '95000', unitText: 'YEAR' },
});
check('Phenom min-only salary preserves a null maximum',
  minOnlySalary?.min === 95000 && minOnlySalary.max === null);
const hourlySalary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { minValue: '62.50', unitText: 'HOUR' },
});
check('Phenom hourly salary annualizes before rounding',
  hourlySalary?.min === 130000 && hourlySalary.max === null && hourlySalary.hourlyRate === 62.5);
const descriptionRangeSalary = parseSalaryFromText('Base salary range is $100,000 - $120,000 per year', 'Phenom description');
check('Phenom description salary fixture parses a range',
  descriptionRangeSalary?.min === 100000 && descriptionRangeSalary.max === 120000);
check('Phenom description range supersedes max-only structured salary',
  selectPhenomSalary(maxOnlySalary, descriptionRangeSalary) === descriptionRangeSalary);
const invalidCurrencySalary = parsePhenomBaseSalary({
  currency: 'CAD',
  value: { minValue: '95000', unitText: 'YEAR' },
});
check('Phenom description range replaces invalid-currency structured salary',
  invalidCurrencySalary === null && selectPhenomSalary(invalidCurrencySalary, descriptionRangeSalary) === descriptionRangeSalary);
const invalidUnitSalary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { minValue: '95000', unitText: 'FORTNIGHT' },
});
check('Phenom invalid-unit structured salary falls back to description',
  invalidUnitSalary === null && selectPhenomSalary(invalidUnitSalary, descriptionRangeSalary) === descriptionRangeSalary);
check('Phenom max-only structured salary remains when description has no minimum',
  selectPhenomSalary(maxOnlySalary, null) === maxOnlySalary);
check('Phenom job URL preserves locale path', phenomJobUrl('job/123', 'https://jobs.acme.com/us/en')
  === 'https://jobs.acme.com/us/en/job/123');

if (failures) throw new Error(`${failures} Phenom parser check(s) failed`);

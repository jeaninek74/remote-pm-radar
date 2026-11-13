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
import { sharedBoardPostingKey } from '../server/engine/ingest';

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
const remoteHybridLocations = ['Remote/Hybrid'];
const remoteHybridRemote = phenomRemoteInfo(['Remote, US'], null, remoteHybridLocations);
const remoteHybridVerdict = evaluateLocation({
  locations: phenomPrimaryLocations(['Remote, US'], remoteHybridLocations),
  workplaceType: remoteHybridRemote.workplaceType,
  isRemote: remoteHybridRemote.isRemote,
});
check('Phenom Remote/Hybrid detail option excludes the remote feed posting',
  remoteHybridRemote.workplaceType === 'hybrid' && remoteHybridVerdict.remote === 'hybrid');
const mixedDetailLocations = ['Remote, US', 'Hybrid - Boston, MA'];
const mixedDetailRemote = phenomRemoteInfo([], null, mixedDetailLocations);
const mixedDetailPrimaryLocations = phenomPrimaryLocations([], mixedDetailLocations);
const mixedDetailVerdict = evaluateLocation({
  locations: mixedDetailPrimaryLocations,
  workplaceType: mixedDetailRemote.workplaceType,
  isRemote: mixedDetailRemote.isRemote,
});
check('Phenom mixed remote and hybrid detail locations remain remote-eligible',
  mixedDetailRemote.isRemote === true && mixedDetailRemote.workplaceType === 'remote'
    && mixedDetailPrimaryLocations.includes('Remote, US') && mixedDetailVerdict.remote === 'remote');
const canadaRemoteLocations = ['Remote, Canada'];
const canadaRemoteInfo = phenomRemoteInfo(['Austin, TX'], null, canadaRemoteLocations);
const canadaPrimaryLocations = phenomPrimaryLocations(['Austin, TX'], canadaRemoteLocations);
const canadaRemoteVerdict = evaluateLocation({
  locations: canadaPrimaryLocations,
  workplaceType: canadaRemoteInfo.workplaceType,
  isRemote: canadaRemoteInfo.isRemote,
});
check('Phenom non-US remote detail is not merged with a US office location',
  !canadaPrimaryLocations.includes('Remote, Canada')
    && canadaRemoteInfo.isRemote !== true && canadaRemoteVerdict.remote !== 'remote');
const usCanadaRemoteLocations = ['Remote, US / Canada'];
const usCanadaRemoteInfo = phenomRemoteInfo(['Austin, TX'], null, usCanadaRemoteLocations);
const usCanadaPrimaryLocations = phenomPrimaryLocations(['Austin, TX'], usCanadaRemoteLocations);
const usCanadaRemoteVerdict = evaluateLocation({
  locations: usCanadaPrimaryLocations,
  workplaceType: usCanadaRemoteInfo.workplaceType,
  isRemote: usCanadaRemoteInfo.isRemote,
});
check('Phenom US and Canada remote detail remains US-remote eligible',
  usCanadaRemoteInfo.isRemote === true
    && usCanadaPrimaryLocations.includes('Remote, US / Canada')
    && usCanadaRemoteVerdict.remote === 'remote' && usCanadaRemoteVerdict.ca === 'us_wide');

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
const descriptionRangeText = 'Base salary range is $100,000 - $120,000 per year';
const descriptionRangeSalary = parseSalaryFromText(descriptionRangeText, 'Phenom description');
check('Phenom description salary fixture parses a range',
  descriptionRangeSalary?.min === 100000 && descriptionRangeSalary.max === 120000);
check('Phenom description range supersedes max-only structured salary',
  selectPhenomSalary(maxOnlySalary, descriptionRangeSalary) === descriptionRangeSalary);
const upperBoundDescription = 'Up to $120,000';
const upperBoundSalary = parseSalaryFromText(upperBoundDescription, 'Phenom description');
const upperBoundSelected = selectPhenomSalary(maxOnlySalary, upperBoundSalary);
check('Phenom up-to description does not turn structured max into a minimum',
  upperBoundSalary?.min === 120000 && upperBoundSalary.max === null
    && upperBoundSelected?.min === null && upperBoundSelected.max === 120000
    && classifySalary(upperBoundSelected.min, upperBoundSelected.max, upperBoundSelected.interval).bucket === 'none');
const explicitMinimumText = 'Starting at $95,000 per year';
const explicitMinimumSalary = parseSalaryFromText(explicitMinimumText, 'Phenom description');
check('Phenom explicit description minimum supersedes max-only structured salary',
  explicitMinimumSalary?.min === 95000
    && selectPhenomSalary(maxOnlySalary, explicitMinimumSalary) === explicitMinimumSalary);
const fromMinimumText = 'From $95,000 per year';
const fromMinimumSalary = parseSalaryFromText(fromMinimumText, 'Phenom description');
check('Phenom description from-minimum supersedes max-only structured salary',
  fromMinimumSalary?.min === 95000
    && selectPhenomSalary(maxOnlySalary, fromMinimumSalary) === fromMinimumSalary);
const maxOnly200Salary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { maxValue: '200000', unitText: 'YEAR' },
});
const hourlyDescriptionText = 'Starting at $75/hr';
const hourlyDescriptionSalary = parseSalaryFromText(hourlyDescriptionText, 'Phenom description');
check('Phenom hourly description minimum supersedes a greater structured maximum',
  hourlyDescriptionSalary?.min === 156000 && hourlyDescriptionSalary.max === null
    && hourlyDescriptionSalary.hourlyRate === 75
    && selectPhenomSalary(maxOnly200Salary, hourlyDescriptionSalary) === hourlyDescriptionSalary);
const maxOnly140Salary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { maxValue: '140000', unitText: 'YEAR' },
});
const minimumBaseSalaryText = 'Minimum base salary USD $95,000';
const minimumBaseSalary = parseSalaryFromText(minimumBaseSalaryText, 'Phenom description');
check('Phenom minimum base salary description supersedes max-only structured salary',
  minimumBaseSalary?.min === 95000 && minimumBaseSalary.max === null
    && selectPhenomSalary(maxOnly140Salary, minimumBaseSalary) === minimumBaseSalary);
const maxOnly160Salary = parsePhenomBaseSalary({
  currency: 'USD',
  value: { maxValue: '160000', unitText: 'YEAR' },
});
const experienceMinimumText = 'Minimum 10 years of experience. Pay up to $160,000';
const experienceMinimumSalary = parseSalaryFromText(experienceMinimumText, 'Phenom description');
const experienceMinimumSelected = selectPhenomSalary(maxOnly160Salary, experienceMinimumSalary);
check('Phenom experience minimum does not replace a structured max-only salary',
  experienceMinimumSalary?.min === 160000 && experienceMinimumSalary.max === null
    && experienceMinimumSelected?.min === null && experienceMinimumSelected.max === 160000);
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
const sharedPhenomTitle = 'Sourcing Program Manager - Work at Home';
const bonSecoursPostingKey = sharedBoardPostingKey(
  'Phenom:careers.bonsecours.com/us/en:BSMBSZUSR289400EXTERNALENUS',
  'Bon Secours',
  'R289400',
  sharedPhenomTitle,
  '2026-11-01',
);
const mercyPostingKey = sharedBoardPostingKey(
  'Phenom:careers.mercy.com/us/en:BSMMHPUSR289400EXTERNALENUS',
  'Mercy',
  'R289400',
  sharedPhenomTitle,
  '2026-11-01',
);
check('Phenom shared requisition IDs and dates deduplicate across tenant prefixes',
  bonSecoursPostingKey !== null && bonSecoursPostingKey === mercyPostingKey);
check('Phenom shared requisition IDs with different dates stay distinct',
  bonSecoursPostingKey !== sharedBoardPostingKey(
    'Phenom:careers.mercy.com/us/en:BSMMHPUSR289400EXTERNALENUS',
    'Mercy',
    'R289400',
    sharedPhenomTitle,
    '2026-11-02',
  ));
check('Phenom posting without a date has no shared key',
  sharedBoardPostingKey(
    'Phenom:careers.mercy.com/us/en:BSMMHPUSR289400EXTERNALENUS',
    'Mercy',
    'R289400',
    sharedPhenomTitle,
    null,
  ) === null);
check('Phenom shared requisition keys retain title identity',
  sharedBoardPostingKey(
    'Phenom:careers.mercy.com/us/en:BSMMHPUSR289400EXTERNALENUS',
    'Mercy',
    'R289400',
    'Different Program Manager Role',
    '2026-11-01',
  ) !== bonSecoursPostingKey);

if (failures) throw new Error(`${failures} Phenom parser check(s) failed`);

import { readFileSync } from 'node:fs';
import { parsePhenomConfig, parsePhenomResponse } from '../server/engine/phenom';

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

const config = parsePhenomConfig(
  '<title>Careers at Acme Corp</title><script>phApp.phAppConfig={"widgetApiEndpoint":"https://jobs.acme.com/widgets","refNum":"ACMEUS","locale":"en_us","siteType":"external","baseUrl":"https://jobs.acme.com/us/en/","pageName":"home"};</script>',
  'https://jobs.acme.com/us/en',
);
check('Phenom config is parsed from tenant page data', config?.refNum === 'ACMEUS'
  && config.locale === 'en_us' && config.siteType === 'external' && config.companyName === 'Acme Corp');

if (failures) throw new Error(`${failures} Phenom parser check(s) failed`);

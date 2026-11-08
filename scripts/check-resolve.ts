import { detect, namesAgree, resolveBoard } from '../server/engine/resolve';

let failures = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

async function main(): Promise<void> {
  const workday = detect(
    '<a href="https://cigna.wd5.myworkdayjobs.com/cignacareers">Search jobs</a>',
    'https://employer.example/careers',
  );
  check('detect Workday URL', workday.kind === 'board' && workday.ats === 'workday' && workday.slug === 'cigna/cignacareers');

  const greenhouse = detect(
    '<a href="https://boards.greenhouse.io/stripe">Open roles</a>',
    'https://employer.example/careers',
  );
  check('detect Greenhouse URL', greenhouse.kind === 'board' && greenhouse.ats === 'greenhouse' && greenhouse.slug === 'stripe');

  const icims = detect('<iframe src="https://careers-peraton.icims.com/jobs/search"></iframe>', 'https://employer.example/jobs');
  check('detect iCIMS host in HTML', icims.kind === 'board' && icims.ats === 'icims' && icims.slug === 'careers-peraton.icims.com');

  const icimsFinal = detect('<main>Current openings</main>', 'https://careers-peraton.icims.com/jobs/search');
  check('detect iCIMS host in final URL', icimsFinal.kind === 'board' && icimsFinal.ats === 'icims' && icimsFinal.slug === 'careers-peraton.icims.com');

  const icimsSharedHost = detect('<script src="https://cdn.icims.com/widget.js"></script>', 'https://employer.example/jobs');
  check('ignore shared iCIMS CDN host', icimsSharedHost.kind === 'none');

  const phenom = detect('<script src="https://careers.phenompeople.com/widget.js"></script>', 'https://employer.example/jobs');
  check('detect Phenom signature', phenom.kind === 'unreadable' && phenom.platform === 'Phenom');

  const oracle = detect(
    '<a href="https://egud.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions">Careers</a>',
    'https://employer.example/careers',
  );
  check('detect Oracle site number', oracle.kind === 'board' && oracle.ats === 'oracle' && oracle.slug === 'egud.fa.us2.oraclecloud.com/CX_1');

  check('detect no board or portal signature', detect('<main>Current openings</main>', 'https://employer.example/jobs').kind === 'none');

  const nameCases: [string, string, boolean][] = [
    ['Rush University Medical Center', 'rush', false],
    ['Inova Health Care Services', 'inova', false],
    ['Loyola University of Chicago', 'Loyola Marymount', false],
    ['OneUnited Bank', 'OneUnited Bank', true],
    ['World Wide Technology', 'WWT', false],
    ['Carver Bancorp Inc. (Carver Federal Savings Bank)', 'Carver Federal Savings Bank', true],
    ['Thompson Hospitality', 'Thompson Hospitality Corporation', true],
    ['Snorkel AI', 'Snorkel', true],
    ['CFA Institute', 'cfa', false],
    ['Trinity Health-Michigan', 'trinity', false],
    ['Stripe', 'Stripe, Inc.', true],
    ['Act 1 Group', 'ActOne Group', false],
  ];

  for (const [company, boardName, expected] of nameCases) {
    check(`namesAgree ${company} | ${boardName} = ${expected}`, namesAgree(company, boardName) === expected);
  }

  if (failures) throw new Error(`${failures} resolver unit check(s) failed`);

  const liveChecks: [string, string][] = [
    ['Accenture', 'https://www.accenture.com/us-en/careers'],
    ['Guidehouse', 'https://careers.guidehouse.com/'],
    ['Protiviti', 'https://www.protiviti.com/us-en/careers'],
    ['AutoZone', 'https://egud.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions?mode=location'],
    ['PwC', 'https://www.pwc.com/us/en/careers.html'],
    ['Mayo Clinic', 'https://www.mayoclinic.org/careers'],
  ];

  for (const [name, url] of liveChecks) {
    const result = await resolveBoard(name, url, Date.now() + 20_000);
    console.log(`[live] ${name} ${url} -> ${JSON.stringify(result)}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

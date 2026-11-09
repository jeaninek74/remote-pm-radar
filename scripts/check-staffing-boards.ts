import { REFRESH } from '../server/config';
import { jobPostingFrom } from '../server/engine/careers';
import {
  haleySalary,
  haleyPostingLink,
  haleyRoleLinks,
  haleySitemapJobs,
  normalizeHaleySitemapUrl,
  parseHaleySitemapXml,
} from '../server/engine/haley';
import { resolveBoard, detect } from '../server/engine/resolve';
import { fetchBoard } from '../server/engine/sources';
import { parseZenopleJson, zenopleLocations } from '../server/engine/zenople';
import { parseSalaryFromText, parseUsdBaseSalary } from '../server/engine/salary';
import {
  avionte,
  avionteApplyUrl,
  avionteBoardUrl,
  avionteCoordinates,
  avionteDescriptionUrl,
  avionteLocations,
  avionteSalary,
  parseAvionteJobPosts,
} from '../server/engine/avionte';
import {
  crelate,
  crelateApplyUrl,
  crelateJobRouteId,
  crelateLocationFields,
  crelatePortalSlug,
  crelateSalary,
  extractCrelateOrgId,
} from '../server/engine/crelate';
import { evaluateLocation } from '../server/engine/location';
import type { Ats, EmployerRow } from '../server/engine/types';

let failures = 0;

function check(label: string, passed: boolean): void {
  if (passed) console.log(`PASS ${label}`);
  else {
    console.error(`FAIL ${label}`);
    failures += 1;
  }
}

function employer(ats: Ats, slug: string, name: string, careersUrl: string | null = null): EmployerRow {
  return {
    id: -1,
    ats,
    slug,
    name,
    industry: null,
    company_size: null,
    hq_state: null,
    careers_url: careersUrl,
    black_owned: false,
    ownership_status: 'Not researched',
    ownership_source: null,
    last_searched_at: null,
    last_resolve_at: null,
    active: true,
  };
}

async function main(): Promise<void> {
  const sampleUrl = 'https://jobs.example.com/jb/Molding-Operator-2nd-Shift-Jobs-in-Dallas-North-Carolina/14174583';
  const sample = haleyPostingLink(sampleUrl);
  check('Haley URL slug yields title and numeric id', sample?.title === 'Molding Operator 2nd Shift' && sample.id === '14174583');

  const sitemapIndex = parseHaleySitemapXml(
    '<sitemapindex><sitemap><loc>http://jobs.example.com/jobs-a.xml</loc></sitemap><sitemap><loc>https://jobs.example.com/jobs-b.xml</loc></sitemap></sitemapindex>',
  );
  check('Haley sitemap index exposes child maps', sitemapIndex.kind === 'sitemapindex'
    && sitemapIndex.locations.length === 2
    && sitemapIndex.locations[0] === 'http://jobs.example.com/jobs-a.xml');
  const unsafeSitemapIndex = parseHaleySitemapXml(
    '<sitemapindex><sitemap><loc>http://169.254.169.254/latest/meta-data/</loc></sitemap></sitemapindex>',
  );
  check('Haley drops an IP-literal sitemap child',
    normalizeHaleySitemapUrl(unsafeSitemapIndex.locations[0], 'https://jobs.atwork.com/sitemap.xml', 'jobs.atwork.com') === null);
  const unsafePostingSitemap = parseHaleySitemapXml(
    '<urlset><url><loc>https://evil.example.org/jb/Manager-Jobs-in-Town-State/123</loc></url></urlset>',
  );
  check('Haley drops a posting URL on an unrelated domain',
    normalizeHaleySitemapUrl(unsafePostingSitemap.locations[0], 'https://jobs.atwork.com/jobs.xml', 'jobs.atwork.com') === null);
  const atworkPostingSitemap = parseHaleySitemapXml(
    '<urlset><url><loc>http://sacramento-jobs.atwork.com/jb/Manager-Jobs-in-Sacramento-California/123</loc></url></urlset>',
  );
  check('Haley keeps an AtWork city-subdomain posting',
    normalizeHaleySitemapUrl(atworkPostingSitemap.locations[0], 'https://jobs.atwork.com/jobs.xml', 'jobs.atwork.com')
      === 'https://sacramento-jobs.atwork.com/jb/Manager-Jobs-in-Sacramento-California/123');
  const salaryPosting = jobPostingFrom(
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Program Manager',
      description: 'A program manager role with no pay listed.',
      baseSalary: {
        currency: 'USD',
        value: { minValue: 90000, maxValue: 110000, unitText: 'YEAR' },
      },
    })}</script>`,
  );
  const structuredSalary = salaryPosting
    ? haleySalary(salaryPosting, salaryPosting.description ?? '')
    : null;
  check('Haley prefers structured USD baseSalary over an empty description salary',
    structuredSalary?.min === 90000 && structuredSalary.max === 110000 && structuredSalary.interval === 'year');
  const decimalHourlySalary = parseSalaryFromText('USD 43.27 per hour');
  check('Salary parser preserves decimal hourly pay and annualizes it',
    decimalHourlySalary?.hourlyRate === 43.27 && decimalHourlySalary.min === 90002 && decimalHourlySalary.interval === 'hour');
  const decimalHourlyRange = parseSalaryFromText('USD 43.27 - USD 50.5 per hour');
  check('Salary parser handles a fractional hourly range',
    decimalHourlyRange?.hourlyRate === 43.27
      && decimalHourlyRange.min === 90002
      && decimalHourlyRange.max === 105040
      && decimalHourlyRange.interval === 'hour');
  const structuredHourlySalary = parseUsdBaseSalary(
    { currency: 'USD', value: { value: 43.27, unitText: 'HOUR' } },
    'Staffing board test',
  );
  check('Structured hourly baseSalary keeps cents and clears the $90K threshold',
    structuredHourlySalary?.hourlyRate === 43.27
      && structuredHourlySalary.min === 90002
      && structuredHourlySalary.interval === 'hour');

  const doubleEncoded = JSON.stringify(JSON.stringify({ TotalCount: 31, Data: [{ jobId: 782971 }] }));
  const zenopleParsed = parseZenopleJson(doubleEncoded) as { TotalCount?: number; Data?: { jobId?: number }[] };
  check('Zenople double-encoded JSON parses twice', zenopleParsed.TotalCount === 31 && zenopleParsed.Data?.[0]?.jobId === 782971);
  check('Zenople omits location when address fields are empty',
    zenopleLocations('', '', '').length === 0);

  const crelateOrgId = extractCrelateOrgId('<script>var ORG_ID = "3600ab03-62d7-4fba-f7bd-f95ed188dd08";</script>');
  check('Crelate extracts ORG_ID from portal HTML',
    crelateOrgId === '3600ab03-62d7-4fba-f7bd-f95ed188dd08');
  const escapedCrelateSource = String.raw`<script>{"url":"https:\/\/jobs.crelate.com\/portal\/abacuscorporation\/job\/98n1kq5y8867trmbj6ue99cx3r"}</script>`;
  const escapedCrelateDetection = detect(escapedCrelateSource, 'https://www.example.com/');
  check('Crelate detection extracts slug from escaped inline URLs',
    crelateDetectionCheck(escapedCrelateDetection, 'abacuscorporation'));
  check('Crelate general-apply route is ignored',
    crelatePortalSlug('https://jobs.crelate.com/portal/job/apply/general') === null);
  check('Crelate detection requires the exact jobs.crelate.com host',
    crelatePortalSlug('https://notjobs.crelate.com/portal/decoy') === null);
  const crelatePriority = detect(
    '<a href="https://jobs.crelate.com/portal/abacuscorporation">Jobs</a><a href="https://jobs.lever.co/acme">Careers</a>',
    'https://www.acme.com/',
  );
  check('Lever keeps priority over Crelate detection',
    crelatePriority.kind === 'board' && crelatePriority.ats === 'lever');
  check('Crelate posting route uses Url and falls back to JobCode',
    crelateJobRouteId({ Url: '/gqq357cn7rz8yu733mns184deo', JobCode: 'fallback' }) === 'gqq357cn7rz8yu733mns184deo'
      && crelateJobRouteId({ Url: '', JobCode: 'fallback' }) === 'fallback'
      && crelateApplyUrl('broekemagroup', 'gqq357cn7rz8yu733mns184deo')
        === 'https://jobs.crelate.com/portal/broekemagroup/job/gqq357cn7rz8yu733mns184deo');
  const emptyCrelateAddress = crelateLocationFields({ City: '', State: '', PostalCode: '' });
  check('Crelate empty address yields no locations', emptyCrelateAddress.locations.length === 0);
  const nonUsCrelateLocation = crelateLocationFields({
    City: 'Toronto',
    State: 'ON',
    Country: 'United States',
    IsUsJob: false,
  });
  const nonUsCrelateVerdict = evaluateLocation({
    locations: nonUsCrelateLocation.locations,
    restrictions: nonUsCrelateLocation.restrictions,
    workplaceType: 'remote',
  });
  check('Crelate IsUsJob=false is represented as non-US',
    nonUsCrelateLocation.restrictions.includes('Outside the United States')
      && nonUsCrelateVerdict.ca === 'not_us');
  const crelateAnnualSalary = crelateSalary({ CompensationMinimum: 85000, CompensationMaximum: 95000 });
  const crelateHourlySalary = crelateSalary({ CompensationMinimum: 20, CompensationMaximum: 25 });
  const crelateMaxOnlyAnnual = crelateSalary({ CompensationMaximum: 125000 });
  const crelateMaxOnlyHourly = crelateSalary({ CompensationMaximum: 25 });
  check('Crelate numeric salary uses annual and hourly thresholds',
    crelateAnnualSalary?.min === 85000 && crelateAnnualSalary.max === 95000 && crelateAnnualSalary.interval === 'year'
      && crelateHourlySalary?.hourlyRate === 20 && crelateHourlySalary.min === 41600
      && crelateHourlySalary.max === 52000 && crelateHourlySalary.interval === 'hour');
  check('Crelate maximum-only pay retains a null minimum',
    crelateMaxOnlyAnnual?.min === null && crelateMaxOnlyAnnual.max === 125000
      && crelateMaxOnlyHourly?.min === null && crelateMaxOnlyHourly.max === 52000
      && crelateMaxOnlyHourly.interval === 'hour' && crelateMaxOnlyHourly.hourlyRate === 25);
  const avionteDictPosts = parseAvionteJobPosts({
    jobPosts: { dictId: { jobTitle: 'Project Manager' } },
  });
  const avionteArrayPosts = parseAvionteJobPosts({
    jobPosts: [{ jobPostIdEnc: 'arrayId', jobTitle: 'Program Manager' }],
  });
  check('Avionté parses dictionary and array jobPosts',
    avionteDictPosts?.[0]?.jobPostIdEnc === 'dictId' && avionteArrayPosts?.[0]?.jobPostIdEnc === 'arrayId');
  const avionteHourlySalary = avionteSalary({ pay: 23 });
  const avionteAnnualSalary = avionteSalary({ pay: 75000 });
  const avionteRangeSalary = avionteSalary({ pay: 0, payMin: 50000, payMax: 70000 });
  const avionteMaxOnlyAnnual = avionteSalary({ pay: 0, payMin: 0, payMax: 90000 });
  const avionteMaxOnlyHourly = avionteSalary({ pay: 0, payMin: 0, payMax: 25 });
  check('Avionté interprets hourly and annual pay without a list cap',
    avionteHourlySalary?.hourlyRate === 23 && avionteHourlySalary.min === 47840
      && avionteHourlySalary.interval === 'hour'
      && avionteAnnualSalary?.min === 75000 && avionteAnnualSalary.interval === 'year'
      && avionteRangeSalary?.min === 50000 && avionteRangeSalary.max === 70000);
  check('Avionté maximum-only pay retains a null minimum',
    avionteMaxOnlyAnnual?.min === null && avionteMaxOnlyAnnual.max === 90000
      && avionteMaxOnlyHourly?.min === null && avionteMaxOnlyHourly.max === 52000
      && avionteMaxOnlyHourly.interval === 'hour' && avionteMaxOnlyHourly.hourlyRate === 25);
  const avionteAppUrl = 'https://hire.myavionte.com/app/careers/#/jobs/KAUX5Mf_j8U/AwoomZzUrHY//';
  const avionteAppDetection = detect('', avionteAppUrl);
  check('Avionté app URL yields board coordinates',
    avionteAppDetection.kind === 'board' && avionteAppDetection.ats === 'avionte'
      && avionteAppDetection.slug === 'KAUX5Mf_j8U/AwoomZzUrHY');
  const avionteStandalone = detect(
    '<a href="https://hire.myavionte.com/sonar/v2/careers/integrations/standalone/general?jbId=AwoomZzUrHY&amp;bId=KAUX5Mf_j8U&amp;rpid=general">Apply</a>',
    'https://www.example.com/',
  );
  check('Avionté standalone URL accepts query parameters in either order',
    avionteStandalone.kind === 'board' && avionteStandalone.ats === 'avionte'
      && avionteStandalone.slug === 'KAUX5Mf_j8U/AwoomZzUrHY');
  const avionteWix = detect(
    String.raw`<iframe src="https:\/\/hire.mycompas.com\/sonar\/v2\/careers\/integrations\/wix\/iframe?bId=FzjD360eJnY&jbId=daugKlPwBRs"></iframe>`,
    'https://www.example.com/',
  );
  check('Avionté detects direct coordinates in a MyCompas Wix iframe',
    avionteWix.kind === 'board' && avionteWix.ats === 'avionte'
      && avionteWix.slug === 'FzjD360eJnY/daugKlPwBRs');
  check('Avionté URL builders retain board context and description path',
    avionteApplyUrl('KAUX5Mf_j8U', 'AwoomZzUrHY', 'hlrXAAkS3ok')
      === 'https://hire.myavionte.com/app/careers/#/jobs/KAUX5Mf_j8U/AwoomZzUrHY/hlrXAAkS3ok/'
      && avionteDescriptionUrl('hlrXAAkS3ok')
        === 'https://hire.myavionte.com/sonar/v2/jobBoard/jobPost/hlrXAAkS3ok/description'
      && avionteBoardUrl('KAUX5Mf_j8U', 'AwoomZzUrHY')
        === 'https://hire.myavionte.com/app/careers/#/jobs/KAUX5Mf_j8U/AwoomZzUrHY//');
  check('Avionté US locations include country and empty locations stay empty',
    avionteLocations('addison, TX', '75001').join(' ') === 'addison, TX, 75001, United States'
      && avionteLocations('', '').length === 0);

  const haleyDetection = detect(
    '<script src="https://cdn.haleymarketing.com/assets/board.js"></script><a href="https://jobs.penmac.com/">Jobs</a>',
    'https://www.penmac.com/',
  );
  check('Haley CDN signature identifies linked job-board host',
    haleyDetection.kind === 'board' && haleyDetection.ats === 'haley' && haleyDetection.slug === 'jobs.penmac.com');
  const zenopleDetection = detect('', 'https://laborworks.zenople.com/job-portal/LBW');
  check('Zenople portal URL yields tenant and organization',
    zenopleDetection.kind === 'board' && zenopleDetection.ats === 'zenople' && zenopleDetection.slug === 'laborworks/LBW');
  check('Zenople ESG Azure variant is ignored',
    detect('', 'https://laborworks.zenople.esgazure.com/job-portal/LBW').kind !== 'board');
  check('Ordinary platform words do not identify unreadable boards',
    detect(
      'Exact Staff is phenomenal; the phenomenon; a rippling effect; we use UKG',
      'https://www.example.com/',
    ).kind === 'none');
  const phenomDetection = detect(
    '<script src="https://cdn.phenompeople.com/x.js"></script>',
    'https://www.example.com/',
  );
  check('Phenom CDN signature is unreadable',
    phenomDetection.kind === 'unreadable' && phenomDetection.platform === 'Phenom');
  const ukgDetection = detect('', 'https://recruiting.ultipro.com/ABC1000/JobBoard/xyz');
  check('UltiPro URL signature is unreadable',
    ukgDetection.kind === 'unreadable' && ukgDetection.platform === 'UKG/UltiPro');
  const ripplingDetection = detect('', 'https://ats.rippling.com/acme/jobs');
  check('Rippling ATS URL signature is unreadable',
    ripplingDetection.kind === 'unreadable' && ripplingDetection.platform === 'Rippling');
  const leverDetection = detect(
    '<a href="https://jobs.lever.co/acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Lever link keeps existing ATS detection priority',
    leverDetection.kind === 'board' && leverDetection.ats === 'lever');
  const ashbyDetection = detect(
    '<a href="https://jobs.ashbyhq.com/acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Ashby link keeps existing ATS detection priority',
    ashbyDetection.kind === 'board' && ashbyDetection.ats === 'ashby');
  const smartRecruitersDetection = detect(
    '<a href="https://careers.smartrecruiters.com/Acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('SmartRecruiters link keeps existing ATS detection priority',
    smartRecruitersDetection.kind === 'board' && smartRecruitersDetection.ats === 'smartrecruiters');
  const unrelatedJobHost = detect(
    '<a href="https://jobs.example.org/">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Haley fallback ignores an unrelated jobs host',
    unrelatedJobHost.kind !== 'board' || unrelatedJobHost.ats !== 'haley');
  const penmacLink = detect(
    '<a href="https://jobs.penmac.com/">Jobs</a>',
    'https://www.penmac.com/',
  );
  check('Haley fallback accepts a job host on the same registrable domain',
    penmacLink.kind === 'board' && penmacLink.ats === 'haley' && penmacLink.slug === 'jobs.penmac.com');

  const originalFetch = globalThis.fetch;
  let avionteDescriptionRequests = 0;
  let avionteDescriptionHeadersOk = false;
  let avionteDescriptionMode: 'content' | 'failure' | 'empty' = 'content';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.hostname === 'hire.myavionte.com' && url.pathname === '/app/careers/') {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.hostname === 'hire.myavionte.com' && url.pathname === '/sonar/v2/jobBoard/fixtureB/fixtureJ') {
      return new Response(JSON.stringify({
        socialName: 'Fixture Agency',
        jobPosts: {
          'fixture-job': {
            jobPostIdEnc: 'fixture-job',
            jobTitle: 'Project Manager',
            location: 'Austin, TX',
            zip: '78701',
            postDateUtc: '2026-01-01T00:00:00Z',
            payMin: 90000,
            payMax: 100000,
            jobType: 'Permanent',
          },
        },
        pageSize: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.hostname === 'hire.myavionte.com' && url.pathname === '/sonar/v2/jobBoard/emptyB/emptyJ') {
      return new Response(JSON.stringify({ jobPosts: {}, pageSize: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.hostname === 'hire.myavionte.com' && url.pathname === '/sonar/v2/jobBoard/jobPost/fixture-job/description') {
      avionteDescriptionRequests += 1;
      const headers = new Headers(init?.headers);
      avionteDescriptionHeadersOk = headers.get('x-compas-careers-buildidenc') === 'fixtureB'
        && headers.get('x-compas-careers-jobboardidenc') === 'fixtureJ';
      if (avionteDescriptionMode === 'failure') {
        return new Response('Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({
        description: avionteDescriptionMode === 'empty'
          ? ''
          : avionteDescriptionHeadersOk
            ? '<p>Fully remote project manager role in the United States.</p>'
            : '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.hostname === 'jobs.crelate.com' && url.pathname === '/portal/fixture/') {
      return new Response('<script>var ORG_ID = "22222222-2222-4222-8222-222222222222";</script>', { status: 200 });
    }
    if (url.hostname === 'jobs.crelate.com' && url.pathname === '/portal/empty/') {
      return new Response('<script>var ORG_ID = "11111111-1111-4111-8111-111111111111";</script>', { status: 200 });
    }
    if (url.hostname === 'jobs.crelate.com' && url.pathname === '/api/candidateportal/GetAllJobs') {
      const requestEnvelope = JSON.parse(url.searchParams.get('requestEnvelope') ?? '{}') as { OrganizationId?: string };
      const jobs = requestEnvelope.OrganizationId === '22222222-2222-4222-8222-222222222222'
        ? [{
          Id: 'fixture-guid',
          Title: 'Project Manager',
          Description: '<p>Remote project manager role in the United States.</p>',
          LastPostedOnDate: '2026-01-01',
          Url: '/fixture-route',
          JobCode: 'fixture-code',
        }]
        : [];
      return new Response(JSON.stringify({ Jobs: jobs, IsError: false, ErrorMessage: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const freshCrelate = await crelate(
      employer('crelate', 'fixture', 'Fixture', 'https://jobs.crelate.com/portal/fixture/'),
    );
    check('Crelate last-posted dates remain unconfirmed',
      freshCrelate.jobs[0]?.postedAt === '2026-01-01' && freshCrelate.jobs[0]?.postedConfidence === 'unknown');
    const knownCrelate = await crelate(
      employer('crelate', 'fixture', 'Fixture', 'https://jobs.crelate.com/portal/fixture/'),
      new Set(['crelate:fixture:fixture-route']),
    );
    check('Crelate skips known postings without reading their details',
      knownCrelate.ok && knownCrelate.jobs.length === 1 && knownCrelate.jobs[0].unchanged === true
        && !knownCrelate.jobs[0].descriptionText);
    const emptyCrelate = await resolveBoard('Empty', 'https://jobs.crelate.com/portal/empty/', Date.now() + 5000);
    check('Crelate empty Jobs response falls through instead of validating a board',
      emptyCrelate.kind === 'unknown');
    const fixtureAvionteEmployer = employer(
      'avionte',
      'fixtureB/fixtureJ',
      'Fixture Agency',
      'https://hire.myavionte.com/app/careers/#/jobs/fixtureB/fixtureJ//',
    );
    const fixtureAvionte = await fetchBoard(fixtureAvionteEmployer);
    check('Avionté description requests include board headers and retain description content',
      fixtureAvionte.ok && fixtureAvionte.jobs.length === 1
        && fixtureAvionte.jobs[0].descriptionText?.includes('Fully remote') === true
        && avionteDescriptionRequests === 1 && avionteDescriptionHeadersOk);
    check('Avionté post dates are confirmed',
      fixtureAvionte.jobs[0]?.postedAt === '2026-01-01'
        && fixtureAvionte.jobs[0]?.postedConfidence === 'confirmed');
    avionteDescriptionRequests = 0;
    const knownAvionte = await avionte(
      fixtureAvionteEmployer,
      new Set(['avionte:fixtureB/fixtureJ:fixture-job']),
    );
    check('Avionté skips known postings before fetching descriptions',
      knownAvionte.ok && knownAvionte.jobs.length === 1
        && knownAvionte.jobs[0].unchanged === true && avionteDescriptionRequests === 0);
    avionteDescriptionMode = 'failure';
    const failedAvionte = await avionte(fixtureAvionteEmployer);
    check('Avionté skips failed description fetches and marks the board truncated',
      failedAvionte.ok && failedAvionte.jobs.length === 0
        && failedAvionte.truncated === true && avionteDescriptionRequests === 1);
    avionteDescriptionRequests = 0;
    avionteDescriptionMode = 'empty';
    const emptyDescriptionAvionte = await avionte(fixtureAvionteEmployer);
    check('Avionté keeps jobs with a genuine empty description',
      emptyDescriptionAvionte.ok && emptyDescriptionAvionte.jobs.length === 1
        && emptyDescriptionAvionte.jobs[0].descriptionHtml === null
        && emptyDescriptionAvionte.jobs[0].descriptionText === null
        && emptyDescriptionAvionte.truncated !== true);
    avionteDescriptionMode = 'content';
    const emptyAvionte = await resolveBoard(
      'Empty',
      'https://hire.myavionte.com/app/careers/#/jobs/emptyB/emptyJ//',
      Date.now() + 5000,
    );
    check('Avionté empty jobPosts response falls through instead of validating a board',
      emptyAvionte.kind === 'unknown');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const haleyBoards = [
    { host: 'jobs.penmac.com', name: 'Penmac' },
    { host: 'jobs.doherty.com', name: 'Doherty' },
    { host: 'jobs.atwork.com', name: 'AtWork' },
  ];
  for (const board of haleyBoards) {
    const company = employer('haley', board.host, board.name, `https://${board.host}/`);
    const [sitemap, result] = await Promise.all([
      haleySitemapJobs(board.host, Date.now() + REFRESH.employerBudgetMs),
      fetchBoard(company),
    ]);
    const titleMatched = haleyRoleLinks(sitemap.urls, company).length;
    check(`Haley ${board.host} read succeeds`, result.ok);
    check(`Haley ${board.host} lists sitemap URLs`, result.ok && result.totalListed === sitemap.urls.length && result.totalListed > 0);
    check(`Haley ${board.host} has title matches`, titleMatched > 0);
    const rawJob = result.jobs.find((job) => job.postedAt && job.locations.length);
    check(`Haley ${board.host} sample has postedAt and location`, !!rawJob);
    console.log(`LIVE haley ${board.host} totalListed=${result.totalListed} titleMatched=${titleMatched} detailRead=${result.jobs.length} truncated=${result.truncated === true}`);
    if (rawJob) {
      console.log(`SAMPLE haley ${board.host} ${JSON.stringify({
        source: rawJob.source,
        ats: rawJob.ats,
        board: rawJob.board,
        externalId: rawJob.externalId,
        company: rawJob.company,
        title: rawJob.title,
        locations: rawJob.locations,
        postedAt: rawJob.postedAt,
        applyUrl: rawJob.applyUrl,
        salary: rawJob.salary,
      })}`);
    }
  }

  const zenopleBoards = [
    { tenant: 'laborworks', organization: 'LBW', name: 'LaborWorks' },
    { tenant: 'beginright', organization: 'BR', name: 'Begin Right' },
    { tenant: 'gillmann', organization: 'GL', name: 'Gillmann Services' },
  ];
  for (const board of zenopleBoards) {
    const slug = `${board.tenant}/${board.organization}`;
    const result = await fetchBoard(employer('zenople', slug, board.name, `https://${board.tenant}.zenople.com/job-portal/${board.organization}`));
    check(`Zenople ${slug} read succeeds`, result.ok);
    check(`Zenople ${slug} reads TotalCount`, result.ok && result.uniqueRead === result.totalListed && !result.truncated);
    console.log(`LIVE zenople ${slug} totalListed=${result.totalListed} totalRead=${result.uniqueRead ?? 0} titleMatched=${result.jobs.length} truncated=${result.truncated === true}`);
  }

  const avionteBoards = [
    { bId: 'KAUX5Mf_j8U', jbId: 'AwoomZzUrHY', name: 'ASAP Personnel', expectedListed: 20 },
    { bId: 'FzjD360eJnY', jbId: 'daugKlPwBRs', name: 'Ascend Talent Solutions', expectedListed: 180 },
  ];
  for (const board of avionteBoards) {
    const slug = `${board.bId}/${board.jbId}`;
    const result = await fetchBoard(employer('avionte', slug, board.name, avionteBoardUrl(board.bId, board.jbId)));
    const withSalary = result.jobs.filter((job) => job.salary).length;
    const withDescription = result.jobs.filter((job) => Boolean(job.descriptionText?.trim())).length;
    check(`Avionté ${board.name} read succeeds`, result.ok && result.totalListed === board.expectedListed);
    console.log(`LIVE avionte ${board.name} listed=${result.totalListed} titleMatched=${result.jobs.length} withDescription=${withDescription} withSalary=${withSalary} truncated=${result.truncated === true}`);
  }

  const crelateBoards = [
    { slug: 'broekemagroup', name: 'Broekema Group', url: 'https://jobs.crelate.com/portal/broekemagroup/' },
    { slug: 'abacuscorporation', name: 'Abacus Corporation', url: 'https://jobs.crelate.com/portal/abacuscorporation/' },
  ];
  for (const board of crelateBoards) {
    const company = employer('crelate', board.slug, board.name, board.url);
    const result = await fetchBoard(company);
    const withSalary = result.jobs.filter((job) => job.salary).length;
    const withDescription = result.jobs.filter((job) => Boolean(job.descriptionText?.trim())).length;
    const remoteKept = result.jobs.filter((job) => {
      const verdict = evaluateLocation({
        locations: job.locations,
        workplaceType: job.workplaceType,
        isRemote: job.isRemote,
        restrictions: job.restrictions,
        description: job.descriptionText,
        title: job.title,
      });
      return verdict.remote === 'remote' && verdict.ca !== 'not_us' && !verdict.travelHeavy;
    }).length;
    check(`Crelate ${board.slug} read succeeds`, result.ok && result.totalListed > 0);
    check(`Crelate ${board.slug} has title matches`, result.jobs.length > 0);
    console.log(`LIVE crelate ${board.slug} listed=${result.totalListed} titleMatched=${result.jobs.length} withSalary=${withSalary} withDescription=${withDescription} remoteKept=${remoteKept}`);
    if (board.slug === 'abacuscorporation') {
      const resolution = await resolveBoard('Abacus Corporation', 'https://abacusonline.jobs/', Date.now() + REFRESH.employerBudgetMs);
      check('Resolver detects Crelate from Abacus inline homepage data',
        resolution.kind === 'board' && resolution.ats === 'crelate' && resolution.slug === 'abacuscorporation');
      console.log(`LIVE resolver https://abacusonline.jobs/ ${JSON.stringify(resolution)}`);
    }
  }

  const resolverChecks = [
    { name: 'Penmac', url: 'https://www.penmac.com/', ats: 'haley' as const, slug: 'jobs.penmac.com' },
    { name: 'Doherty', url: 'https://www.doherty.com/', ats: 'haley' as const, slug: 'jobs.doherty.com' },
    { name: 'LaborWorks', url: 'https://laborworks.com/', ats: 'zenople' as const, slug: 'laborworks/LBW' },
    { name: 'Begin Right', url: 'https://beginright.com/', ats: 'zenople' as const, slug: 'beginright/BR' },
  ];
  for (const expected of resolverChecks) {
    const result = await resolveBoard(expected.name, expected.url, Date.now() + 45_000);
    const passed = result.kind === 'board' && result.ats === expected.ats && result.slug === expected.slug;
    check(`Resolver ${expected.url} -> ${expected.ats}:${expected.slug}`, passed);
    console.log(`LIVE resolver ${expected.url} ${JSON.stringify(result)}`);
  }

  if (failures) {
    console.error(`FAILED ${failures} staffing-board check(s)`);
    process.exitCode = 1;
  } else {
    console.log('All staffing-board checks passed.');
  }
}

function crelateDetectionCheck(detection: ReturnType<typeof detect>, slug: string): boolean {
  return detection.kind === 'board' && detection.ats === 'crelate' && detection.slug === slug;
}

void main();

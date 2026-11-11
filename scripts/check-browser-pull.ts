import {
  careersPostingUrl,
  careersExternalId,
  fetchCareersPage,
  isBrowserCareersPostingLink,
  rawJobFromRenderedCareersPage,
  rawJobFromCareersPage,
  sameCareerSite,
  sweepCareersPostingLinks,
} from '../server/engine/careers';
import {
  browserPullAllowsClosure,
  shouldCloseMissing,
  SWEEP_EMPLOYER_WHERE,
} from '../server/engine/ingest';
import {
  buildBrowserPayloadChunks,
  browserIngestAuthStatus,
  browserJobKey,
  browserJobsFromPages,
  isBrowserIngestPayload,
} from '../server/engine/browser-pull';
import { fetchBoard } from '../server/engine/sources';
import type { EmployerRow } from '../server/engine/types';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

const employer: EmployerRow = {
  id: 1,
  slug: 'example.test/careers',
  ats: 'manual',
  name: 'Example Agency',
  industry: 'Staffing',
  company_size: 'Small',
  hq_state: 'TX',
  careers_url: 'https://example.test/careers',
  black_owned: false,
  ownership_status: 'Not researched',
  ownership_source: null,
  last_searched_at: null,
  last_resolve_at: null,
  active: true,
};

async function main(): Promise<void> {
  check('browser ingest token is disabled when unset',
    browserIngestAuthStatus(undefined, undefined) === 404);
  check('browser ingest rejects a wrong token',
    browserIngestAuthStatus('Bearer wrong-test-token', 'test-only-token') === 401);
  check('browser ingest accepts the configured bearer token',
    browserIngestAuthStatus('Bearer test-only-token', 'test-only-token') === 200);
  check('browser ingest payload validates required fields',
    isBrowserIngestPayload({
      employerId: 1,
      complete: true,
      timedOut: false,
      listedUrls: [],
      pages: [],
    }));
  check('regular sweep excludes browser employers',
    SWEEP_EMPLOYER_WHERE.includes("ats <> 'browser'"));
  const browserResult = await fetchBoard({ ...employer, ats: 'browser' });
  check('fetchBoard leaves browser employers for the browser pull',
    !browserResult.ok && browserResult.retryable === true
      && browserResult.error === 'browser employer: read by browser pull');
  check('browser pulls close missing jobs only when complete and not timed out',
    !browserPullAllowsClosure(false, false, 1)
      && !browserPullAllowsClosure(true, true, 1)
      && browserPullAllowsClosure(true, false, 1));
  check('browser pulls never close missing jobs when no links were listed',
    !browserPullAllowsClosure(true, false, 0));
  check('truncated results and a disabled closure gate never close jobs',
    !shouldCloseMissing({ ok: true, jobs: [], totalListed: 0, truncated: true }, true)
      && !shouldCloseMissing({ ok: true, jobs: [], totalListed: 0 }, false));
  const chunked = buildBrowserPayloadChunks(
    1,
    true,
    false,
    ['https://example.test/jobs/1', 'https://example.test/jobs/oversized', 'https://example.test/jobs/2'],
    [
      { url: 'https://example.test/jobs/1', linkText: 'View', html: 'a'.repeat(80) },
      { url: 'https://example.test/jobs/oversized', linkText: 'View', html: 'b'.repeat(600) },
      { url: 'https://example.test/jobs/2', linkText: 'View', html: 'c'.repeat(80) },
    ],
    400,
  );
  const chunkedPages = chunked.chunks.flatMap((chunk) => chunk.pages);
  check('oversized browser pages are skipped while other pages and listed URLs are chunked',
    !chunked.complete
      && chunked.skippedUrls.length === 1
      && chunked.skippedUrls[0] === 'https://example.test/jobs/oversized'
      && chunkedPages.length === 2
      && chunkedPages.every((page) => page.url !== 'https://example.test/jobs/oversized')
      && chunked.chunks.at(-1)?.listedUrls.length === 3
      && chunked.chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk)) <= 400));
  const browserEmployer: EmployerRow = { ...employer, ats: 'browser' };
  const knownUrl = 'https://example.test/job/req-123456';
  const knownBrowserJobs = browserJobsFromPages(
    browserEmployer,
    new Set([browserJobKey(browserEmployer, knownUrl)]),
    [knownUrl],
    [],
  );
  check('listed known browser URLs become unchanged RawJobs',
    knownBrowserJobs.length === 1
      && knownBrowserJobs[0].source === `browser:${browserEmployer.slug}`
      && knownBrowserJobs[0].externalId === '/job/req-123456'
      && knownBrowserJobs[0].unchanged === true);
  const renderedPageUrl = 'https://example.test/jobs/4522548';
  const renderedBrowserJobs = browserJobsFromPages(
    browserEmployer,
    new Set(),
    [],
    [{
      url: renderedPageUrl,
      linkText: 'View',
      html: '<html><body><h1>Senior Project Manager</h1></body></html>',
    }],
  );
  check('server browser parsing gets a role title from rendered detail HTML',
    renderedBrowserJobs.length === 1
      && renderedBrowserJobs[0].title === 'Senior Project Manager'
      && renderedBrowserJobs[0].applyUrl === renderedPageUrl);
  const gatewayBrowserJobs = browserJobsFromPages(
    { ...browserEmployer, careers_url: 'https://gatewaypersonnel.com/search-jobs' },
    new Set(),
    [],
    [{
      url: 'https://www.gatewaypersonnel.com/Job-board?cjobid=JH185465117&rpid=1756745&postid=aOZ3eGITWek',
      linkText: 'View',
      html: '<html><body><h1>Senior Project Manager</h1></body></html>',
    }],
  );
  check('server browser parser accepts Gateway query-ID routes with a rendered title',
    gatewayBrowserJobs.length === 1
      && gatewayBrowserJobs[0].title === 'Senior Project Manager'
      && gatewayBrowserJobs[0].externalId
        === 'https://www.gatewaypersonnel.com/Job-board?cjobid=JH185465117&rpid=1756745&postid=aOZ3eGITWek');

  check(
    'careers external ID uses the same-origin path and query',
    careersExternalId('https://example.test', 'https://example.test/jobs/req-123456?site=main')
      === '/jobs/req-123456?site=main',
  );
  check(
    'careers external ID keeps a cross-host URL',
    careersExternalId('https://example.test', 'https://jobs.vendor.test/job/req-123456')
      === 'https://jobs.vendor.test/job/req-123456',
  );
  check('browser links treat www and bare hosts as the same careers site',
    sameCareerSite('www.gatewaypersonnel.com', 'gatewaypersonnel.com'));
  const gatewayPostingUrl = 'https://www.gatewaypersonnel.com/Job-board?cjobid=JH185465117&rpid=1756745&postid=aOZ3eGITWek';
  check('browser links recognize query-string cjobid and postid posting keys',
    isBrowserCareersPostingLink(gatewayPostingUrl, 'View')
      && careersExternalId('https://gatewaypersonnel.com', gatewayPostingUrl) === gatewayPostingUrl);
  check('ordinary careers sweep does not adopt browser-only query posting keys',
    sweepCareersPostingLinks(`<a href="${gatewayPostingUrl}">View</a>`, 'https://gatewaypersonnel.com').length
      === 0);
  const searchStationUrl = 'https://searchstation.org/jobs/4522548';
  check('browser links accept generic View and Apply now labels',
    isBrowserCareersPostingLink(searchStationUrl, 'View')
      && isBrowserCareersPostingLink(`${searchStationUrl}/apply`, 'Apply now'));
  check('browser links inspect identified job details despite long card labels',
    isBrowserCareersPostingLink(
      'https://www.malonesolutions.com/job/906670-bilingual-staffing-specialist-spanish-english-louisville-kentucky/',
      'Bilingual Staffing Specialist (Spanish/English) Malone Louisville, Kentucky',
    ));
  check('browser links recognize opaque apply-job routes',
    isBrowserCareersPostingLink(
      'https://riderflex.applytojob.com/apply/fpsKcygg5k/Mental-Health-Therapist',
      'Mental Health Therapist',
    ));
  check('browser links recognize SPA hash routes with posting IDs',
    isBrowserCareersPostingLink(
      'https://aquinasconsulting.com/job-search#viewJob=Job-017988',
      'Share Job',
    ));
  const shareJobRoute = 'https://example.test/jobs/open-role';
  check('Share Job is generic only for browser careers links',
    isBrowserCareersPostingLink(shareJobRoute, 'Share Job')
      && sweepCareersPostingLinks(`<a href="${shareJobRoute}">Share Job</a>`, 'https://example.test').length
        === 0);
  check('browser links accept Learn More on identified job details',
    isBrowserCareersPostingLink(
      'https://www.pyramidcg.com/job-details/accounts-payable-coordinator-in-accounting-finance-jobs-1784168',
      'Learn More',
    ));
  check('browser links reject editorial Read more links',
    !isBrowserCareersPostingLink(
      'https://www.trctalent.com/top-5-companies-for-staffing-electrical-jobs-in-2025/',
      'Read more',
    ));
  check('browser links ignore apply forms with jobNumber metadata',
    !isBrowserCareersPostingLink(
      'https://apply.prologistix.com/Account/GeneralInfo?jobNumber=1300650&jobTitle=Material%20Handler',
      'Apply Now',
    ));
  check('browser links reject pagination and dated job reports',
    !isBrowserCareersPostingLink(
      'https://gatewaypersonnel.com/search-jobs/pager/2428456/page/1',
      '1',
    )
      && !isBrowserCareersPostingLink(
        'https://www.jjstaff.com/jobs-report/september-2026/',
        'Read Report',
      ));
  check('trailing apply variants collapse to the job posting URL',
    careersPostingUrl(`${searchStationUrl}/apply`) === searchStationUrl);
  check('apply fragments collapse while job-routing fragments are preserved',
    careersPostingUrl('https://bestinrecruiting.com/jobs/30917/#apply')
      === 'https://bestinrecruiting.com/jobs/30917/'
      && careersPostingUrl('https://aquinasconsulting.com/job-search#viewJob=Job-017988')
        === 'https://aquinasconsulting.com/job-search#viewJob=Job-017988');

  const origin = 'https://example.test';
  const source = `careers:${employer.slug}`;
  const url = `${origin}/job/req-123456`;
  const linkText = 'Program Manager';
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Program Manager',
    datePosted: '2026-11-01',
    description: '<p>Manage delivery programs for a remote team.</p>',
    jobLocationType: 'TELECOMMUTE',
    jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' } },
    employmentType: 'FULL_TIME',
    identifier: { value: 'req-123456' },
    url,
  })}</script><p>Manage delivery programs for a remote team.</p></html>`;
  const parsed = rawJobFromCareersPage(employer, source, origin, url, linkText, html);
  check('shared careers parser extracts a structured role posting', parsed?.title === 'Program Manager');
  const renderedTitle = rawJobFromRenderedCareersPage(
    employer,
    source,
    origin,
    `${origin}/jobs/4522548`,
    'View',
    '<html><head><title>Program Manager</title></head><body><h1>Program Manager</h1></body></html>',
  );
  check('browser parser gets the posting title from rendered h1/title text',
    renderedTitle?.title === 'Program Manager');
  check('browser parser rejects job-count search-result titles',
    rawJobFromRenderedCareersPage(
      employer,
      source,
      origin,
      `${origin}/jobs/q-project-manager`,
      'View',
      '<html><head><title>4632 operations manager jobs found</title></head><body><h1>4632 operations manager jobs found</h1></body></html>',
    ) === null);
  const noIdUrl = `${origin}/job/senior-program-manager/`;
  const noIdTitleHtml = '<html><body><h1>Senior Program Manager</h1></body></html>';
  check('browser parser uses a role title on a rendered job route without a numeric ID',
    rawJobFromRenderedCareersPage(employer, source, origin, noIdUrl, 'View', noIdTitleHtml)?.title
      === 'Senior Program Manager');
  check('ordinary careers parser keeps its posting-ID requirement',
    rawJobFromCareersPage(employer, source, origin, noIdUrl, 'Senior Program Manager', noIdTitleHtml)
      === null);
  check('shared careers parser rejects non-posting paths',
    rawJobFromCareersPage(employer, source, origin, `${origin}/news/123456`, linkText, html) === null);
  check('shared careers parser rejects non-posting link text',
    rawJobFromCareersPage(employer, source, origin, url, 'Read more', html) === null);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const requested = new URL(String(input));
    if (requested.href === employer.careers_url) {
      return new Response(`<a href="${url}">${linkText}</a>`, { status: 200 });
    }
    if (requested.pathname === '/sitemap.xml'
      || requested.pathname === '/sitemap_index.xml'
      || requested.pathname === '/jobs-sitemap.xml') {
      return new Response('<urlset></urlset>', { status: 200 });
    }
    if (requested.href === url) return new Response(html, { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  try {
    const result = await fetchCareersPage(employer);
    const fetched = result.jobs.find((job) => !job.unchanged) ?? null;
    check('fetchCareersPage preserves parity with the shared parser',
      result.ok && JSON.stringify(fetched) === JSON.stringify(parsed));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

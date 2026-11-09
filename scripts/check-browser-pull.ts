import {
  careersExternalId,
  fetchCareersPage,
  rawJobFromCareersPage,
} from '../server/engine/careers';
import {
  browserPullAllowsClosure,
  shouldCloseMissing,
  SWEEP_EMPLOYER_WHERE,
} from '../server/engine/ingest';
import {
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
    !browserPullAllowsClosure(false, false)
      && !browserPullAllowsClosure(true, true)
      && browserPullAllowsClosure(true, false));
  check('truncated results and a disabled closure gate never close jobs',
    !shouldCloseMissing({ ok: true, jobs: [], totalListed: 0, truncated: true }, true)
      && !shouldCloseMissing({ ok: true, jobs: [], totalListed: 0 }, false));
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

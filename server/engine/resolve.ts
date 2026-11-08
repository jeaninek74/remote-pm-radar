import type { Ats } from './types';
import { fetchIcimsText, forbiddenIcimsPath, icimsDetailUrl, icimsHost, icimsHostFrom, icimsSitemapJobs } from './icims';
import { jobPostingFrom } from './careers';
import { parseSuccessFactorsFeed } from './successfactors';

const PAGE_TIMEOUT_MS = 15_000;
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WORKDAY_URL = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^"'?#\s/]+)/i;
const UKG_URL = /https?:\/\/(recruiting2?\.ultipro\.com)\/([A-Za-z0-9]+)\/JobBoard\/([0-9a-f-]{36})/i;
const ATS_PATTERNS: { ats: Exclude<Ats, 'workday' | 'recruitee'>; re: RegExp }[] = [
  { ats: 'greenhouse', re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i },
  { ats: 'lever', re: /jobs\.lever\.co\/([a-z0-9-]+)/i },
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i },
  { ats: 'workable', re: /apply\.workable\.com\/([a-z0-9-]+)/i },
  { ats: 'smartrecruiters', re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)/i },
];

function oracleCoordinates(source: string): { host: string; site: string } | null {
  const normalized = source.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const urls = normalized.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.oraclecloud\.com)([^"'<>\\\s]*)/gi);
  for (const match of urls) {
    const host = match[1].toLowerCase();
    const pathAndQuery = match[2] ?? '';
    const pathSite = /\/sites\/([^/?#]+)/i.exec(pathAndQuery)?.[1];
    const finder = /[?&]finder=([^&#]+)/i.exec(pathAndQuery)?.[1] ?? '';
    let decodedFinder = finder;
    try {
      decodedFinder = decodeURIComponent(finder);
    } catch {
      decodedFinder = finder;
    }
    const finderSite = /siteNumber=([^,;&]+)/i.exec(decodedFinder)?.[1];
    const site = pathSite ?? finderSite;
    if (site) return { host, site };
  }
  return null;
}

const UNREADABLE_PLATFORMS: { platform: string; re: RegExp }[] = [
  { platform: 'Phenom', re: /phenompeople|phenom/i },
  { platform: 'SAP SuccessFactors', re: /successfactors|jobs\.sap\.com/i },
  { platform: 'Avature', re: /avature\.net/i },
  { platform: 'Oracle Cloud HCM', re: /oraclecloud\.com/i },
  { platform: 'Taleo', re: /taleo\.net/i },
  { platform: 'Eightfold', re: /eightfold\.ai/i },
  { platform: 'TalentBrew', re: /talentbrew|tbcdn/i },
  { platform: 'Paradox', re: /paradox\.ai/i },
  { platform: 'Dayforce', re: /dayforcehcm\.com/i },
  { platform: 'UKG/UltiPro', re: /ultipro\.com|\bukg\b/i },
  { platform: 'Jobvite', re: /jobvite\.com/i },
  { platform: 'ADP Workforce Now', re: /(?:workforcenow\.adp\.com|adp\.com\/workforcenow)/i },
  { platform: 'Cornerstone OnDemand', re: /csod\.com/i },
  { platform: 'Rippling', re: /rippling/i },
];

const NAME_NOISE = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|companies|group|holdings|plc|the|and|of)\b/g;

export type BoardDetection =
  | {
    kind: 'board';
    ats: Ats;
    slug: string;
    workday?: { tenant: string; wd: string; site: string };
    successFactors?: { host: string; company: string };
  }
  | { kind: 'unreadable'; platform: string }
  | { kind: 'none' };

export type BoardResolution =
  | { kind: 'board'; ats: Ats; slug: string; careersUrl: string; total: number }
  | { kind: 'unreadable'; platform: string }
  | { kind: 'unknown'; reason: string };

export function nameTokens(value: string): string[] {
  return value.toLowerCase().replace(/&/g, ' and ').replace(NAME_NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/**
 * A board belongs to the company only when the board's own account name agrees with the company
 * name. Multi-word names must have every word of the shorter name present in the longer one
 * ("Carver Federal Savings Bank" within "Carver Bancorp Inc. (Carver Federal Savings Bank)").
 */
export function namesAgree(company: string, boardName: string | null | undefined): boolean {
  if (!boardName) return false;
  const a = nameTokens(company);
  const b = nameTokens(boardName);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1) {
    if (long.length === 1) return short[0] === long[0];
    return long.length === 2 && long[0] === short[0] && short[0].length >= 6;
  }
  return short.every((token) => long.includes(token));
}

function taleoCoordinates(source: string): { host: string; section: string } | null {
  const normalized = source.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const matches = [...normalized.matchAll(/https?:\/\/([a-z0-9-]+\.taleo\.net)\/careersection\/([^/?#"'<>\\\s]+)/gi)]
    .map((match) => ({ host: match[1].toLowerCase(), section: match[2] }))
    .filter(({ section }) => !/^(?:iam|rest|jsp)$/i.test(section));
  matches.sort((a, b) => {
    const rank = (section: string) => /^(?:ex|2|10000)$/i.test(section) || /ext/i.test(section) ? 0 : 1;
    return rank(a.section) - rank(b.section);
  });
  return matches[0] ?? null;
}

function successFactorsCoordinates(source: string): { host: string; company: string } | null {
  const normalized = source.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  for (const match of normalized.matchAll(/https?:\/\/(career\d*\.successfactors\.(?:com|eu))[^"'<>\\\s]*/gi)) {
    try {
      const url = new URL(match[0]);
      const company = url.searchParams.get('company');
      if (company) return { host: url.hostname.toLowerCase(), company };
    } catch { /* ignore malformed career links */ }
  }
  return null;
}

function rmkHost(host: string): boolean {
  return !/\.successfactors\.(?:com|eu)$/i.test(host);
}

export function detect(html: string, finalUrl: string): BoardDetection {
  const finalIcimsHost = icimsHostFrom(finalUrl);
  if (finalIcimsHost) return { kind: 'board', ats: 'icims', slug: finalIcimsHost };
  const workdayMatch = WORKDAY_URL.exec(finalUrl) ?? WORKDAY_URL.exec(html);
  if (workdayMatch) {
    const tenant = workdayMatch[1].toLowerCase();
    const wd = workdayMatch[2].toLowerCase();
    const site = workdayMatch[3];
    return { kind: 'board', ats: 'workday', slug: `${tenant}/${site}`, workday: { tenant, wd, site } };
  }
  const ukgMatch = UKG_URL.exec(finalUrl) ?? UKG_URL.exec(html);
  if (ukgMatch) {
    const host = ukgMatch[1].toLowerCase();
    return { kind: 'board', ats: 'ukg', slug: `${host}/${ukgMatch[2]}/${ukgMatch[3]}` };
  }
  const taleo = taleoCoordinates(`${finalUrl}\n${html}`);
  if (taleo) return { kind: 'board', ats: 'taleo', slug: `${taleo.host}/${taleo.section}` };
  const successFactors = successFactorsCoordinates(`${finalUrl}\n${html}`);
  if (successFactors) {
    return {
      kind: 'board',
      ats: 'successfactors',
      slug: successFactors.host,
      successFactors,
    };
  }
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.re.exec(finalUrl) ?? pattern.re.exec(html);
    if (match) return { kind: 'board', ats: pattern.ats, slug: match[1].toLowerCase() };
  }
  const oracle = oracleCoordinates(finalUrl) ?? oracleCoordinates(html);
  if (oracle) return { kind: 'board', ats: 'oracle', slug: `${oracle.host}/${oracle.site}` };
  const htmlIcimsHost = icimsHostFrom(html);
  if (htmlIcimsHost) return { kind: 'board', ats: 'icims', slug: htmlIcimsHost };
  const source = `${finalUrl}\n${html}`;
  for (const signature of UNREADABLE_PLATFORMS) {
    if (signature.re.test(source)) return { kind: 'unreadable', platform: signature.platform };
  }
  return { kind: 'none' };
}

function timeoutFor(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('resolution deadline exceeded');
  return Math.min(PAGE_TIMEOUT_MS, remaining);
}

async function fetchJson<T>(url: string, deadline: number, method: 'GET' | 'POST' = 'GET', body?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': BROWSER_USER_AGENT,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    body,
    redirect: 'follow',
    headers,
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function numericTotal(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function validateUkgCandidate(candidate: Extract<BoardDetection, { kind: 'board' }>, deadline: number): Promise<BoardResolution> {
  const match = /^(recruiting2?\.ultipro\.com)\/([A-Za-z0-9]+)\/([0-9a-f-]{36})$/i.exec(candidate.slug);
  if (!match) return { kind: 'unknown', reason: 'Invalid UKG board coordinates' };
  const [, host, tenant, guid] = match;
  const response = await fetch(`https://${host}/${tenant}/JobBoard/${guid}/JobBoardView/LoadSearchResults`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': BROWSER_USER_AGENT,
    },
    body: JSON.stringify({
      opportunitySearch: {
        Top: 50,
        Skip: 0,
        QueryString: '',
        OrderBy: [{ Value: 'postedDateDesc', PropertyName: 'PostedDate', Ascending: false }],
        Filters: [4, 5, 6].map((fieldName) => ({ t: 'TermsSearchFilterDto', fieldName, extra: null, values: [] })),
      },
      matchCriteria: {
        PreferredJobs: [], Educations: [], LicenseAndCertifications: [], Skills: [],
        hasNoLicenses: false, SkippedSkills: [],
      },
    }),
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) return { kind: 'unknown', reason: `UKG validation HTTP ${response.status}` };
  const data = await response.json() as { opportunities?: unknown[]; totalCount?: unknown };
  if (!Array.isArray(data.opportunities) || typeof data.totalCount !== 'number' || !Number.isFinite(data.totalCount)) {
    return { kind: 'unknown', reason: 'UKG response had no opportunities or numeric totalCount' };
  }
  if (!data.totalCount) return { kind: 'unknown', reason: 'UKG board has no jobs' };
  const slug = `${host.toLowerCase()}/${tenant}/${guid}`;
  return {
    kind: 'board',
    ats: 'ukg',
    slug,
    careersUrl: `https://${host.toLowerCase()}/${tenant}/JobBoard/${guid}`,
    total: data.totalCount,
  };
}

function taleoPortalFromHtml(html: string): string {
  return /portalNo\s*:\s*['"](\d+)['"]/i.exec(html)?.[1]
    ?? /[?&]portal=(\d+)/i.exec(html.replace(/&amp;/gi, '&'))?.[1]
    ?? /portal\s*=\s*['"]?(\d+)/i.exec(html)?.[1]
    ?? '101430233';
}

async function validateTaleoCandidate(candidate: Extract<BoardDetection, { kind: 'board' }>, deadline: number): Promise<BoardResolution> {
  const match = /^([a-z0-9-]+\.taleo\.net)\/([^/?#]+)$/i.exec(candidate.slug);
  if (!match) return { kind: 'unknown', reason: 'Invalid Taleo board coordinates' };
  const host = match[1].toLowerCase();
  const section = match[2];
  const referer = `https://${host}/careersection/${section}/jobsearch.ftl?lang=en`;
  const page = await fetch(referer, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!page.ok) return { kind: 'unknown', reason: `Taleo portal HTTP ${page.status}` };
  const html = await page.text();
  const headers = page.headers as Headers & { getSetCookie?: () => string[] };
  const cookie = (headers.getSetCookie?.() ?? [page.headers.get('set-cookie') ?? ''])
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
  const response = await fetch(`https://${host}/careersection/rest/jobboard/searchjobs?lang=en&portal=${encodeURIComponent(taleoPortalFromHtml(html))}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      tz: 'GMT-08:00',
      tzname: 'America/Los_Angeles',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
      'User-Agent': BROWSER_USER_AGENT,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({
      multilineEnabled: false,
      sortingSelection: { sortBySelectionParam: '3', ascendingSortingOrder: 'false' },
      fieldData: { fields: { KEYWORD: '', LOCATION: '' }, valid: true },
      filterSelectionParam: { searchFilterSelections: [] },
      advancedSearchFiltersSelectionParam: { searchFilterSelections: [] },
      pageNo: 1,
    }),
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) return { kind: 'unknown', reason: `Taleo search HTTP ${response.status}` };
  let data: { requisitionList?: unknown[]; pagingData?: { totalCount?: unknown } };
  try {
    data = await response.json() as typeof data;
  } catch {
    return { kind: 'unknown', reason: 'Taleo search response was not JSON' };
  }
  if (!Array.isArray(data.requisitionList) || typeof data.pagingData?.totalCount !== 'number') {
    return { kind: 'unknown', reason: 'Taleo response had no requisitionList or numeric totalCount' };
  }
  if (!data.pagingData.totalCount) return { kind: 'unknown', reason: 'Taleo board has no jobs' };
  return {
    kind: 'board',
    ats: 'taleo',
    slug: `${host}/${section}`,
    careersUrl: referer,
    total: data.pagingData.totalCount,
  };
}

async function successFactorsFeedAt(host: string, deadline: number) {
  const response = await fetch(`https://${host}/sitemap.xml`, {
    redirect: 'follow',
    headers: { Accept: 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': BROWSER_USER_AGENT },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { host: host.toLowerCase(), feed: parseSuccessFactorsFeed(await response.text()) };
}

async function validateSuccessFactorsCandidate(
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const coordinates = candidate.successFactors;
  if (!coordinates) return { kind: 'unknown', reason: 'Missing SuccessFactors company coordinates' };
  const careerUrl = new URL(`https://${coordinates.host}/career`);
  careerUrl.searchParams.set('company', coordinates.company);
  careerUrl.searchParams.set('career_ns', 'job_listing_summary');
  careerUrl.searchParams.set('navBarLevel', 'JOB_SEARCH');
  careerUrl.searchParams.set('lang', 'en_US');
  const response = await fetch(careerUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) return { kind: 'unknown', reason: `SuccessFactors career page HTTP ${response.status}` };
  const finalHost = new URL(response.url || careerUrl.toString()).hostname.toLowerCase();
  if (!rmkHost(finalHost)) return { kind: 'unreadable', platform: 'SAP SuccessFactors' };
  try {
    const { host, feed } = await successFactorsFeedAt(finalHost, deadline);
    return {
      kind: 'board',
      ats: 'successfactors',
      slug: host,
      careersUrl: `https://${host}/`,
      total: feed.items.length,
    };
  } catch {
    return { kind: 'unreadable', platform: 'SAP SuccessFactors' };
  }
}

async function validateCandidate(name: string, candidate: Extract<BoardDetection, { kind: 'board' }>, deadline: number): Promise<BoardResolution> {
  try {
    if (candidate.ats === 'ukg') return await validateUkgCandidate(candidate, deadline);
    if (candidate.ats === 'taleo') return await validateTaleoCandidate(candidate, deadline);
    if (candidate.ats === 'successfactors') return await validateSuccessFactorsCandidate(candidate, deadline);
    if (candidate.ats === 'workday' && candidate.workday) {
      const { tenant, wd, site } = candidate.workday;
      const data = await fetchJson<{ total?: unknown }>(
        `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
        deadline,
        'POST',
        JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
      );
      if (typeof data.total !== 'number' || !Number.isFinite(data.total)) {
        return { kind: 'unknown', reason: 'Workday response had no numeric total' };
      }
      return {
        kind: 'board',
        ats: 'workday',
        slug: candidate.slug,
        careersUrl: `https://${tenant}.${wd}.myworkdayjobs.com/${site}`,
        total: data.total,
      };
    }

    if (candidate.ats === 'greenhouse') {
      const data = await fetchJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${candidate.slug}/jobs?content=false`, deadline);
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Greenhouse board has no jobs' };
      const meta = await fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${candidate.slug}`, deadline);
      if (!namesAgree(name, meta.name)) return { kind: 'unknown', reason: 'Greenhouse board name did not match employer' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://boards.greenhouse.io/${candidate.slug}`, total: data.jobs.length };
    }

    if (candidate.ats === 'smartrecruiters') {
      const data = await fetchJson<{ content?: unknown[]; totalFound?: unknown }>(
        `https://api.smartrecruiters.com/v1/companies/${candidate.slug}/postings?limit=1`,
        deadline,
      );
      if (!Array.isArray(data.content) || !data.content.length) return { kind: 'unknown', reason: 'SmartRecruiters board has no jobs' };
      const meta = await fetchJson<{ name?: string }>(`https://api.smartrecruiters.com/v1/companies/${candidate.slug}`, deadline);
      if (!namesAgree(name, meta.name)) return { kind: 'unknown', reason: 'SmartRecruiters board name did not match employer' };
      return {
        kind: 'board',
        ats: candidate.ats,
        slug: candidate.slug,
        careersUrl: `https://jobs.smartrecruiters.com/${candidate.slug}`,
        total: numericTotal(data.totalFound, data.content.length),
      };
    }

    if (candidate.ats === 'workable') {
      const data = await fetchJson<{ name?: string; jobs?: unknown[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${candidate.slug}`,
        deadline,
      );
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Workable board has no jobs' };
      if (!namesAgree(name, data.name)) return { kind: 'unknown', reason: 'Workable board name did not match employer' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://apply.workable.com/${candidate.slug}`, total: data.jobs.length };
    }

    if (candidate.ats === 'lever') {
      const jobs = await fetchJson<unknown[]>(`https://api.lever.co/v0/postings/${candidate.slug}?mode=json`, deadline);
      if (!Array.isArray(jobs) || !jobs.length) return { kind: 'unknown', reason: 'Lever board has no jobs' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://jobs.lever.co/${candidate.slug}`, total: jobs.length };
    }

    if (candidate.ats === 'ashby') {
      const data = await fetchJson<{ jobs?: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${candidate.slug}`, deadline);
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Ashby board has no jobs' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://jobs.ashbyhq.com/${candidate.slug}`, total: data.jobs.length };
    }

    if (candidate.ats === 'oracle') {
      const slash = candidate.slug.lastIndexOf('/');
      const host = candidate.slug.slice(0, slash);
      const site = candidate.slug.slice(slash + 1);
      const data = await fetchJson<{ items?: { TotalJobsCount?: unknown }[] }>(
        `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${encodeURIComponent(site)},limit=1,offset=0`,
        deadline,
      );
      const total = data.items?.[0]?.TotalJobsCount;
      if (typeof total !== 'number' || !Number.isFinite(total)) {
        return { kind: 'unknown', reason: 'Oracle response had no numeric TotalJobsCount' };
      }
      return {
        kind: 'board',
        ats: 'oracle',
        slug: candidate.slug,
        careersUrl: `https://${host}/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(site)}/requisitions?mode=location`,
        total,
      };
    }

    if (candidate.ats === 'icims') {
      const host = icimsHost(candidate.slug);
      if (!host) return { kind: 'unknown', reason: 'Invalid iCIMS employer host' };
      const sitemap = await fetchIcimsText(`https://${host}/sitemap.xml`, host, timeoutFor(deadline));
      const jobs = icimsSitemapJobs(sitemap, host);
      if (!jobs.length) return { kind: 'unknown', reason: 'iCIMS sitemap has no job postings' };
      const detail = await fetchIcimsText(icimsDetailUrl(jobs[0]), host, timeoutFor(deadline));
      const posting = jobPostingFrom(detail);
      const organization = typeof posting?.hiringOrganization === 'string'
        ? posting.hiringOrganization
        : posting?.hiringOrganization?.name;
      if (!namesAgree(name, organization)) return { kind: 'unknown', reason: 'iCIMS hiring organization did not match employer' };
      return {
        kind: 'board',
        ats: candidate.ats,
        slug: host,
        careersUrl: `https://${host}/jobs/search?ss=1`,
        total: jobs.length,
      };
    }
  } catch (error) {
    return { kind: 'unknown', reason: `${candidate.ats} validation failed: ${(error as Error).message.slice(0, 120)}` };
  }
  return { kind: 'unknown', reason: `Unsupported ATS candidate: ${candidate.ats}` };
}

export async function resolveBoard(name: string, careersUrl: string, deadline: number): Promise<BoardResolution> {
  try {
    let current = new URL(careersUrl);
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 8; redirects += 1) {
      if (
        /(?:^|\.)icims\.com$/i.test(current.hostname)
        && (!icimsHost(current.hostname) || forbiddenIcimsPath(current.pathname))
      ) {
        throw new Error('iCIMS restricted host or path');
      }
      response = await fetch(current, {
        redirect: 'manual',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(timeoutFor(deadline)),
      });
      if (response.status === 304 || response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location) throw new Error(`redirect ${response.status} had no location`);
      current = new URL(location, current);
    }
    if (!response || (response.status >= 300 && response.status < 400)) throw new Error('redirect limit exceeded');
    const html = (await response.text()).slice(0, 400_000);
    const finalUrl = current.toString();
    const detected = detect(html, finalUrl);
    if (detected.kind === 'board') return validateCandidate(name, detected, deadline);
    const finalHost = current.hostname.toLowerCase();
    if (rmkHost(finalHost)) {
      try {
        const { host, feed } = await successFactorsFeedAt(finalHost, deadline);
        if (rmkHost(host)) {
          return {
            kind: 'board',
            ats: 'successfactors',
            slug: host,
            careersUrl: `https://${host}/`,
            total: feed.items.length,
          };
        }
      } catch { /* not an RMK RSS feed */ }
    }
    if (detected.kind === 'unreadable') return detected;
    return {
      kind: 'unknown',
      reason: response.ok ? `HTTP ${response.status}: no supported board link found` : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { kind: 'unknown', reason: `fetch failed: ${(error as Error).message.slice(0, 120)}` };
  }
}

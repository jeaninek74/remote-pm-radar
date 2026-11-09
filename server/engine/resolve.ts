import type { Ats } from './types';
import { fetchIcimsText, forbiddenIcimsPath, icimsDetailUrl, icimsHost, icimsHostFrom, icimsSitemapJobs } from './icims';
import { jobPostingFrom } from './careers';
import { parseSuccessFactorsFeed } from './successfactors';
import { parseNeogovFeed } from './neogov';
import { parsePhenomConfig, parsePhenomResponse, phenomEndpointMatchesPageHost } from './phenom';
import { stripHtml } from './text';
import { haleySitemapJobs } from './haley';
import { parseZenopleJson, zenopleJobPortalUrl } from './zenople';
import { crelatePortalSlug, extractCrelateOrgId, crelateJobsUrl } from './crelate';
import { avionteBoardUrl, avionteCoordinates, avionteListUrl, parseAvionteJobPosts } from './avionte';

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
  { platform: 'Phenom', re: /phenompeople|phenom\.com/i },
  { platform: 'UKG Ready', re: /entertimeonline\.com/i },
  { platform: 'PeopleAdmin', re: /peopleadmin\.com/i },
  { platform: 'NEOGOV', re: /(?:governmentjobs|schooljobs)\.com/i },
  { platform: 'Frontline/AppliTrack', re: /applitrack\.com/i },
  { platform: 'SAP SuccessFactors', re: /successfactors|jobs\.sap\.com/i },
  { platform: 'Avature', re: /avature\.net/i },
  { platform: 'Oracle Cloud HCM', re: /oraclecloud\.com/i },
  { platform: 'Taleo', re: /taleo\.net/i },
  { platform: 'Eightfold', re: /eightfold\.ai/i },
  { platform: 'TalentBrew', re: /talentbrew|tbcdn/i },
  { platform: 'Paradox', re: /paradox\.ai/i },
  { platform: 'Dayforce', re: /dayforcehcm\.com/i },
  { platform: 'UKG/UltiPro', re: /ultipro\.com|\.ukg\.net/i },
  { platform: 'Jobvite', re: /jobvite\.com/i },
  { platform: 'ADP Workforce Now', re: /(?:workforcenow\.adp\.com|adp\.com\/workforcenow)/i },
  { platform: 'Cornerstone OnDemand', re: /csod\.com/i },
  { platform: 'Rippling', re: /ats\.rippling\.com/i },
];

const NAME_NOISE = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|companies|group|holdings|plc|the|and|of)\b/g;

export type BoardDetection =
  | {
    kind: 'board';
    ats: Ats;
    slug: string;
    workday?: { tenant: string; wd: string; site: string };
    successFactors?: { host: string; company: string };
    phenom?: ReturnType<typeof parsePhenomConfig>;
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

function neogovCoordinates(source: string): { host: string; folder: string } | null {
  const normalized = source.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const reservedFolders = new Set(['home', 'jobs', 'search', 'login', 'signin', 'profile']);
  for (const match of normalized.matchAll(
    /https?:\/\/((?:www\.)?(?:governmentjobs|schooljobs)\.com)\/careers\/([A-Za-z0-9_-]+)(?=[/?#"'<>\\\s]|$)/gi,
  )) {
    if (reservedFolders.has(match[2].toLowerCase())) continue;
    return { host: match[1].toLowerCase(), folder: match[2] };
  }
  return null;
}

function neogovAgencyNames(html: string): { names: string[]; verbiage: string | null } {
  const names: string[] = [];
  const add = (value: string | undefined) => {
    if (!value) return;
    const name = stripHtml(value).replace(/\s+/g, ' ').trim();
    if (name && !names.includes(name)) names.push(name);
  };

  for (const match of html.matchAll(/<(h1|h2|div|span)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const classes = /\bclass\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1].split(/\s+/) ?? [];
    if (!classes.includes('agency-name')) continue;
    add(/\btitle\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1] ?? match[3]);
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  if (title) {
    for (const part of title.split('|')) add(part);
  }
  const verbiage = /<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bverbiage\b[^"']*["'])[^>]*>([\s\S]*?)<\/div\s*>/i.exec(html)?.[1];
  const verbiageText = verbiage ? stripHtml(verbiage.slice(0, 1200)).replace(/\s+/g, ' ').trim() : '';
  return { names, verbiage: verbiageText || null };
}

export function neogovVerbiageMatches(name: string, verbiage: string): boolean {
  const nameSequence = nameTokens(name);
  const verbiageTokens = nameTokens(verbiage);
  if (!nameSequence.length || nameSequence.length > verbiageTokens.length) return false;
  return verbiageTokens.some((_, index) =>
    nameSequence.every((token, offset) => verbiageTokens[index + offset] === token),
  );
}

function rmkHost(host: string): boolean {
  return !/\.successfactors\.(?:com|eu)$/i.test(host);
}

function haleyCoordinates(html: string, finalUrl: string): string | null {
  const normalized = html.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  let page: URL;
  try {
    page = new URL(finalUrl);
  } catch {
    return null;
  }

  const jobHost = (host: string) => /(?:^|[.-])(?:jobs?|careers?|employment)(?:[.-]|$)/i.test(host);
  const linkedUrls = [...normalized.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const href of linkedUrls) {
    try {
      const url = new URL(href, page);
      if (/index\.smpl/i.test(url.pathname)) return url.hostname.toLowerCase();
    } catch { /* ignore malformed links */ }
  }
  if (/index\.smpl/i.test(page.pathname)) return page.hostname.toLowerCase();

  const pageDomain = page.hostname.toLowerCase().split('.').slice(-2).join('.');
  for (const href of linkedUrls) {
    try {
      const url = new URL(href, page);
      const host = url.hostname.toLowerCase();
      const hostDomain = host.split('.').slice(-2).join('.');
      if (
        host !== page.hostname.toLowerCase()
        && host !== 'cdn.haleymarketing.com'
        && hostDomain === pageDomain
        && jobHost(host)
      ) return host;
    } catch { /* ignore malformed links */ }
  }
  return /cdn\.haleymarketing\.com/i.test(normalized) && jobHost(page.hostname)
    ? page.hostname.toLowerCase()
    : null;
}

function zenopleCoordinates(source: string): { tenant: string; organization: string } | null {
  const normalized = source.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const match = /https?:\/\/([a-z0-9-]+)\.zenople\.com\/(?:job-portal|apply|login)\/([A-Za-z0-9]+)(?=[/?#"'<>\\\s]|$)/i.exec(normalized);
  if (!match) return null;
  return { tenant: match[1].toLowerCase(), organization: match[2].toUpperCase() };
}

export function detect(html: string, finalUrl: string, skipStaffingBoards = false): BoardDetection {
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
  const neogov = neogovCoordinates(`${finalUrl}\n${html}`);
  if (neogov) return { kind: 'board', ats: 'neogov', slug: `${neogov.host}/${neogov.folder}` };
  const phenom = parsePhenomConfig(html, finalUrl);
  if (phenom) {
    const base = new URL(phenom.baseUrl);
    return {
      kind: 'board',
      ats: 'phenom',
      slug: `${base.host}${base.pathname.replace(/\/$/, '')}`,
      phenom,
    };
  }
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.re.exec(finalUrl) ?? pattern.re.exec(html);
    if (match) return { kind: 'board', ats: pattern.ats, slug: match[1].toLowerCase() };
  }
  if (!skipStaffingBoards) {
    const haleyHost = haleyCoordinates(html, finalUrl);
    if (haleyHost) return { kind: 'board', ats: 'haley', slug: haleyHost };
    const zenople = zenopleCoordinates(`${finalUrl}\n${html}`);
    if (zenople) {
      return { kind: 'board', ats: 'zenople', slug: `${zenople.tenant}/${zenople.organization}` };
    }
    const crelate = crelatePortalSlug(`${finalUrl}\n${html}`);
    if (crelate) return { kind: 'board', ats: 'crelate', slug: crelate };
    const avionte = avionteCoordinates(`${finalUrl}\n${html}`);
    if (avionte) return { kind: 'board', ats: 'avionte', slug: `${avionte.bId}/${avionte.jbId}` };
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

async function fetchJson<T>(url: string, deadline: number, method: 'GET' | 'POST' = 'GET', body?: string, expectedHost?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': BROWSER_USER_AGENT,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    body,
    redirect: expectedHost ? 'manual' : 'follow',
    headers,
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (expectedHost && response.status >= 300 && response.status < 400) {
    throw new Error('Phenom widget API redirects are not accepted');
  }
  if (expectedHost && new URL(response.url || url).host.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new Error('Phenom widget API response host did not match careers page host');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function numericTotal(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ukgBoardName(html: string, boardGuid: string): string | null {
  const escapedGuid = boardGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"Id"\\s*:\\s*"${escapedGuid}"[\\s\\S]{0,1000}?"Name"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i').exec(html);
  if (match) {
    try {
      const name = (JSON.parse(`"${match[1]}"`) as string)
        .replace(/\s*(?:[-–—]\s*)?(?:careers?|career opportunities|job board|opportunities)$/i, '')
        .trim();
      if (name) return name;
    } catch {
      return null;
    }
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '';
  const name = stripHtml(title)
    .replace(/\s*(?:[-–—]\s*)?(?:careers?|career opportunities|job board|opportunities)$/i, '')
    .trim();
  return name && !/^(?:career opportunities|job board)$/i.test(name) ? name : null;
}

function taleoBoardName(html: string): string | null {
  const value = (tag: string, attribute: string): string | null =>
    new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2] ?? null;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '';
  const metaTitles = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\b(?:name|property)=["'](?:title|og:title)["']/i.test(tag))
    .map((tag) => value(tag, 'content'))
    .filter((content): content is string => Boolean(content));
  for (const candidate of [...metaTitles, title]) {
    const parts = stripHtml(candidate).split(/\s*\|\s*/);
    const branded = parts.at(-1)?.replace(/\s*[-–—:]?\s*(?:careers?|job openings|job search|jobs?)$/i, '').trim();
    if (branded && !/^(?:careers?|job openings|job search|jobs?)$/i.test(branded)) return branded;
  }
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const alt = value(tag[0], 'alt');
    const src = value(tag[0], 'src') ?? '';
    if (!alt || !/\blogo\b/i.test(`${alt} ${src}`)) continue;
    const branded = stripHtml(alt).replace(/\s+logo$/i, '').trim();
    if (branded && !/^(?:close|create an rss feed|access the online help|collapse this section|arrow icon|facebook link|instagram link|linkedin link|youtube link)$/i.test(branded)) {
      return branded;
    }
  }
  return null;
}

function successFactorsBoardName(feed: ReturnType<typeof parseSuccessFactorsFeed>): string | null {
  return feed.items.map((item) => item.employer.trim()).find(Boolean) || feed.title.trim() || null;
}

async function validateUkgCandidate(
  name: string,
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const match = /^(recruiting2?\.ultipro\.com)\/([A-Za-z0-9]+)\/([0-9a-f-]{36})$/i.exec(candidate.slug);
  if (!match) return { kind: 'unknown', reason: 'Invalid UKG board coordinates' };
  const [, host, tenant, guid] = match;
  const boardPage = await fetch(`https://${host}/${tenant}/JobBoard/${guid}`, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!boardPage.ok) return { kind: 'unknown', reason: `UKG board page HTTP ${boardPage.status}` };
  if (!namesAgree(name, ukgBoardName(await boardPage.text(), guid))) {
    return { kind: 'unknown', reason: 'UKG board name did not match employer' };
  }
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

function taleoPortalFromHtml(html: string): string | null {
  return /portalNo\s*:\s*['"](\d+)['"]/i.exec(html)?.[1]
    ?? /[?&]portal=(\d+)/i.exec(html.replace(/&amp;/gi, '&'))?.[1]
    ?? /portal\s*=\s*['"]?(\d+)/i.exec(html)?.[1]
    ?? null;
}

async function validateTaleoCandidate(
  name: string,
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
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
  const portal = taleoPortalFromHtml(html);
  if (!portal) return { kind: 'unknown', reason: 'Taleo portal id not found' };
  if (!namesAgree(name, taleoBoardName(html))) {
    return { kind: 'unknown', reason: 'Taleo board name did not match employer' };
  }
  const headers = page.headers as Headers & { getSetCookie?: () => string[] };
  const cookie = (headers.getSetCookie?.() ?? [page.headers.get('set-cookie') ?? ''])
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
  const response = await fetch(`https://${host}/careersection/rest/jobboard/searchjobs?lang=en&portal=${encodeURIComponent(portal)}`, {
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
  name: string,
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
    if (!namesAgree(name, successFactorsBoardName(feed))) {
      return { kind: 'unknown', reason: 'SuccessFactors board name did not match employer' };
    }
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

async function validateNeogovCandidate(
  name: string,
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const [host, folder, extra] = candidate.slug.split('/');
  if (
    extra
    || !/^(?:www\.)?(?:governmentjobs|schooljobs)\.com$/i.test(host)
    || !/^[A-Za-z0-9_-]+$/.test(folder)
  ) {
    return { kind: 'unknown', reason: 'Invalid NEOGOV agency coordinates' };
  }

  const careerUrl = `https://${host}/careers/${folder}`;
  const response = await fetch(careerUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) return { kind: 'unknown', reason: `NEOGOV agency page HTTP ${response.status}` };

  const finalUrl = new URL(response.url || careerUrl);
  const finalHost = finalUrl.hostname.toLowerCase();
  if (!/^(?:www\.)?(?:governmentjobs|schooljobs)\.com$/i.test(finalHost)) {
    return { kind: 'unreadable', platform: 'NEOGOV' };
  }
  const finalFolder = /^\/careers\/([A-Za-z0-9_-]+)/i.exec(finalUrl.pathname)?.[1] ?? folder;
  const agencyIdentity = neogovAgencyNames(await response.text());
  const nameMatches = agencyIdentity.names.some((agencyName) => namesAgree(name, agencyName))
    || (agencyIdentity.verbiage !== null && neogovVerbiageMatches(name, agencyIdentity.verbiage));
  if (!nameMatches) {
    return {
      kind: 'unknown',
      reason: `NEOGOV agency name did not match employer: ${(agencyIdentity.names[0] ?? agencyIdentity.verbiage ?? 'not found').slice(0, 120)}`,
    };
  }

  const feedUrl = `https://${finalHost}/SearchEngine/JobsFeed?agency=${encodeURIComponent(finalFolder)}`;
  const feedResponse = await fetch(feedUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/rss+xml,application/xml,text/xml,*/*' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!feedResponse.ok) return { kind: 'unknown', reason: `NEOGOV feed HTTP ${feedResponse.status}` };
  const items = parseNeogovFeed(await feedResponse.text());
  return {
    kind: 'board',
    ats: 'neogov',
    slug: `${finalHost}/${finalFolder}`,
    careersUrl: `https://${finalHost}/careers/${finalFolder}`,
    total: items.length,
  };
}

async function validatePhenomCandidate(
  name: string,
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const config = candidate.phenom;
  if (!config) return { kind: 'unreadable', platform: 'Phenom' };
  if (!phenomEndpointMatchesPageHost(config.widgetApiEndpoint, config.pageHost)) {
    return { kind: 'unreadable', platform: 'Phenom' };
  }
  try {
    const response = await fetchJson<unknown>(
      config.widgetApiEndpoint,
      deadline,
      'POST',
      JSON.stringify({
        ddoKey: 'refineSearch', jobs: true, from: 0, size: 1,
        sort: { order: 'desc', field: 'dateCreated' },
        refNum: config.refNum, siteType: config.siteType, locale: config.locale, pageName: config.pageName,
      }),
      config.pageHost,
    );
    const parsed = parsePhenomResponse(response);
    if (parsed.totalHits <= 0 || !namesAgree(name, config.companyName)) {
      return { kind: 'unreadable', platform: 'Phenom' };
    }
    return {
      kind: 'board',
      ats: 'phenom',
      slug: candidate.slug,
      careersUrl: config.baseUrl,
      total: parsed.totalHits,
    };
  } catch {
    return { kind: 'unreadable', platform: 'Phenom' };
  }
}

async function validateHaleyCandidate(
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const host = candidate.slug.toLowerCase();
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) || /(?:^|\.)haleymarketing\.com$/i.test(host)) {
    return { kind: 'unknown', reason: 'Invalid Haley Marketing board host' };
  }
  const { urls } = await haleySitemapJobs(host, deadline);
  if (!urls.length) return { kind: 'unknown', reason: 'Haley Marketing sitemap has no job postings' };
  return {
    kind: 'board',
    ats: 'haley',
    slug: host,
    careersUrl: `https://${host}/`,
    total: urls.length,
  };
}

async function validateZenopleCandidate(
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const match = /^([a-z0-9-]+)\/([a-z0-9]+)$/i.exec(candidate.slug);
  if (!match) return { kind: 'unknown', reason: 'Invalid Zenople tenant/organization coordinates' };
  const tenant = match[1].toLowerCase();
  const organization = match[2].toUpperCase();
  const response = await fetch(zenopleJobPortalUrl(tenant, organization, 1), {
    headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) return { kind: 'unknown', reason: `Zenople JobPortal HTTP ${response.status}` };
  const data = parseZenopleJson(await response.json()) as { TotalCount?: unknown } | null;
  const total = Number(data?.TotalCount);
  if (!Number.isFinite(total) || total < 0) {
    return { kind: 'unknown', reason: 'Zenople JobPortal response had no parseable TotalCount' };
  }
  return {
    kind: 'board',
    ats: 'zenople',
    slug: `${tenant}/${organization}`,
    careersUrl: `https://${tenant}.zenople.com/job-portal/${organization}`,
    total,
  };
}

async function validateCrelateCandidate(
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  if (!/^[a-z0-9-]+$/i.test(candidate.slug)) {
    return { kind: 'unknown', reason: 'Invalid Crelate portal slug' };
  }
  const portalUrl = `https://jobs.crelate.com/portal/${encodeURIComponent(candidate.slug)}/`;
  const portal = await fetch(portalUrl, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!portal.ok) return { kind: 'unknown', reason: `Crelate portal HTTP ${portal.status}` };
  const orgId = extractCrelateOrgId(await portal.text());
  if (!orgId) return { kind: 'unknown', reason: 'Crelate portal HTML had no ORG_ID' };
  const response = await fetchJson<{ Jobs?: unknown[]; IsError?: boolean }>(
    crelateJobsUrl(orgId),
    deadline,
  );
  if (response.IsError || !Array.isArray(response.Jobs) || !response.Jobs.length) {
    return { kind: 'unknown', reason: 'Crelate GetAllJobs had no postings' };
  }
  return {
    kind: 'board',
    ats: 'crelate',
    slug: candidate.slug.toLowerCase(),
    careersUrl: portalUrl,
    total: response.Jobs.length,
  };
}

async function validateAvionteCandidate(
  candidate: Extract<BoardDetection, { kind: 'board' }>,
  deadline: number,
): Promise<BoardResolution> {
  const match = /^([a-z0-9_-]+)\/([a-z0-9_-]+)$/i.exec(candidate.slug);
  if (!match) return { kind: 'unknown', reason: 'Invalid Avionté board coordinates' };
  const [, bId, jbId] = match;
  const response = await fetchJson<unknown>(avionteListUrl(bId, jbId), deadline);
  const posts = parseAvionteJobPosts(response);
  if (!posts?.length) return { kind: 'unknown', reason: 'Avionté board has no job posts' };
  return {
    kind: 'board',
    ats: 'avionte',
    slug: `${bId}/${jbId}`,
    careersUrl: avionteBoardUrl(bId, jbId),
    total: posts.length,
  };
}

async function validateCandidate(name: string, candidate: Extract<BoardDetection, { kind: 'board' }>, deadline: number): Promise<BoardResolution> {
  try {
    if (candidate.ats === 'ukg') return await validateUkgCandidate(name, candidate, deadline);
    if (candidate.ats === 'taleo') return await validateTaleoCandidate(name, candidate, deadline);
    if (candidate.ats === 'successfactors') return await validateSuccessFactorsCandidate(name, candidate, deadline);
    if (candidate.ats === 'neogov') return await validateNeogovCandidate(name, candidate, deadline);
    if (candidate.ats === 'phenom') return await validatePhenomCandidate(name, candidate, deadline);
    if (candidate.ats === 'haley') return await validateHaleyCandidate(candidate, deadline);
    if (candidate.ats === 'zenople') return await validateZenopleCandidate(candidate, deadline);
    if (candidate.ats === 'crelate') return await validateCrelateCandidate(candidate, deadline);
    if (candidate.ats === 'avionte') return await validateAvionteCandidate(candidate, deadline);
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
    const fullHtml = await response.text();
    let html = fullHtml.slice(0, 400_000);
    const finalUrl = current.toString();
    let detected = detect(html, finalUrl);
    if (detected.kind === 'none' && html.length < fullHtml.length) {
      html = fullHtml;
      detected = detect(html, finalUrl);
    }
    if (detected.kind === 'board') {
      const candidate = detected;
      const validation = await validateCandidate(name, candidate, deadline);
      if (validation.kind === 'board') return validation;
      if (
        candidate.ats !== 'haley'
        && candidate.ats !== 'zenople'
        && candidate.ats !== 'crelate'
        && candidate.ats !== 'avionte'
      ) return validation;
      detected = detect(html, finalUrl, true);
      if (detected.kind === 'board') return validateCandidate(name, detected, deadline);
    }
    const finalHost = current.hostname.toLowerCase();
    if (rmkHost(finalHost)) {
      try {
        const { host, feed } = await successFactorsFeedAt(finalHost, deadline);
        if (rmkHost(host)) {
          if (!namesAgree(name, successFactorsBoardName(feed))) {
            return { kind: 'unknown', reason: 'SuccessFactors board name did not match employer' };
          }
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

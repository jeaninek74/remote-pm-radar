import { REFRESH } from '../config';
import { fetchText } from './http';
import { isRoleTitle } from './titles';
import { isoDate, stripHtml } from './text';
import type { BoardFetchResult, EmployerRow, RawJob } from './types';

/**
 * Careers-page reader for employers with no public ATS API (Avature, Phenom, iCIMS, Oracle HCM,
 * Taleo, bespoke pages). Jeanine, 7 Nov 2026: "careers page tracked" employers are searched, not
 * just listed.
 *
 * Strategy, all first-party: the site's sitemap(s) and the careers page itself are read for
 * posting URLs; each posting page is read for its schema.org `JobPosting` JSON-LD (title, date
 * posted, locations, salary, description — the same fields the ATS APIs give). A page without
 * JSON-LD still yields a posting with an unknown date, which the rules keep out of the salary
 * tabs and in the verification queue. No numeric caps; the employer time budget is the only stop.
 */

const JOB_URL = /\/(?:job|jobs|career|careers|opening|openings|position|positions|vacancy|req|requisition)s?\//i;
const SITEMAP_TAG = /<(?:loc)>\s*([^<\s]+)\s*<\/loc>/gi;
const ANCHOR = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const JSON_LD = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export interface ApplicantLocationRequirement {
  name?: string;
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string | { name?: string };
  };
}

export interface JobLocationLd {
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string | { name?: string };
  };
}

export interface JobPostingLd {
  '@type'?: string | string[];
  title?: string;
  datePosted?: string;
  description?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  jobLocation?: JobLocationLd | JobLocationLd[];
  applicantLocationRequirements?: string | ApplicantLocationRequirement | Array<string | ApplicantLocationRequirement>;
  hiringOrganization?: { name?: string } | string;
  baseSalary?: { currency?: string; value?: { minValue?: number | string; maxValue?: number | string; value?: number | string; unitText?: string } };
  identifier?: { value?: string } | string;
  url?: string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

interface CountryContext {
  name: string;
  isUs: boolean;
}

const UNITED_STATES: CountryContext = { name: 'United States', isUs: true };
const COUNTRY_LABELS: [string, CountryContext][] = [
  ['united states of america', UNITED_STATES],
  ['united states', UNITED_STATES],
  ['usa', UNITED_STATES],
  ['u s', UNITED_STATES],
  ['us', UNITED_STATES],
  ['canada', { name: 'Canada', isUs: false }],
  ['israel', { name: 'Israel', isUs: false }],
  ['spain', { name: 'Spain', isUs: false }],
  ['mexico', { name: 'Mexico', isUs: false }],
];

function normalizedCountryText(value: string): string {
  return value.toLowerCase().replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function countryFromJsonLd(value: string | { name?: string } | undefined): CountryContext | null {
  const raw = typeof value === 'string' ? value.trim() : value?.name?.trim() ?? '';
  if (!raw) return null;
  const key = normalizedCountryText(raw);
  const named = COUNTRY_LABELS.find(([label]) => label === key)?.[1];
  if (named) return named;
  if (/^[a-z]{2}$/i.test(raw)) {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(raw.toUpperCase());
    if (name && !/^unknown region$/i.test(name)) {
      return { name, isUs: raw.toUpperCase() === 'US' };
    }
  }
  return { name: raw, isUs: false };
}

function countryFromPath(url: string): CountryContext | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    const collectionIndex = segments.findIndex((segment) => segment.toLowerCase() === 'co');
    if (collectionIndex < 0 || !segments[collectionIndex + 1]) return null;
    const countrySlug = normalizedCountryText(segments[collectionIndex + 1]);
    if (countrySlug === 'united states' || countrySlug === 'united states of america' || countrySlug === 'us' || countrySlug === 'usa') {
      return UNITED_STATES;
    }
    return COUNTRY_LABELS.find(([label]) => label === countrySlug)?.[1] ?? null;
  } catch {
    return null;
  }
}

function countryFromLabel(label: string): CountryContext | null {
  const normalized = ` ${normalizedCountryText(label)} `;
  return COUNTRY_LABELS.find(([name]) => normalized.includes(` ${name} `))?.[1] ?? null;
}

function addressCountry(location: JobLocationLd | ApplicantLocationRequirement): string | { name?: string } | undefined {
  return location.address?.addressCountry;
}

function countryContextForPosting(
  locations: JobLocationLd[],
  url: string,
  linkText: string,
): CountryContext | null {
  return locations.map((location) => countryFromJsonLd(addressCountry(location))).find(Boolean)
    ?? countryFromPath(url)
    ?? countryFromLabel(linkText);
}

export interface CareersLocationFields {
  locations: string[];
  restrictions: string[];
}

export function careersLocationFields(
  jobLocations: JobLocationLd | JobLocationLd[] | undefined,
  applicantLocationRequirements: JobPostingLd['applicantLocationRequirements'],
  url: string,
  linkText = '',
): CareersLocationFields {
  const structuredLocations = asArray(jobLocations);
  const country = countryContextForPosting(structuredLocations, url, linkText);
  const locations = structuredLocations.map((location) => {
    const address = location.address ?? {};
    const locationCountry = countryFromJsonLd(address.addressCountry) ?? country;
    if (locationCountry) {
      const region = locationCountry.isUs ? address.addressRegion : undefined;
      return [address.addressLocality, region, locationCountry.name].filter(Boolean).join(', ');
    }
    const rawCountry = typeof address.addressCountry === 'string'
      ? address.addressCountry
      : address.addressCountry?.name;
    return [address.addressLocality, address.addressRegion, rawCountry].filter(Boolean).join(', ');
  }).filter(Boolean);
  if (!locations.length && country) locations.push(country.name);

  const restrictions = asArray(applicantLocationRequirements).map((requirement) => {
    if (typeof requirement === 'string') {
      if (
        country
        && !country.isUs
        && /^[A-Z]{2}$/i.test(requirement.trim())
        && requirement.trim().toUpperCase() !== 'US'
      ) return country.name;
      return requirement;
    }
    const requirementCountry = countryFromJsonLd(addressCountry(requirement)) ?? countryFromLabel(requirement.name ?? '');
    if (requirementCountry) {
      if (requirementCountry.isUs) return requirement.name || requirementCountry.name;
      const name = requirement.name?.trim();
      return name && !/^[A-Z]{2}$/i.test(name)
        ? `${name}, ${requirementCountry.name}`
        : requirementCountry.name;
    }
    if (country && !country.isUs) return country.name;
    const address = requirement.address ?? {};
    const rawCountry = typeof address.addressCountry === 'string'
      ? address.addressCountry
      : address.addressCountry?.name;
    return requirement.name || [address.addressLocality, address.addressRegion, rawCountry].filter(Boolean).join(', ');
  }).filter(Boolean);

  return { locations: [...new Set(locations)], restrictions };
}

export function jobPostingFrom(html: string): JobPostingLd | null {
  for (const m of html.matchAll(JSON_LD)) {
    try {
      const parsed = JSON.parse(m[1].trim()) as JobPostingLd | JobPostingLd[] | { '@graph'?: JobPostingLd[] };
      const nodes = Array.isArray(parsed) ? parsed : '@graph' in parsed && parsed['@graph'] ? parsed['@graph'] : [parsed as JobPostingLd];
      for (const node of nodes) {
        if (asArray(node['@type']).some((t) => /JobPosting/i.test(String(t)))) return node;
      }
    } catch { /* not JSON we can read */ }
  }
  return null;
}

function slugLooksLikeRole(url: string): boolean {
  const slug = decodeURIComponent(url).replace(/[-_+/.]+/g, ' ');
  return isRoleTitle(slug.slice(-160));
}

async function sitemapUrls(origin: string, deadline: number): Promise<string[]> {
  const out = new Set<string>();
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/jobs-sitemap.xml`];
  const seen = new Set<string>();
  while (queue.length && Date.now() < deadline) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let xml = '';
    try { xml = await fetchText(url, 15_000); } catch { continue; }
    for (const m of xml.matchAll(SITEMAP_TAG)) {
      const loc = m[1];
      if (/sitemap[^/]*\.xml(?:\.gz)?$/i.test(loc)) { if (!/\.gz$/i.test(loc)) queue.push(loc); continue; }
      if (JOB_URL.test(loc)) out.add(loc);
    }
  }
  return [...out];
}

function absolute(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Posting links from the careers page HTML itself (server-rendered lists). */
/**
 * Without JobPosting data the only proof that a URL is one posting (not a category page such
 * as "Project Management Jobs" or a service page called "Portfolio management") is a
 * requisition-style identifier in the URL plus a title that names a role, not a discipline.
 */
const POSTING_ID = /(?:[/_-]|[?&](?:job|jobid|req|reqid|id|posting|requisition)[a-z_]*=)(?:[a-z]{0,6}[-_]?)?\d{3,}(?:[/?#]|$)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ROLE_NOUN = /\b(manager|director|lead|coordinator|consultant|officer|head|vp|vice president|chief of staff|scrum master|specialist|analyst|partner|principal|executive|administrator|supervisor)\b/i;
const CATEGORY_TITLE = /\b(jobs|careers|opportunities|openings|positions|roles|team|teams|program|programme|department|area|areas|path|track|overview|services?)\s*$/i;
const NON_POSTING_PATH_SEGMENT = /^(?:.*[-_])?(?:news|blogs?|articles?|stor(?:y|ies)|resources?|knowledge[-_]?base|kb|press|events?|faqs?|guides?|profiles?|find[-_]a[-_]doctor|providers?|director(?:y|ies))(?:[-_].*)?$/i;
const NON_POSTING_FILE = /\.(?:pdf|docx?|rtf|txt|xlsx?|pptx?)(?:$|[?#])/i;
const GENERIC_POSTING_LINK_TEXT = /^(?:view|apply|details|learn more|read more|more info|see details|view job|view details|apply now)\b/i;
const NON_POSTING_LINK_TEXT = /^(?:meet|read\s+more|learn\s+more|read\s+about|hear\s+from|watch)\b/i;

function nonPostingPath(url: string): boolean {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).some((segment) => {
      let decoded = segment;
      try { decoded = decodeURIComponent(segment); } catch { /* use the encoded segment */ }
      return NON_POSTING_PATH_SEGMENT.test(decoded);
    });
  } catch {
    return false;
  }
}

export function looksLikePostingPage(url: string, text: string): boolean {
  if (!POSTING_ID.test(url) || nonPostingPath(url) || NON_POSTING_FILE.test(url)) return false;
  const title = (text ?? '').trim();
  return !!title && ROLE_NOUN.test(title) && !CATEGORY_TITLE.test(title);
}

function pageLinks(html: string, base: string, includeAnyJobPage = false): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(ANCHOR)) {
    const url = absolute(m[1], base);
    if (!url || nonPostingPath(url)) continue;
    const text = stripHtml(m[2]).trim();
    if (NON_POSTING_LINK_TEXT.test(text)) continue;
    if (text && isRoleTitle(text)) out.push({ url, text });
    else if (includeAnyJobPage && (JOB_URL.test(url) || POSTING_ID.test(url))) out.push({ url, text });
    else if (JOB_URL.test(url) && slugLooksLikeRole(url)) out.push({ url, text });
  }
  return out;
}

export function candidatePostingLinks(html: string, base: string): { url: string; text: string }[] {
  return pageLinks(html, base, true);
}

export function sweepCareersPostingLinks(html: string, base: string): { url: string; text: string }[] {
  return candidatePostingLinks(html, base).filter(({ url, text }) =>
    (text && isRoleTitle(text))
    || ((!text || GENERIC_POSTING_LINK_TEXT.test(text)) && (JOB_URL.test(url) || POSTING_ID.test(url))));
}

export interface CareersPageProbe {
  postings: number;
  matching: number;
  postingPaths: string[];
  postingIdentities: CareersPostingIdentity[];
  examplePostingUrl?: string;
  truncated: boolean;
}

export interface CareersPostingIdentity {
  path: string;
  title: string;
}

export function postingPathFromUrl(value: string): string {
  const url = new URL(value);
  return `${url.pathname}${url.search}`;
}

function normalizePostingTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function postingIdentityKeys(
  paths: string[],
  identities: CareersPostingIdentity[] | undefined,
): Set<string> {
  const pathSet = new Set(paths);
  const keys = new Set<string>();
  const identifiedPaths = new Set<string>();
  for (const { path, title } of identities ?? []) {
    if (!pathSet.has(path)) continue;
    const normalizedTitle = normalizePostingTitle(title);
    keys.add(normalizedTitle ? `${path}|${normalizedTitle}` : path);
    identifiedPaths.add(path);
  }
  for (const path of pathSet) {
    if (!identifiedPaths.has(path)) keys.add(path);
  }
  return keys;
}

export function sameCareersPostingSet(
  leftPaths: string[] | undefined,
  rightPaths: string[] | undefined,
  leftIdentities?: CareersPostingIdentity[],
  rightIdentities?: CareersPostingIdentity[],
): boolean {
  if (!leftPaths?.length || !rightPaths?.length) return false;
  const left = postingIdentityKeys(leftPaths, leftIdentities);
  const right = postingIdentityKeys(rightPaths, rightIdentities);
  if (left.size === right.size && [...left].every((key) => right.has(key))) return true;
  const smaller = Math.min(left.size, right.size);
  if (smaller < 2) return false;
  const overlap = [...left].filter((key) => right.has(key)).length;
  return overlap >= 2 && overlap / smaller >= 0.5;
}

function sameCareerSite(hostname: string, pageHost: string): boolean {
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, '');
  const host = normalize(hostname);
  const page = normalize(pageHost);
  return host === page || host.endsWith(`.${page}`) || page.endsWith(`.${host}`);
}

function titleFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '').replace(/[-_]+/g, ' ');
  } catch {
    return '';
  }
}

export async function inspectCareersPage(url: string, deadline: number): Promise<CareersPageProbe> {
  const result: CareersPageProbe = { postings: 0, matching: 0, postingPaths: [], postingIdentities: [], truncated: false };
  if (Date.now() >= deadline) return { ...result, truncated: true };
  let pageHtml: string;
  try {
    pageHtml = await fetchText(url, Math.min(20_000, deadline - Date.now()));
  } catch {
    return result;
  }
  const pageUrl = new URL(url);
  const candidates = new Map<string, { text: string }>();
  for (const link of candidatePostingLinks(pageHtml, url)) {
    let candidate: URL;
    try {
      candidate = new URL(link.url);
    } catch {
      continue;
    }
    if (!sameCareerSite(candidate.hostname, pageUrl.hostname)) continue;
    candidate.hash = '';
    if (!candidates.has(candidate.toString())) candidates.set(candidate.toString(), { text: link.text });
  }

  const seen = new Set<string>();
  for (const [candidateUrl, candidate] of candidates) {
    if (Date.now() >= deadline) { result.truncated = true; break; }
    const key = candidateUrl.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (NON_POSTING_FILE.test(candidateUrl)) continue;
    let html = '';
    try {
      html = await fetchText(candidateUrl, Math.min(20_000, deadline - Date.now()));
    } catch {
      continue;
    }
    const posting = jobPostingFrom(html);
    const urlTitle = titleFromUrl(candidateUrl);
    if (!posting && !looksLikePostingPage(candidateUrl, candidate.text || urlTitle)) continue;
    const identityTitle = (posting?.title ?? candidate.text).trim();
    const title = (identityTitle || urlTitle).trim();
    result.postings += 1;
    if (title && isRoleTitle(title)) result.matching += 1;
    const path = postingPathFromUrl(candidateUrl);
    result.postingPaths.push(path);
    result.postingIdentities.push({ path, title: identityTitle });
    result.examplePostingUrl ??= candidateUrl;
  }
  result.postingPaths = [...new Set(result.postingPaths)].sort();
  const identities = new Map<string, CareersPostingIdentity>();
  for (const identity of result.postingIdentities) {
    const title = normalizePostingTitle(identity.title);
    identities.set(`${identity.path}\u0000${title}`, identity);
  }
  result.postingIdentities = [...identities.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || normalizePostingTitle(left.title).localeCompare(normalizePostingTitle(right.title)));
  return result;
}

export async function fetchCareersPage(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const base = employer.careers_url ?? '';
  if (!/^https?:\/\//i.test(base)) return { jobs: [], ok: false, error: 'no careers url', totalListed: 0 };
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const origin = new URL(base).origin;
  const source = `careers:${employer.slug || new URL(base).hostname}`;

  const candidates = new Map<string, string>();
  try {
    const html = await fetchText(base, 20_000);
    for (const link of sweepCareersPostingLinks(html, base)) candidates.set(link.url, link.text);
  } catch (err) {
    return { jobs: [], ok: false, error: `careers page: ${(err as Error).message}`, retryable: true, totalListed: 0 };
  }
  for (const url of await sitemapUrls(origin, deadline)) {
    if (!candidates.has(url) && slugLooksLikeRole(url)) candidates.set(url, '');
  }

  const jobs: RawJob[] = [];
  let truncated = false;
  for (const [url, text] of candidates) {
    if (Date.now() > deadline) { truncated = true; break; }
    if (nonPostingPath(url) || NON_POSTING_LINK_TEXT.test(text)) continue;
    const externalId = url.replace(origin, '').slice(0, 180);
    if (known?.has(`${source}:${externalId}`)) {
      jobs.push({ source, externalId, company: employer.name, title: text, locations: [], applyUrl: url, linkType: 'employer', unchanged: true });
      continue;
    }
    let html = '';
    try { html = await fetchText(url, 20_000); } catch { continue; }
    const ld = jobPostingFrom(html);
    if (!ld && !looksLikePostingPage(url, text)) continue;
    const title = (ld?.title ?? text ?? '').trim();
    if (!title || !isRoleTitle(title, undefined, employer)) continue;
    const { locations, restrictions } = careersLocationFields(ld?.jobLocation, ld?.applicantLocationRequirements, url, text);
    const remote = /TELECOMMUTE/i.test(ld?.jobLocationType ?? '') ? true : null;
    const description = ld?.description ? stripHtml(ld.description) : stripHtml(html).slice(0, 25_000);
    const posted = isoDate(ld?.datePosted ?? '');
    const identifier = typeof ld?.identifier === 'string' ? ld.identifier : ld?.identifier?.value;
    jobs.push({
      source,
      externalId,
      company: employer.name,
      title,
      locations,
      restrictions,
      workplaceType: remote ? 'remote' : null,
      isRemote: remote,
      descriptionHtml: ld?.description ?? null,
      descriptionText: description,
      applyUrl: ld?.url || url,
      linkType: 'employer',
      postedAt: posted,
      postedConfidence: posted ? 'confirmed' : 'unknown',
      employmentType: asArray(ld?.employmentType).join(', ') || null,
      requisitionId: identifier ?? null,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: candidates.size, truncated };
}

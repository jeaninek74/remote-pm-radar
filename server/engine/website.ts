import { createHash } from 'node:crypto';
import {
  inspectCareersPage,
  type CareersPostingIdentity,
} from './careers';
import { isNonEmployerBoard, NON_EMPLOYER_BOARDS } from './harvest';
import { resolveBoard, type BoardResolution } from './resolve';
import { fetchTextWithHttpsFallback } from './http';
import { registrableDomain } from './registrable-domain';

export type ExpansionResult = BoardResolution
  | {
    kind: 'careers';
    careersUrl: string;
    postings: number;
    matching: number;
    postingPaths?: string[];
    postingIdentities?: CareersPostingIdentity[];
    examplePostingUrl?: string;
    truncated?: boolean;
  }
  | { kind: 'skipped'; reason: string };

export const CAREERS_LINK = /careers?|jobs|employment|join (?:us|our team)|work (?:with|for|at) us|job (?:postings|openings|opportunities)|open positions|current openings|human resources|\bhr\b/i;
export const STRONG_CAREERS_LINK = /\b(careers?|jobs? (?:at|with)|job (?:postings|openings|opportunities)|employment(?: opportunities)?|work (?:with|for|at) us|join (?:us|our team)|open positions|current openings|human resources|hr)\b/i;
export const EXCLUDED_CAREERS_LINK = /career[\s_-]*(?:services?|ed(?:ucation)?|center|development|readiness|pathways?)|student|alumni|hire[\s-]*a[\s-]*grad|externship|internship program|employee[\s-]*directory/i;
export const STAFF_CAREERS_LINK = /\b(staff|faculty|employees?|administrative)\b/i;
export const ATS_HOSTS = [
  'myworkdayjobs.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'smartrecruiters.com',
  'oraclecloud.com',
  'dayforcehcm.com',
  'icims.com',
  'phenompeople.com',
  'phenom.com',
  'successfactors.com',
  'jobs.sap.com',
  'avature.net',
  'taleo.net',
  'eightfold.ai',
  'talentbrew.com',
  'tbcdn.com',
  'paradox.ai',
  'ultipro.com',
  'ukg.com',
  'jobvite.com',
  'adp.com',
  'csod.com',
  'rippling.com',
  'entertimeonline.com',
  'peopleadmin.com',
  'governmentjobs.com',
  'schooljobs.com',
  'applitrack.com',
];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NON_PRODUCTION_HOST_LABEL = /^(?:staging|stage|dev|test|qa|uat)\d*$/i;

export function normalizeWebsite(website: string): string {
  const value = website.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new Error('website must use http or https');
  return url.toString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function sameSite(url: URL, homepage: URL): boolean {
  const host = url.hostname.toLowerCase();
  const homeHost = homepage.hostname.toLowerCase();
  if (host === homeHost || host.endsWith(`.${homeHost}`) || homeHost.endsWith(`.${host}`)) return true;
  const baseDomain = (value: string) => value.split('.').slice(-2).join('.');
  return baseDomain(host) === baseDomain(homeHost);
}

export function mainSiteUrl(value: string): string {
  const url = new URL(value);
  const labels = url.hostname.toLowerCase().split('.');
  const domain = registrableDomain(url.hostname);
  const subdomainCount = labels.length - domain.split('.').length;
  if (labels.slice(0, subdomainCount).some((label) => NON_PRODUCTION_HOST_LABEL.test(label))) {
    url.hostname = domain;
  }
  return url.toString();
}

export function isAtsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ATS_HOSTS.some((atsHost) => host === atsHost || host.endsWith(`.${atsHost}`));
}

function sameSiteOrAts(url: URL, homepage: URL): boolean {
  return sameSite(url, homepage) || isAtsHost(url.hostname);
}

export function excludedCareerLink(href: string, text = ''): boolean {
  const value = `${href}\n${text}`;
  return (EXCLUDED_CAREERS_LINK.test(href) || EXCLUDED_CAREERS_LINK.test(text))
    && !STAFF_CAREERS_LINK.test(value);
}

export async function careersLinks(pageUrl: string, deadline: number): Promise<string[]> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return [];
  try {
    const { text: html, url } = await fetchTextWithHttpsFallback(
      pageUrl,
      Math.min(10_000, remaining),
      'text/html,application/xhtml+xml',
      BROWSER_USER_AGENT,
    );
    const base = new URL(url || pageUrl);
    const anchors = html.matchAll(
      /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    );
    const seen = new Set<string>();
    const links: { url: string; priority: number; order: number }[] = [];
    for (const match of anchors) {
      const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? '').trim();
      const text = decodeHtml((match[4] ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!CAREERS_LINK.test(href) && !CAREERS_LINK.test(text)) continue;
      try {
        const target = new URL(href, base);
        if ((target.protocol === 'https:' || target.protocol === 'http:') && sameSiteOrAts(target, base)) {
          if (target.protocol === 'http:') target.protocol = 'https:';
          const careerTarget = isAtsHost(target.hostname)
            ? target
            : new URL(mainSiteUrl(target.toString()));
          if (excludedCareerLink(href, text) && !isAtsHost(careerTarget.hostname)) continue;
          const url = careerTarget.toString();
          if (seen.has(url)) continue;
          seen.add(url);
          const studentOnly = excludedCareerLink(href, text);
          const priority = studentOnly
            ? 3
            : isAtsHost(careerTarget.hostname)
              ? 0
              : STRONG_CAREERS_LINK.test(`${href}\n${text}`) ? 1 : 2;
          links.push({ url, priority, order: links.length });
        }
      } catch {
        continue;
      }
    }
    return links
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((link) => link.url);
  } catch {
    return [];
  }
}

export async function resolveWebsite(name: string, website: string, deadline: number): Promise<ExpansionResult> {
  let homepage: string;
  try {
    const normalizedWebsite = normalizeWebsite(website);
    homepage = isAtsHost(new URL(normalizedWebsite).hostname)
      ? normalizedWebsite
      : mainSiteUrl(normalizedWebsite);
  } catch (error) {
    return { kind: 'unknown', reason: `invalid website: ${(error as Error).message}` };
  }

  type UnknownResolution = Extract<BoardResolution, { kind: 'unknown' }>;
  let unreadable: Extract<BoardResolution, { kind: 'unreadable' }> | null = null;
  let firstCareersUnknown: UnknownResolution | null = null;
  let homepageUnknown: UnknownResolution | null = null;
  let firstFallbackUnknown: UnknownResolution | null = null;
  let first404: UnknownResolution | null = null;
  const homepageUrl = new URL(homepage);
  const careerPages = new Set<string>();
  const triedUrls = new Set<string>();
  const tryUrl = async (
    url: string,
    source: 'homepage' | 'careers' | 'fallback' = 'careers',
  ): Promise<Extract<BoardResolution, { kind: 'board' }> | null> => {
    if (Date.now() >= deadline) return null;
    let normalizedUrl: string;
    try {
      const target = new URL(url);
      normalizedUrl = !isAtsHost(target.hostname) && sameSite(target, homepageUrl)
        ? mainSiteUrl(target.toString())
        : target.toString();
    } catch {
      return null;
    }
    if (triedUrls.has(normalizedUrl)) return null;
    triedUrls.add(normalizedUrl);
    const result = await resolveBoard(name, normalizedUrl, deadline, { useHttpsFallback: true });
    if (result.kind === 'board') {
      return result;
    }
    const inspectableCareersPage = result.kind === 'unreadable'
      || (result.kind === 'unknown' && /\bHTTP\s+200\b/i.test(result.reason));
    if (
      inspectableCareersPage
      && sameSite(new URL(normalizedUrl), homepageUrl)
      && !isAtsHost(new URL(normalizedUrl).hostname)
      && !excludedCareerLink(normalizedUrl)
      && (source !== 'homepage' || CAREERS_LINK.test(new URL(normalizedUrl).pathname))
    ) {
      careerPages.add(canonicalCareersUrl(normalizedUrl));
    }
    if (result.kind === 'unreadable') unreadable ??= result;
    else if (/\bHTTP\s+404\b/i.test(result.reason)) first404 ??= result;
    else if (source === 'homepage') homepageUnknown ??= result;
    else if (source === 'fallback') firstFallbackUnknown ??= result;
    else firstCareersUnknown ??= result;
    return null;
  };

  const homepageResult = await tryUrl(homepage, 'homepage');
  if (homepageResult) return homepageResult;

  const hopPages: string[] = [];
  for (const careersLink of await careersLinks(homepage, deadline)) {
    if (Date.now() >= deadline) break;
    const normalizedUrl = new URL(careersLink).toString();
    const wasTried = triedUrls.has(normalizedUrl);
    const result = await tryUrl(careersLink);
    if (result) return result;
    if (!wasTried && triedUrls.has(normalizedUrl) && sameSite(new URL(careersLink), homepageUrl)) {
      hopPages.push(normalizedUrl);
    }
  }

  for (const pageUrl of hopPages) {
    if (Date.now() >= deadline) break;
    for (const careersLink of await careersLinks(pageUrl, deadline)) {
      if (Date.now() >= deadline) break;
      if (triedUrls.has(new URL(careersLink).toString())) continue;
      const result = await tryUrl(careersLink);
      if (result) return result;
    }
  }

  const origin = new URL(homepage).origin;
  for (const path of ['/careers', '/jobs', '/employment']) {
    const result = await tryUrl(new URL(path, origin).toString(), 'fallback');
    if (result) return result;
  }

  for (const careersUrl of careerPages) {
    if (Date.now() >= deadline) break;
    const probe = await inspectCareersPage(careersUrl, deadline, { useHttpsFallback: true });
    if (probe.postings > 0) {
      return {
        kind: 'careers',
        careersUrl,
        postings: probe.postings,
        matching: probe.matching,
        postingPaths: probe.postingPaths,
        postingIdentities: probe.postingIdentities,
        examplePostingUrl: probe.examplePostingUrl,
        truncated: probe.truncated,
      };
    }
  }

  return unreadable
    ?? firstCareersUnknown
    ?? homepageUnknown
    ?? firstFallbackUnknown
    ?? first404
    ?? { kind: 'unknown', reason: 'no supported board found' };
}

export function bestCareersPage<T extends { careersUrl: string; postings: number }>(pages: T[]): T | null {
  let best: T | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const page of pages) {
    if (page.postings <= 0) continue;
    const depth = new URL(page.careersUrl).pathname.split('/').filter(Boolean).length;
    if (!best || page.postings > best.postings || (page.postings === best.postings && depth < bestDepth)) {
      best = page;
      bestDepth = depth;
    }
  }
  return best;
}

export async function resolveWdcPostingPages(
  name: string,
  domain: string,
  pageUrls: string[],
  deadline: number,
): Promise<ExpansionResult | null> {
  const homepage = new URL(`https://${domain}/`);
  const visited = new Set<string>();
  const careersPages: {
    careersUrl: string;
    postings: number;
    matching: number;
    postingPaths: string[];
    postingIdentities: CareersPostingIdentity[];
    examplePostingUrl?: string;
    truncated: boolean;
  }[] = [];
  for (const pageValue of pageUrls.slice(0, 8)) {
    if (Date.now() >= deadline) break;
    let page: URL;
    try {
      page = new URL(pageValue);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(page.protocol) || !sameSite(page, homepage)) continue;
    page = new URL(mainSiteUrl(page.toString()));
    if (!sameSite(page, homepage)) continue;
    page.protocol = 'https:';
    let postingPageLive = true;
    try {
      await fetchTextWithHttpsFallback(page.toString(), Math.min(15_000, deadline - Date.now()));
    } catch {
      postingPageLive = false;
    }

    if (postingPageLive) {
      const board = await resolveBoard(name, page.toString(), deadline, { useHttpsFallback: true });
      if (board.kind === 'board') return board;
    }

    const paths = postingPageLive ? [page.pathname] : [];
    const segments = page.pathname.split('/').filter(Boolean);
    for (let length = Math.max(0, segments.length - 1); length >= 0; length -= 1) {
      paths.push(length ? `/${segments.slice(0, length).join('/')}/` : '/');
    }
    for (const path of paths) {
      if (Date.now() >= deadline) break;
      const target = new URL(path, page.origin);
      if (!sameSite(target, homepage)) continue;
      const key = target.toString();
      if (visited.has(key)) continue;
      visited.add(key);
      const probe = await inspectCareersPage(key, deadline, { useHttpsFallback: true });
      if (probe.postings > 0) {
        careersPages.push({
          careersUrl: key,
          postings: probe.postings,
          matching: probe.matching,
          postingPaths: probe.postingPaths,
          postingIdentities: probe.postingIdentities,
          examplePostingUrl: probe.examplePostingUrl,
          truncated: probe.truncated,
        });
      }
    }
  }
  const best = bestCareersPage(careersPages);
  return best ? { kind: 'careers', ...best } : null;
}

function canonicalCareersUrlObject(value: string): URL {
  const url = new URL(value);
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  return url;
}

export function canonicalCareersUrl(value: string): string {
  return canonicalCareersUrlObject(value).toString();
}

function sortedQuery(url: URL): string {
  const sortedParams = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return new URLSearchParams(sortedParams).toString();
}

export function normalizedCareersUrl(value: string): string {
  const url = canonicalCareersUrlObject(value);
  const query = sortedQuery(url);
  return `${url.host.toLowerCase()}${url.pathname.toLowerCase()}${query ? `?${query}` : ''}`;
}

export function careersSlug(value: string): string {
  const url = canonicalCareersUrlObject(value);
  const query = sortedQuery(url);
  const host = url.host.toLowerCase();
  const path = url.pathname === '/' ? '' : url.pathname;
  const slug = `${host}${path}${query ? `?${query}` : ''}`;
  if (query && slug.length > 120) {
    const queryHash = createHash('sha1').update(query).digest('hex').slice(0, 10);
    return `${host}${path}?q=${queryHash}`;
  }
  return slug;
}

export interface ParsedWdcQuad {
  subject: string;
  predicate: string;
  object: string;
  graph: string;
  property: string;
}

export interface WdcDomainAggregate {
  domain: string;
  pageCount: number;
  pageUrls: string[];
  organizationNameCounts: Record<string, number>;
  addressCountryCounts: Record<string, number>;
  telecommuteCount: number;
}

export interface WebsiteCandidate extends WdcDomainAggregate {
  name: string;
  topOrganizationName: string | null;
}

export interface WebsiteCandidateFilterCounts {
  inputDomains: number;
  withJobPostingPages: number;
  afterOrganizationLimit: number;
  afterCountryFilter: number;
  afterCountryCodeFilter: number;
  afterDomainFilter: number;
  afterTemplateFilter: number;
  templateOrganizationNames: number;
  domainNameFallbacks: number;
}

interface MutableWdcDomain {
  domain: string;
  pageCount: number;
  pageUrls: Set<string>;
  organizationNameCounts: Map<string, number>;
  addressCountryCounts: Map<string, number>;
  telecommuteCount: number;
}

const WDC_QUAD_LINE = /^(\S+) <([^>]+)> (.+) <([^>]+)>\s+\.$/;
const TEMPLATE_ORGANIZATION_DOMAIN_LIMIT = 20;
const US_COUNTRY_NAMES = new Set([
  'US',
  'USA',
  'UNITED STATES',
  'UNITED STATES OF AMERICA',
]);
const JOB_BOARD_DOMAIN = /job|career|hire|hiring|indeed|monster|glassdoor|linkedin|ziprecruiter|remote/i;

export function parseWdcQuad(line: string): ParsedWdcQuad | null {
  const match = WDC_QUAD_LINE.exec(line.trim());
  if (!match) return null;
  const predicate = match[2];
  return {
    subject: match[1],
    predicate,
    object: match[3],
    graph: match[4],
    property: predicate.split(/[/#]/).pop() ?? '',
  };
}

function literalValue(value: string): string | null {
  const match = /^"((?:\\.|[^"\\])*)"/.exec(value);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\(["\\])/g, '$1').replace(/\\n/g, ' ');
  }
}

function cleanOrganizationName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function mutableDomain(domain: string, domains: Map<string, MutableWdcDomain>): MutableWdcDomain {
  let result = domains.get(domain);
  if (!result) {
    result = {
      domain,
      pageCount: 0,
      pageUrls: new Set(),
      organizationNameCounts: new Map(),
      addressCountryCounts: new Map(),
      telecommuteCount: 0,
    };
    domains.set(domain, result);
  }
  return result;
}

function rememberPageSample(sample: Set<string>, page: string): void {
  if (sample.has(page)) return;
  if (sample.size < 8) {
    sample.add(page);
    return;
  }
  const largest = [...sample].sort().at(-1);
  if (largest && page < largest) {
    sample.delete(largest);
    sample.add(page);
  }
}

export class WdcAggregator {
  private readonly domains = new Map<string, MutableWdcDomain>();
  private currentGraph: string | null = null;
  private currentDomain = '';
  private currentPageCounted = false;
  private readonly pageNodeNames = new Map<string, string>();
  private readonly pagePostingOrganizations = new Map<string, string>();

  addLine(line: string): void {
    const quad = parseWdcQuad(line);
    if (!quad) return;
    if (quad.graph !== this.currentGraph) {
      this.flushPage();
      this.currentGraph = quad.graph;
      this.currentDomain = registrableDomain(quad.graph);
      this.currentPageCounted = false;
    }
    if (!this.currentDomain) return;
    const site = mutableDomain(this.currentDomain, this.domains);
    if (quad.property === 'type' && quad.object.includes('JobPosting')) {
      if (!this.currentPageCounted) {
        // WDC quads are grouped by page, so one graph run counts once.
        this.currentPageCounted = true;
        site.pageCount += 1;
        // Copy so the stored URL does not keep the whole quad line in memory.
        rememberPageSample(site.pageUrls, Buffer.from(quad.graph).toString());
      }
    } else if (quad.property === 'hiringOrganization') {
      this.pagePostingOrganizations.set(quad.subject, quad.object);
    } else if (quad.property === 'name') {
      this.pageNodeNames.set(quad.subject, quad.object.slice(0, 80));
    } else if (quad.property === 'addressCountry') {
      const country = (literalValue(quad.object) ?? quad.object.replace(/[<>]/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 100);
      if (country) site.addressCountryCounts.set(country, (site.addressCountryCounts.get(country) ?? 0) + 1);
    } else if (quad.property === 'jobLocationType' && quad.object.toUpperCase().includes('TELECOMMUTE')) {
      site.telecommuteCount += 1;
    }
  }

  private flushPage(): void {
    const site = this.currentDomain ? this.domains.get(this.currentDomain) : undefined;
    if (site) {
      for (const organization of this.pagePostingOrganizations.values()) {
        const nodeName = this.pageNodeNames.get(organization);
        const rawName = nodeName ?? organization.slice(0, 80);
        const name = cleanOrganizationName(literalValue(rawName) ?? (rawName.startsWith('<') ? '' : rawName));
        if (!name) continue;
        site.organizationNameCounts.set(name, (site.organizationNameCounts.get(name) ?? 0) + 1);
      }
    }
    this.pageNodeNames.clear();
    this.pagePostingOrganizations.clear();
  }

  finish(): WdcDomainAggregate[] {
    this.flushPage();
    return [...this.domains.values()].map((site) => ({
      domain: site.domain,
      pageCount: site.pageCount,
      pageUrls: [...site.pageUrls].sort().slice(0, 8),
      organizationNameCounts: Object.fromEntries(site.organizationNameCounts),
      addressCountryCounts: Object.fromEntries(site.addressCountryCounts),
      telecommuteCount: site.telecommuteCount,
    }));
  }
}

export function aggregateWdcQuads(lines: Iterable<string>): WdcDomainAggregate[] {
  const aggregator = new WdcAggregator();
  for (const line of lines) aggregator.addLine(line);
  return aggregator.finish();
}

export function mergeWdcAggregates(
  target: Map<string, WdcDomainAggregate>,
  part: WdcDomainAggregate[],
): void {
  for (const incoming of part) {
    const existing = target.get(incoming.domain);
    if (!existing) {
      target.set(incoming.domain, {
        ...incoming,
        pageUrls: [...incoming.pageUrls].sort().slice(0, 8),
        organizationNameCounts: { ...incoming.organizationNameCounts },
        addressCountryCounts: { ...incoming.addressCountryCounts },
      });
      continue;
    }
    existing.pageCount += incoming.pageCount;
    existing.pageUrls = [...new Set([...existing.pageUrls, ...incoming.pageUrls])].sort().slice(0, 8);
    for (const [name, count] of Object.entries(incoming.organizationNameCounts)) {
      existing.organizationNameCounts[name] = (existing.organizationNameCounts[name] ?? 0) + count;
    }
    for (const [country, count] of Object.entries(incoming.addressCountryCounts)) {
      existing.addressCountryCounts[country] = (existing.addressCountryCounts[country] ?? 0) + count;
    }
    existing.telecommuteCount += incoming.telecommuteCount;
  }
}

function normalizedOrganizationName(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

function compactName(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]/gu, '');
}

function organizationNameMatchesDomain(name: string, domain: string): boolean {
  const firstNameToken = compactName(name.trim().split(/\s+/)[0] ?? '');
  const compactedName = compactName(name);
  const domainLabel = compactName(domain.split('.')[0] ?? '');
  return Boolean(domainLabel && (
    domainLabel.includes(firstNameToken)
    || domainLabel.includes(compactedName)
    || firstNameToken.includes(domainLabel)
    || compactedName.includes(domainLabel)
  ));
}

function topOrganization(aggregate: WdcDomainAggregate): { name: string; key: string; count: number } | null {
  const grouped = new Map<string, { name: string; count: number }>();
  for (const [name, count] of Object.entries(aggregate.organizationNameCounts)) {
    const key = normalizedOrganizationName(name);
    if (!key) continue;
    const current = grouped.get(key);
    if (current) current.count += count;
    else grouped.set(key, { name, count });
  }
  const top = [...grouped.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  return top ?? null;
}

function isUsOrRemote(aggregate: WdcDomainAggregate): boolean {
  let totalCountryCount = 0;
  let usCountryCount = 0;
  for (const [country, count] of Object.entries(aggregate.addressCountryCounts)) {
    if (count <= 0) continue;
    totalCountryCount += count;
    if (US_COUNTRY_NAMES.has(country.replace(/\s+/g, ' ').trim().toUpperCase())) {
      usCountryCount += count;
    }
  }
  return totalCountryCount === 0
    ? aggregate.telecommuteCount > 0
    : usCountryCount * 2 >= totalCountryCount;
}

function isCountryCodeDomain(domain: string): boolean {
  const tld = domain.toLowerCase().split('.').at(-1) ?? '';
  return /^[a-z]{2}$/.test(tld) && !['us', 'io', 'ai', 'co'].includes(tld);
}

function isExcludedCandidateDomain(domain: string): boolean {
  const normalized = domain.toLowerCase();
  const matchesAtsHost = isAtsHost(normalized)
    || ATS_HOSTS.some((host) => host.endsWith(`.${normalized}`));
  if (matchesAtsHost || JOB_BOARD_DOMAIN.test(normalized)) return true;
  const labels = normalized.split('.');
  return [...NON_EMPLOYER_BOARDS].some((board) => {
    const separator = board.indexOf(':');
    if (separator < 0) return false;
    const ats = board.slice(0, separator);
    const slug = board.slice(separator + 1);
    return labels.includes(slug) && isNonEmployerBoard(ats, slug);
  });
}

export function filterWebsiteCandidates(aggregates: WdcDomainAggregate[]): {
  candidates: WebsiteCandidate[];
  counts: WebsiteCandidateFilterCounts;
} {
  const withJobPostingPages = aggregates.filter((aggregate) => aggregate.pageCount > 0);
  const templateDomainsByOrganization = new Map<string, Set<string>>();
  const topNames = new Map<string, { name: string; key: string }>();
  for (const aggregate of withJobPostingPages) {
    const top = topOrganization(aggregate);
    if (!top) continue;
    topNames.set(aggregate.domain, top);
    const domains = templateDomainsByOrganization.get(top.key) ?? new Set<string>();
    domains.add(aggregate.domain);
    templateDomainsByOrganization.set(top.key, domains);
  }
  const templateNames = new Set(
    [...templateDomainsByOrganization.entries()]
      .filter(([, domains]) => domains.size > TEMPLATE_ORGANIZATION_DOMAIN_LIMIT)
      .map(([name]) => name),
  );

  const afterOrganization = withJobPostingPages.filter((aggregate) => {
    const distinct = new Set(Object.keys(aggregate.organizationNameCounts).map(normalizedOrganizationName));
    return distinct.size <= 2;
  });
  const afterCountry = afterOrganization.filter(isUsOrRemote);
  const afterCountryCode = afterCountry.filter((aggregate) => !isCountryCodeDomain(aggregate.domain));
  const afterDomain = afterCountryCode.filter((aggregate) => !isExcludedCandidateDomain(aggregate.domain));
  const domainNameFallbacks = afterDomain.filter((aggregate) => {
    const top = topNames.get(aggregate.domain);
    return !top
      || templateNames.has(top.key)
      || top.key === 'google'
      || !organizationNameMatchesDomain(top.name, aggregate.domain);
  }).length;
  const candidates = afterDomain.map((aggregate) => {
      const top = topNames.get(aggregate.domain);
      const domainNameFallback = !top
        || templateNames.has(top.key)
        || top.key === 'google'
        || !organizationNameMatchesDomain(top.name, aggregate.domain);
      return {
        ...aggregate,
        name: domainNameFallback ? aggregate.domain : top.name,
        topOrganizationName: domainNameFallback ? null : top.name,
      };
    });

  return {
    candidates,
    counts: {
      inputDomains: aggregates.length,
      withJobPostingPages: withJobPostingPages.length,
      afterOrganizationLimit: afterOrganization.length,
      afterCountryFilter: afterCountry.length,
      afterCountryCodeFilter: afterCountryCode.length,
      afterDomainFilter: afterDomain.length,
      afterTemplateFilter: candidates.length,
      templateOrganizationNames: templateNames.size,
      domainNameFallbacks,
    },
  };
}

export interface CareersSiteInput {
  domain: string;
  name: string;
  source: string;
  result: Exclude<ExpansionResult, { kind: 'skipped' }>;
}

const WEBSITE_BOARD_ATS = new Set([
  'greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'smartrecruiters',
  'workday', 'oracle', 'dayforce', 'icims', 'ukg', 'adp', 'taleo',
  'successfactors', 'neogov', 'phenom', 'haley', 'zenople', 'crelate', 'avionte',
]);

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isCareersSitesPayload(value: unknown): value is { results: CareersSiteInput[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const results = (value as Record<string, unknown>).results;
  if (!Array.isArray(results) || results.length > 50) return false;
  const validResults = results.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    if (
      typeof record.domain !== 'string'
      || !record.domain
      || record.domain.length > 253
      || record.domain !== record.domain.toLowerCase()
      || registrableDomain(record.domain) !== record.domain
      || typeof record.name !== 'string'
      || !record.name.trim()
      || record.name.length > 300
      || record.source !== 'Web Data Commons JobPosting 2024-12'
      || !record.result
      || typeof record.result !== 'object'
      || Array.isArray(record.result)
    ) return false;
    const result = record.result as Record<string, unknown>;
    if (result.kind === 'board') {
      return typeof result.ats === 'string'
        && WEBSITE_BOARD_ATS.has(result.ats)
        && typeof result.slug === 'string'
        && result.slug.length > 0
        && result.slug.length <= 253
        && isWebUrl(result.careersUrl)
        && typeof result.total === 'number'
        && Number.isInteger(result.total)
        && result.total >= 0;
    }
    if (result.kind === 'careers') {
      if (!isWebUrl(result.careersUrl)
        || typeof result.postings !== 'number'
        || !Number.isInteger(result.postings)
        || result.postings < 0
        || typeof result.matching !== 'number'
        || !Number.isInteger(result.matching)
        || result.matching < 0) return false;
      if (result.postingPaths !== undefined
        && (!Array.isArray(result.postingPaths) || !result.postingPaths.every((value) => typeof value === 'string'))) {
        return false;
      }
      if (result.postingIdentities !== undefined
        && (!Array.isArray(result.postingIdentities) || !result.postingIdentities.every((identity) => {
          if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
          const itemRecord = identity as Record<string, unknown>;
          return typeof itemRecord.path === 'string' && typeof itemRecord.title === 'string';
        }))) return false;
      return (result.examplePostingUrl === undefined || isWebUrl(result.examplePostingUrl))
        && (result.truncated === undefined || typeof result.truncated === 'boolean');
    }
    if (result.kind === 'unknown') return typeof result.reason === 'string' && result.reason.length <= 500;
    if (result.kind === 'unreadable') {
      return typeof result.platform === 'string'
        && result.platform.length <= 100
        && (result.reason === undefined || (typeof result.reason === 'string' && result.reason.length <= 500));
    }
    return false;
  });
  return validResults
    && new Set(results.map((item) => (item as Record<string, unknown>).domain)).size === results.length;
}

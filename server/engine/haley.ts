import { isIP } from 'node:net';
import { REFRESH } from '../config';
import { careersLocationFields, jobPostingFrom, type JobPostingLd } from './careers';
import { fetchText, mapLimit } from './http';
import { parseSalaryFromText, parseUsdBaseSalary, type ParsedSalary } from './salary';
import { isRoleTitle } from './titles';
import { isoDate, stripHtml } from './text';
import type { BoardFetchResult, EmployerRow, RawJob } from './types';

export interface HaleySitemap {
  kind: 'sitemapindex' | 'urlset' | 'other';
  locations: string[];
}

export interface HaleyPostingLink {
  id: string;
  title: string;
}

export function haleySalary(posting: JobPostingLd, descriptionText: string): ParsedSalary | null {
  return parseUsdBaseSalary(posting.baseSalary, 'Haley Marketing base salary')
    ?? parseSalaryFromText(descriptionText, 'Haley Marketing posting');
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseHaleySitemapXml(xml: string): HaleySitemap {
  const kind = /<sitemapindex(?:\s|>)/i.test(xml)
    ? 'sitemapindex'
    : /<urlset(?:\s|>)/i.test(xml) ? 'urlset' : 'other';
  const locations = [...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
  return { kind, locations };
}

export function haleyPostingLink(value: string): HaleyPostingLink | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const jbIndex = segments.findIndex((segment) => segment.toLowerCase() === 'jb');
    if (jbIndex < 0 || !segments[jbIndex + 1] || !/^\d+$/.test(segments[jbIndex + 2] ?? '')) return null;
    const slug = decodeURIComponent(segments[jbIndex + 1]);
    const titleSlug = /^(.+?)-Jobs-in-/i.exec(slug)?.[1];
    if (!titleSlug) return null;
    return {
      id: segments[jbIndex + 2],
      title: titleSlug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  } catch {
    return null;
  }
}

export function haleyRoleLinks(urls: string[], employer: EmployerRow): (HaleyPostingLink & { url: string })[] {
  return urls.flatMap((url) => {
    const posting = haleyPostingLink(url);
    return posting && isRoleTitle(posting.title, undefined, employer) ? [{ ...posting, url }] : [];
  });
}

function httpsUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
}

function unsafeHost(host: string): boolean {
  return isIP(host) !== 0 || host === 'localhost' || host.endsWith('.localhost');
}

function registrableDomain(host: string): string {
  return host.split('.').slice(-2).join('.');
}

export function normalizeHaleySitemapUrl(value: string, base: string, boardHost: string): string | null {
  const normalizedUrl = httpsUrl(value, base);
  if (!normalizedUrl) return null;
  try {
    const url = new URL(normalizedUrl);
    const host = normalizedHost(url.hostname);
    const board = normalizedHost(new URL(`https://${boardHost}`).hostname);
    if (unsafeHost(host) || unsafeHost(board)) return null;
    if (host !== board && registrableDomain(host) !== registrableDomain(board)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function haleySitemapJobs(
  host: string,
  deadline: number,
): Promise<{ urls: string[]; truncated: boolean }> {
  const start = normalizeHaleySitemapUrl(`https://${host}/sitemap.xml`, `https://${host}/`, host);
  if (!start) throw new Error('Invalid Haley Marketing sitemap host');
  const queue = [start];
  const seenSitemaps = new Set<string>();
  const jobUrls = new Set<string>();
  let truncated = false;

  while (queue.length) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const sitemapUrl = queue.shift()!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    let xml: string;
    try {
      xml = await fetchText(sitemapUrl, Math.min(20_000, Math.max(1, deadline - Date.now())));
    } catch (error) {
      if (sitemapUrl === start) throw error;
      truncated = true;
      continue;
    }
    const sitemap = parseHaleySitemapXml(xml);
    if (sitemap.kind === 'sitemapindex') {
      for (const location of sitemap.locations) {
        const childUrl = normalizeHaleySitemapUrl(location, sitemapUrl, host);
        if (childUrl && !seenSitemaps.has(childUrl)) queue.push(childUrl);
      }
      continue;
    }
    if (sitemap.kind !== 'urlset') continue;
    for (const location of sitemap.locations) {
      const jobUrl = normalizeHaleySitemapUrl(location, sitemapUrl, host);
      if (jobUrl && /\/jb\//i.test(new URL(jobUrl).pathname)) jobUrls.add(jobUrl);
    }
  }

  return { urls: [...jobUrls], truncated };
}

function unchangedJob(source: string, employer: EmployerRow, id: string, title: string, url: string): RawJob {
  return {
    source,
    ats: 'haley',
    board: employer.slug,
    externalId: id,
    company: employer.name,
    title,
    locations: [],
    applyUrl: url,
    linkType: 'employer',
    unchanged: true,
  };
}

export async function haley(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const host = employer.slug.toLowerCase();
  const source = `haley:${host}`;
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const sitemap = await haleySitemapJobs(host, deadline);
  const candidates = haleyRoleLinks(sitemap.urls, employer);
  let truncated = sitemap.truncated;

  const jobs = (await mapLimit(candidates, 6, async ({ id, title, url }): Promise<RawJob | null> => {
    if (Date.now() >= deadline) {
      truncated = true;
      return null;
    }
    if (known?.has(`${source}:${id}`)) return unchangedJob(source, employer, id, title, url);

    let html: string;
    try {
      html = await fetchText(url, Math.min(20_000, Math.max(1, deadline - Date.now())));
    } catch {
      return null;
    }
    const posting = jobPostingFrom(html);
    if (!posting) return null;

    const descriptionHtml = posting.description ?? null;
    const descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : '';
    const { locations, restrictions } = careersLocationFields(
      posting.jobLocation,
      posting.applicantLocationRequirements,
      url,
      title,
    );
    const postedAt = isoDate(posting.datePosted ?? '');
    const salary = haleySalary(posting, descriptionText);
    const hiringOrganization = typeof posting.hiringOrganization === 'string'
      ? posting.hiringOrganization
      : posting.hiringOrganization?.name;
    const remote = /TELECOMMUTE/i.test(posting.jobLocationType ?? '') ? true : null;
    const employmentType = (Array.isArray(posting.employmentType)
      ? posting.employmentType
      : posting.employmentType ? [posting.employmentType] : []).join(', ') || null;
    const identifier = typeof posting.identifier === 'string'
      ? posting.identifier
      : posting.identifier?.value;

    return {
      source,
      ats: 'haley',
      board: employer.slug,
      externalId: id,
      company: hiringOrganization || employer.name,
      title: posting.title?.trim() || title,
      locations,
      restrictions,
      workplaceType: remote ? 'remote' : null,
      isRemote: remote,
      descriptionHtml,
      descriptionText: descriptionText || null,
      applyUrl: url,
      linkType: 'employer',
      postedAt,
      postedConfidence: postedAt ? 'confirmed' : 'unknown',
      employmentType,
      salary,
      salarySource: salary ? 'Employer posting (Haley Marketing)' : null,
      requisitionId: identifier ?? null,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    };
  })).filter((job): job is RawJob => job !== null);

  return { jobs, ok: true, totalListed: sitemap.urls.length, uniqueRead: sitemap.urls.length, truncated };
}

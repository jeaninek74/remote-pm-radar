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

export interface JobPostingLd {
  '@type'?: string | string[];
  title?: string;
  datePosted?: string;
  description?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } } | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } }[];
  applicantLocationRequirements?: { name?: string } | { name?: string }[];
  hiringOrganization?: { name?: string } | string;
  baseSalary?: { currency?: string; value?: { minValue?: number | string; maxValue?: number | string; value?: number | string; unitText?: string } };
  identifier?: { value?: string } | string;
  url?: string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
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

function looksLikePostingPage(url: string, text: string): boolean {
  if (!POSTING_ID.test(url)) return false;
  const title = (text ?? '').trim();
  return !!title && ROLE_NOUN.test(title) && !CATEGORY_TITLE.test(title);
}

function pageLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(ANCHOR)) {
    const url = absolute(m[1], base);
    if (!url) continue;
    const text = stripHtml(m[2]).trim();
    if (text && isRoleTitle(text)) out.push({ url, text });
    else if (JOB_URL.test(url) && slugLooksLikeRole(url)) out.push({ url, text });
  }
  return out;
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
    for (const link of pageLinks(html, base)) candidates.set(link.url, link.text);
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
    const locations = asArray(ld?.jobLocation).map((l) => {
      const a = l?.address ?? {};
      const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
      return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ');
    }).filter(Boolean);
    const restrictions = asArray(ld?.applicantLocationRequirements).map((r) => r?.name ?? '').filter(Boolean);
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

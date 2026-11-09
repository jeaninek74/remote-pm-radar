import { REFRESH, USER_AGENT } from '../config';
import { fetchJson, mapLimit } from './http';
import { detectStates } from './location';
import { parseSalaryFromText } from './salary';
import { isRoleTitle } from './titles';
import { isoDate, stripHtml } from './text';
import type { BoardFetchResult, EmployerRow, RawJob } from './types';

export interface AvionteJobPost {
  jobPostIdEnc?: string;
  reqRecordIdEnc?: string;
  jobTitle?: string;
  location?: string;
  postDateUtc?: string;
  pay?: number | string;
  payMin?: number | string;
  payMax?: number | string;
  jobType?: string;
  zip?: string;
  jobId?: string;
  category?: string;
}

interface AvionteBoardResponse {
  socialName?: string;
  jobBoardName?: string;
  jobPosts?: unknown;
}

interface AvionteDescriptionResponse {
  description?: unknown;
}

type AvionteDescriptionResult =
  | { ok: true; html: string | null }
  | { ok: false };

export function avionteCoordinates(source: string): { bId: string; jbId: string } | null {
  const normalized = source
    .replace(/&amp;/gi, '&')
    .replace(/\\u002f|\\x2f|&#x2f;|&#47;/gi, '/')
    .replace(/\\+\//g, '/');
  const coordinates = new Map<string, { bId: string; jbId: string }>();
  const urls = normalized.matchAll(
    /(?:https?:)?\/\/((?:[a-z0-9-]+\.)?myavionte\.com|hire\.mycompas\.com)([^"'<>\\\s]*)/gi,
  );
  for (const match of urls) {
    try {
      const rawUrl = match[0].startsWith('//') ? `https:${match[0]}` : match[0];
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase();
      if (host !== 'hire.mycompas.com' && !/(?:^|\.)myavionte\.com$/i.test(host)) continue;
      const route = /^#\/jobs\/([a-z0-9_-]+)\/([a-z0-9_-]+)(?:\/|$)/i.exec(url.hash);
      let bId = route?.[1] ?? '';
      let jbId = route?.[2] ?? '';
      if (!bId || !jbId) {
        if (!/^\/sonar\/v2\/careers\/integrations\//i.test(url.pathname)) continue;
        bId = url.searchParams.get('bId') ?? '';
        jbId = url.searchParams.get('jbId') ?? '';
      }
      if (!/^[a-z0-9_-]+$/i.test(bId) || !/^[a-z0-9_-]+$/i.test(jbId)) continue;
      coordinates.set(`${bId}/${jbId}`.toLowerCase(), { bId, jbId });
    } catch {
      continue;
    }
  }
  return coordinates.size === 1 ? [...coordinates.values()][0] : null;
}

export function parseAvionteJobPosts(response: unknown): AvionteJobPost[] | null {
  if (!response || typeof response !== 'object' || !('jobPosts' in response)) return null;
  const posts = (response as AvionteBoardResponse).jobPosts;
  if (Array.isArray(posts)) {
    return posts.filter((post): post is AvionteJobPost => Boolean(post) && typeof post === 'object');
  }
  if (!posts || typeof posts !== 'object') return null;
  return Object.entries(posts).flatMap(([key, post]) => {
    if (!post || typeof post !== 'object') return [];
    const listing = post as AvionteJobPost;
    return [{ ...listing, jobPostIdEnc: listing.jobPostIdEnc || key }];
  });
}

export function avionteBoardUrl(bId: string, jbId: string): string {
  return `https://hire.myavionte.com/app/careers/#/jobs/${encodeURIComponent(bId)}/${encodeURIComponent(jbId)}//`;
}

export function avionteApplyUrl(bId: string, jbId: string, jobPostIdEnc: string): string {
  return `https://hire.myavionte.com/app/careers/#/jobs/${encodeURIComponent(bId)}/${encodeURIComponent(jbId)}/${encodeURIComponent(jobPostIdEnc)}/`;
}

export function avionteListUrl(bId: string, jbId: string): string {
  return `https://hire.myavionte.com/sonar/v2/jobBoard/${encodeURIComponent(bId)}/${encodeURIComponent(jbId)}`;
}

export function avionteDescriptionUrl(jobPostIdEnc: string): string {
  return `https://hire.myavionte.com/sonar/v2/jobBoard/jobPost/${encodeURIComponent(jobPostIdEnc)}/description`;
}

export function avionteSalary(post: Pick<AvionteJobPost, 'pay' | 'payMin' | 'payMax'>) {
  const positive = (value: number | string | undefined): number | null => {
    const amount = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[$,\s]/g, ''))
        : NaN;
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  };
  const format = (value: number): string => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  const min = positive(post.payMin);
  const max = positive(post.payMax);
  if (min !== null && max !== null) {
    const unit = min < 1000 && max < 1000 ? 'hour' : 'year';
    return parseSalaryFromText(`USD ${format(min)} - USD ${format(max)} per ${unit}`, 'Avionté posting');
  }
  const pay = positive(post.pay);
  if (pay === null) return null;
  const unit = pay < 1000 ? 'hour' : 'year';
  return parseSalaryFromText(`USD ${format(pay)} per ${unit}`, 'Avionté posting');
}

export function avionteLocations(location?: string, zip?: string): string[] {
  const parts = [location, zip]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .map((part) => part.trim());
  if (!parts.length) return [];
  const address = parts.join(', ');
  const isUnitedStates = detectStates(address).length > 0
    || /\b(?:united states|u\.?s\.?a?|usa)\b/i.test(address);
  return [isUnitedStates && !/\b(?:united states|u\.?s\.?a?|usa)\b/i.test(address)
    ? `${address}, United States`
    : address];
}

async function fetchDescription(
  jobPostIdEnc: string,
  bId: string,
  jbId: string,
  deadline: number,
): Promise<AvionteDescriptionResult> {
  if (Date.now() >= deadline) return { ok: false };
  try {
    const response = await fetch(avionteDescriptionUrl(jobPostIdEnc), {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        'x-compas-careers-buildidenc': bId,
        'x-compas-careers-jobboardidenc': jbId,
      },
      signal: AbortSignal.timeout(Math.min(20_000, Math.max(1, deadline - Date.now()))),
    });
    if (!response.ok || Date.now() >= deadline) return { ok: false };
    const data = await response.json() as AvionteDescriptionResponse | null;
    if (
      !data
      || typeof data !== 'object'
      || typeof data.description !== 'string'
      || Date.now() >= deadline
    ) return { ok: false };
    return { ok: true, html: data.description.trim() ? data.description : null };
  } catch {
    return { ok: false };
  }
}

function unchangedJob(
  source: string,
  employer: EmployerRow,
  id: string,
  title: string,
  applyUrl: string,
): RawJob {
  return {
    source,
    ats: 'avionte',
    board: employer.slug,
    externalId: id,
    company: employer.name,
    title,
    locations: [],
    applyUrl,
    linkType: 'employer',
    unchanged: true,
  };
}

export async function avionte(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const match = /^([a-z0-9_-]+)\/([a-z0-9_-]+)$/i.exec(employer.slug);
  if (!match) return { jobs: [], ok: false, error: 'Invalid Avionté board coordinates', totalListed: 0 };
  const [, bId, jbId] = match;
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const response = await fetchJson<AvionteBoardResponse>(
    avionteListUrl(bId, jbId),
    Math.min(REFRESH.timeoutMs, Math.max(1, deadline - Date.now())),
  );
  const listings = parseAvionteJobPosts(response);
  if (!listings) throw new Error('Avionté job board response had no jobPosts collection');
  const uniqueListings = new Map<string, AvionteJobPost>();
  for (const listing of listings) {
    const id = listing.jobPostIdEnc?.trim();
    if (id) uniqueListings.set(id, listing);
  }
  const candidates = [...uniqueListings.entries()].filter(([, listing]) =>
    isRoleTitle(listing.jobTitle ?? '', undefined, employer),
  );
  const source = `avionte:${bId}/${jbId}`;
  let truncated = false;
  const jobs = (await mapLimit(candidates, 6, async ([id, listing]): Promise<RawJob> => {
    const applyUrl = avionteApplyUrl(bId, jbId, id);
    const title = listing.jobTitle?.trim() ?? '';
    if (known?.has(`${source}:${id}`)) return unchangedJob(source, employer, id, title, applyUrl);

    if (Date.now() >= deadline) {
      truncated = true;
      return null;
    }
    const description = await fetchDescription(id, bId, jbId, deadline);
    if (!description.ok) {
      truncated = true;
      return null;
    }
    const descriptionHtml = description.html;
    const descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : '';
    const salary = avionteSalary(listing);
    return {
      source,
      ats: 'avionte',
      board: employer.slug,
      externalId: id,
      company: employer.name,
      title,
      locations: avionteLocations(listing.location, listing.zip),
      postedAt: isoDate(listing.postDateUtc ?? ''),
      postedConfidence: isoDate(listing.postDateUtc ?? '') ? 'confirmed' : 'unknown',
      employmentType: listing.jobType ?? null,
      descriptionHtml,
      descriptionText: descriptionText || null,
      applyUrl,
      linkType: 'employer',
      salary,
      salarySource: salary ? 'Avionté posting' : null,
      requisitionId: listing.jobId ?? listing.reqRecordIdEnc ?? null,
    };
  })).filter((job): job is RawJob => job !== null);
  return {
    jobs,
    ok: true,
    totalListed: listings.length,
    uniqueRead: uniqueListings.size,
    truncated,
  };
}

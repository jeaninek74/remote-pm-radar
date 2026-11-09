import { REFRESH } from '../config';
import { fetchJson, fetchText } from './http';
import { maximumOnlySalary, parseSalaryFromText } from './salary';
import { isRoleTitle } from './titles';
import { isoDate, stripHtml } from './text';
import type { BoardFetchResult, EmployerRow, RawJob } from './types';

interface CrelateJob {
  Id?: string;
  Title?: string;
  City?: string;
  State?: string;
  Country?: string;
  PostalCode?: string;
  Description?: string;
  Compensation?: number | string | null;
  CompensationMinimum?: number | string | null;
  CompensationMaximum?: number | string | null;
  LastPostedOnDate?: string;
  LastPostedOn?: string;
  IsUsJob?: boolean;
  Url?: string;
  JobCode?: string;
  JobNum?: string;
}

interface CrelateJobsResponse {
  Jobs?: CrelateJob[];
  IsError?: boolean;
  ErrorMessage?: string | null;
}

export interface CrelateLocationFields {
  locations: string[];
  restrictions: string[];
}

export function extractCrelateOrgId(html: string): string | null {
  return /\bORG_ID\s*=\s*["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i.exec(html)?.[1] ?? null;
}

export function crelatePortalSlug(source: string): string | null {
  const normalized = source
    .replace(/&amp;/gi, '&')
    .replace(/\\u002f|\\x2f|&#x2f;|&#47;/gi, '/')
    .replace(/\\+\//g, '/');
  const slugs = new Set<string>();
  for (const match of normalized.matchAll(
    /(?<![a-z0-9.-])(?:https?:\/\/)?jobs\.crelate\.com\/portal\/([a-z0-9-]+)([^"'<>\\\s]*)/gi,
  )) {
    const slug = match[1].toLowerCase();
    const tail = match[2] ?? '';
    if (/^\/job\/apply\/general(?:[/?#]|$)/i.test(tail)) continue;
    if (slug === 'job' && /^\/apply\/general(?:[/?#]|$)/i.test(tail)) continue;
    slugs.add(slug);
  }
  return slugs.size === 1 ? [...slugs][0] : null;
}

export function crelateJobRouteId(job: Pick<CrelateJob, 'Url' | 'JobCode'>): string | null {
  const urlId = typeof job.Url === 'string' ? job.Url.trim().replace(/^\/+/, '') : '';
  const jobCode = typeof job.JobCode === 'string' ? job.JobCode.trim() : '';
  return urlId || jobCode || null;
}

export function crelateApplyUrl(slug: string, routeId: string): string {
  return `https://jobs.crelate.com/portal/${encodeURIComponent(slug)}/job/${encodeURIComponent(routeId)}`;
}

export function crelateLocationFields(
  job: Pick<CrelateJob, 'City' | 'State' | 'PostalCode' | 'Country' | 'IsUsJob'>,
): CrelateLocationFields {
  const address = [job.City, job.State, job.PostalCode]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .map((part) => part.trim());
  return {
    locations: address.length ? [address.join(', ')] : [],
    restrictions: job.IsUsJob === false ? ['Outside the United States'] : [],
  };
}

function amount(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^\s*\$?[\d,]+(?:\.\d+)?\s*$/.test(value)) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function crelateSalary(job: Pick<CrelateJob, 'Compensation' | 'CompensationMinimum' | 'CompensationMaximum'>) {
  const minimum = amount(job.CompensationMinimum);
  const maximum = amount(job.CompensationMaximum);
  if (minimum === null && maximum !== null) {
    const interval = maximum < 1000 ? 'hour' : 'year';
    return maximumOnlySalary(
      maximum,
      interval,
      `Crelate compensation: "Up to USD ${formatAmount(maximum)} per ${interval}"`,
    );
  }
  const range = [minimum, maximum].filter((value): value is number => value !== null);
  if (range.length) {
    const unit = range.every((value) => value < 1000) ? 'hour' : 'year';
    const text = range.length > 1
      ? `USD ${formatAmount(range[0])} - USD ${formatAmount(range[1])} per ${unit}`
      : `USD ${formatAmount(range[0])} per ${unit}`;
    return parseSalaryFromText(text, 'Crelate compensation');
  }

  const compensation = amount(job.Compensation);
  if (compensation !== null) {
    const unit = compensation < 1000 ? 'hour' : 'year';
    return parseSalaryFromText(`USD ${formatAmount(compensation)} per ${unit}`, 'Crelate compensation');
  }
  return parseSalaryFromText(String(job.Compensation ?? ''), 'Crelate compensation');
}

export function crelateJobsUrl(orgId: string): string {
  const url = new URL('https://jobs.crelate.com/api/candidateportal/GetAllJobs');
  url.searchParams.set('requestEnvelope', JSON.stringify({
    Locations: null,
    OrganizationId: orgId,
    SearchText: null,
    Tags: null,
  }));
  return url.toString();
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
    ats: 'crelate',
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

async function fetchCrelateJobs(slug: string, deadline: number): Promise<CrelateJob[]> {
  const portalUrl = `https://jobs.crelate.com/portal/${encodeURIComponent(slug)}/`;
  const orgId = extractCrelateOrgId(await fetchText(
    portalUrl,
    Math.min(REFRESH.timeoutMs, Math.max(1, deadline - Date.now())),
  ));
  if (!orgId) throw new Error('Crelate portal HTML had no ORG_ID');
  const response = await fetchJson<CrelateJobsResponse>(
    crelateJobsUrl(orgId),
    Math.min(REFRESH.timeoutMs, Math.max(1, deadline - Date.now())),
  );
  if (response.IsError || !Array.isArray(response.Jobs)) {
    throw new Error('Crelate GetAllJobs response had no Jobs array');
  }
  return response.Jobs;
}

export async function crelate(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const slug = employer.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { jobs: [], ok: false, error: 'Invalid Crelate portal slug', totalListed: 0 };
  }
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const source = `crelate:${slug}`;
  const listings = await fetchCrelateJobs(slug, deadline);
  const uniqueListings = new Map<string, CrelateJob>();
  for (const listing of listings) {
    const id = crelateJobRouteId(listing);
    if (id) uniqueListings.set(id, listing);
  }
  const candidates = [...uniqueListings.entries()].filter(([, listing]) =>
    isRoleTitle(listing.Title ?? '', undefined, employer),
  );
  const jobs: RawJob[] = [];
  for (const [id, listing] of candidates) {
    const applyUrl = crelateApplyUrl(slug, id);
    const title = listing.Title?.trim() ?? '';
    if (known?.has(`${source}:${id}`)) {
      jobs.push(unchangedJob(source, employer, id, title, applyUrl));
      continue;
    }
    const descriptionHtml = listing.Description?.trim() || null;
    const descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : '';
    const { locations, restrictions } = crelateLocationFields(listing);
    const postedAt = isoDate(listing.LastPostedOnDate ?? '') ?? isoDate(listing.LastPostedOn ?? '');
    // LastPostedOnDate is a repost date, not the original posting date.
    const salary = crelateSalary(listing);
    jobs.push({
      source,
      ats: 'crelate',
      board: slug,
      externalId: id,
      company: employer.name,
      title,
      locations,
      restrictions,
      postedAt,
      postedConfidence: 'unknown',
      descriptionHtml,
      descriptionText: descriptionText || null,
      applyUrl,
      linkType: 'employer',
      salary,
      salarySource: salary ? 'Crelate compensation' : null,
      requisitionId: listing.JobNum ?? listing.JobCode ?? null,
    });
  }
  return { jobs, ok: true, totalListed: listings.length, uniqueRead: uniqueListings.size };
}

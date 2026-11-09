import { REFRESH } from '../config';
import { fetchJson, mapLimit } from './http';
import { parseSalaryFromText } from './salary';
import { isRoleTitle } from './titles';
import { isoDate, stripHtml } from './text';
import type { BoardFetchResult, EmployerRow, RawJob } from './types';

interface ZenopleListing {
  jobId?: number | string;
  jobTitle?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  payRate?: string;
  InsertDate?: string;
}

interface ZenoplePortalResponse {
  TotalCount?: number | string;
  Data?: ZenopleListing[];
}

interface ZenopleJobDetail {
  JobId?: number | string;
  JobTitle?: string;
  PortalDescription?: string;
}

export function parseZenopleJson(value: unknown): unknown {
  let parsed = value;
  for (let layer = 0; layer < 2 && typeof parsed === 'string'; layer += 1) {
    parsed = JSON.parse(parsed) as unknown;
  }
  return parsed;
}

function organizationCoordinates(slug: string): { tenant: string; organization: string } | null {
  const match = /^([a-z0-9-]+)\/([a-z0-9]+)$/i.exec(slug);
  return match ? { tenant: match[1].toLowerCase(), organization: match[2].toUpperCase() } : null;
}

function jsonUrl(apiUrl: string, payload: Record<string, unknown>): string {
  const url = new URL(apiUrl);
  url.searchParams.set('json', JSON.stringify(payload));
  return url.toString();
}

export function zenopleJobPortalUrl(tenant: string, organization: string, pageNumber: number): string {
  return jsonUrl(`https://${tenant}api.zenople.com/api/Job/JobPortal`, {
    directory: 'JobPortal',
    organizationCode: organization,
    organizationId: 0,
    officeId: 0,
    searchText: '',
    pageNumber,
    pageSize: 500,
  });
}

export function zenopleJobDetailUrl(tenant: string, organization: string, jobId: number | string): string {
  return jsonUrl(`https://${tenant}api.zenople.com/api/Job/JobDetail`, {
    organizationCode: organization,
    jobId,
    callFrom: 'JobPortal',
  });
}

async function zenopleRequest<T>(url: string, deadline: number): Promise<T> {
  const response = await fetchJson<unknown>(url, Math.min(20_000, Math.max(1, deadline - Date.now())));
  return parseZenopleJson(response) as T;
}

function listingDate(value: string | undefined): string | null {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(value ?? '')?.[0];
  return date ? isoDate(date) : null;
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
    ats: 'zenople',
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

export async function zenople(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const coordinates = organizationCoordinates(employer.slug);
  if (!coordinates) return { jobs: [], ok: false, error: 'Invalid Zenople tenant/organization slug', totalListed: 0 };
  const { tenant, organization } = coordinates;
  const portalUrl = `https://${tenant}.zenople.com/job-portal/${organization}`;
  const source = `zenople:${tenant}/${organization}`;
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const listings: ZenopleListing[] = [];
  let totalListed = 0;
  let pageNumber = 1;
  let truncated = false;

  while (Date.now() < deadline) {
    const page = await zenopleRequest<ZenoplePortalResponse>(
      zenopleJobPortalUrl(tenant, organization, pageNumber),
      deadline,
    );
    const count = Number(page.TotalCount);
    if (!Number.isFinite(count) || count < 0 || !Array.isArray(page.Data)) {
      throw new Error('Zenople JobPortal response had no TotalCount or Data array');
    }
    totalListed = count;
    const currentPage = page.Data;
    if (!currentPage.length) {
      if (listings.length < totalListed) truncated = true;
      break;
    }
    listings.push(...currentPage);
    if (listings.length >= totalListed) break;
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    pageNumber += 1;
  }
  if (listings.length < totalListed && Date.now() >= deadline) truncated = true;

  const uniqueListings = new Map<string, ZenopleListing>();
  for (const listing of listings) {
    if (listing.jobId == null) continue;
    uniqueListings.set(String(listing.jobId), listing);
  }
  const candidates = [...uniqueListings.entries()].filter(([, listing]) =>
    isRoleTitle(listing.jobTitle ?? '', undefined, employer));
  const jobs = (await mapLimit(candidates, 6, async ([id, listing]): Promise<RawJob | null> => {
    const applyUrl = `${portalUrl}/job/${encodeURIComponent(id)}`;
    if (known?.has(`${source}:${id}`)) {
      return unchangedJob(source, employer, id, listing.jobTitle ?? '', applyUrl);
    }
    if (Date.now() >= deadline) {
      truncated = true;
      return null;
    }
    let detail: ZenopleJobDetail | null = null;
    try {
      const response = await zenopleRequest<{ data?: ZenopleJobDetail } | ZenopleJobDetail>(
        zenopleJobDetailUrl(tenant, organization, listing.jobId!),
        deadline,
      );
      if (response && typeof response === 'object' && 'data' in response) {
        detail = (response as { data?: ZenopleJobDetail }).data ?? null;
      } else if (response && typeof response === 'object') {
        detail = response as ZenopleJobDetail;
      }
    } catch {
      return null;
    }
    if (!detail) return null;

    const descriptionHtml = detail.PortalDescription ?? null;
    const descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : '';
    const location = [listing.city, listing.state, listing.zipCode, 'United States']
      .filter(Boolean)
      .join(', ');
    const postedAt = listingDate(listing.InsertDate);
    const salary = parseSalaryFromText(listing.payRate ?? '', 'Zenople pay rate');

    return {
      source,
      ats: 'zenople',
      board: employer.slug,
      externalId: id,
      company: employer.name,
      title: detail.JobTitle?.trim() || listing.jobTitle || '',
      locations: [location],
      descriptionHtml,
      descriptionText: descriptionText || null,
      applyUrl,
      linkType: 'employer',
      postedAt,
      postedConfidence: postedAt ? 'confirmed' : 'unknown',
      salary,
      salarySource: salary ? 'Employer posting (Zenople)' : null,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    };
  })).filter((job): job is RawJob => job !== null);

  return { jobs, ok: true, totalListed, uniqueRead: uniqueListings.size, truncated };
}

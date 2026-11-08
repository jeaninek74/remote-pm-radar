import { fetchJson } from './http';
import { REFRESH, RULES } from '../config';
import { isRoleTitle, searchTerms } from './titles';
import { fetchCareersPage, jobPostingFrom, type JobPostingLd } from './careers';
import { fetchIcimsText, icimsDetailUrl, icimsHost, icimsJobUrl, icimsSitemapJobs } from './icims';
import { isoDate, stripHtml } from './text';
import { parseAshbyCompensation, parsePayRangeBlock, parseSalaryFromText, type ParsedSalary } from './salary';
import type { Ats, BoardFetchResult, RawJob } from './types';
import type { EmployerRow } from './types';
import { parseSuccessFactorsFeed } from './successfactors';
import { parseNeogovFeed, type NeogovFeedItem } from './neogov';
import {
  parsePhenomConfig,
  parsePhenomResponse,
  phenomEndpointMatchesPageHost,
  phenomJobUrl,
} from './phenom';

const DIRECT_READER_PACE_MS = Number(process.env.DIRECT_READER_PACE_MS ?? 250);
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function clean(html: string | null | undefined): string {
  if (!html) return '';
  return stripHtml(unescapeHtml(html));
}

function pickSalary(text: string, label: string): ParsedSalary | null {
  return parseSalaryFromText(text, label);
}


/* ------------------------------------------------------------------ Greenhouse */

interface GhJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url: string;
  location?: { name?: string };
  requisition_id?: string;
  company_name?: string;
  content?: string;
  metadata?: { name?: string; value?: string | null }[] | null;
}

async function greenhouse(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(employer.slug)}/jobs?content=false`;
  const list = await fetchJson<{ jobs?: GhJob[] }>(listUrl);
  const all = Array.isArray(list.jobs) ? list.jobs : [];
  // No numeric cap on detail fetches: every matching title is read, inside the employer time budget.
  const candidates = all.filter((job) => isRoleTitle(job.title ?? '', undefined, employer));
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  let truncated = false;

  const jobs: RawJob[] = [];
  for (const job of candidates) {
    if (Date.now() > deadline) { truncated = true; break; }
    if (known?.has(`greenhouse:${employer.slug}:${job.id}`)) {
      jobs.push(unchangedJob(`greenhouse:${employer.slug}`, 'greenhouse', String(job.id), employer.name, job.title ?? '', job.absolute_url ?? ''));
      continue;
    }
    let description = '';
    let rawContent = '';
    let detail: GhJob | null = null;
    try {
      detail = await fetchJson<GhJob>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(employer.slug)}/jobs/${job.id}`,
      );
      rawContent = detail.content ?? '';
      description = clean(rawContent);
    } catch {
      description = '';
    }
    const metadata = detail?.metadata ?? job.metadata ?? null;
    const workplaceType = metadata?.find((m) => /workplace|remote|location type/i.test(m?.name ?? ''))?.value ?? null;
    const salary = parsePayRangeBlock(rawContent) ?? pickSalary(description, 'Greenhouse posting');
    jobs.push({
      source: `greenhouse:${employer.slug}`,
      ats: 'greenhouse',
      board: employer.slug,
      externalId: String(job.id),
      company: job.company_name || employer.name,
      title: job.title,
      locations: [job.location?.name ?? ''].filter(Boolean),
      workplaceType,
      descriptionText: description,
      applyUrl: job.absolute_url,
      linkType: 'employer',
      postedAt: isoDate(job.first_published ?? job.updated_at),
      postedConfidence: job.first_published ? 'confirmed' : 'inferred',
      employmentType: null,
      salary,
      salarySource: salary ? 'Employer posting (Greenhouse)' : null,
      requisitionId: job.requisition_id ?? String(job.id),
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length, truncated };
}

/* ------------------------------------------------------------------------ Lever */

interface LeverPosting {
  id: string;
  text: string;
  createdAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  country?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string; department?: string };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

async function lever(employer: EmployerRow): Promise<BoardFetchResult> {
  const postings = await fetchJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(employer.slug)}?mode=json`,
  );
  const all = Array.isArray(postings) ? postings : [];
  const jobs: RawJob[] = [];
  for (const posting of all) {
    if (!isRoleTitle(posting.text ?? '', undefined, employer)) continue;
    const description = [posting.descriptionPlain, posting.additionalPlain].filter(Boolean).join('\n\n');
    let salary: ParsedSalary | null = null;
    if (posting.salaryRange?.min) {
      const interval = (posting.salaryRange.interval ?? 'per-year-salary').toLowerCase();
      const isHourly = /hour/.test(interval);
      const min = posting.salaryRange.min;
      const max = posting.salaryRange.max ?? null;
      if ((posting.salaryRange.currency ?? 'USD').toUpperCase() === 'USD') {
        salary = isHourly
          ? {
            min: Math.round(min * 2080), max: max === null ? null : Math.round(max * 2080),
            interval: 'hour', hourlyRate: min, isOTE: false,
            evidence: `Lever salaryRange: $${min}\u2013$${max ?? '?'}/hr (annualised at 2,080 hrs)`,
          }
          : {
            min, max, interval: 'year', hourlyRate: null, isOTE: false,
            evidence: 'Lever salaryRange (employer-published base range)',
          };
      }
    }
    if (!salary) salary = pickSalary(description, 'Lever posting');
    const locations = posting.categories?.allLocations?.length
      ? posting.categories.allLocations
      : [posting.categories?.location ?? ''].filter(Boolean);
    jobs.push({
      source: `lever:${employer.slug}`,
      ats: 'lever',
      board: employer.slug,
      externalId: posting.id,
      company: employer.name,
      title: posting.text,
      locations,
      workplaceType: posting.workplaceType ?? null,
      descriptionText: description,
      applyUrl: posting.hostedUrl ?? posting.applyUrl ?? `https://jobs.lever.co/${employer.slug}/${posting.id}`,
      linkType: 'employer',
      postedAt: isoDate(posting.createdAt),
      postedConfidence: posting.createdAt ? 'confirmed' : 'unknown',
      employmentType: posting.categories?.commitment ?? null,
      salary,
      salarySource: salary ? (posting.salaryRange?.min ? 'Employer posting (Lever salary range)' : 'Employer posting (Lever)') : null,
      requisitionId: posting.id,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length };
}

/* ------------------------------------------------------------------------ Ashby */

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  employmentType?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  updatedAt?: string;
  applyUrl?: string;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: unknown;
  department?: string;
  team?: string;
}

async function ashby(employer: EmployerRow): Promise<BoardFetchResult> {
  const data = await fetchJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(employer.slug)}?includeCompensation=true`,
  );
  const all = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs: RawJob[] = [];
  for (const job of all) {
    if (!isRoleTitle(job.title ?? '', undefined, employer)) continue;
    const description = job.descriptionPlain ?? clean(job.descriptionHtml);
    let salary = parseAshbyCompensation(job.compensation);
    if (!salary) salary = pickSalary(description, 'Ashby posting');
    const locations = [job.location ?? '', ...(job.secondaryLocations ?? []).map((s) => s.location ?? '')].filter(Boolean);
    jobs.push({
      source: `ashby:${employer.slug}`,
      ats: 'ashby',
      board: employer.slug,
      externalId: job.id,
      company: employer.name,
      title: job.title,
      locations,
      workplaceType: job.workplaceType ?? null,
      isRemote: job.isRemote ?? null,
      descriptionText: description,
      applyUrl: job.applyUrl ?? job.jobUrl ?? `https://jobs.ashbyhq.com/${employer.slug}/${job.id}`,
      linkType: 'employer',
      postedAt: isoDate(job.publishedAt ?? job.updatedAt),
      postedConfidence: job.publishedAt ? 'confirmed' : job.updatedAt ? 'inferred' : 'unknown',
      employmentType: job.employmentType ?? null,
      salary,
      salarySource: salary ? (job.compensation ? 'Employer posting (Ashby compensation)' : 'Employer posting (Ashby)') : null,
      requisitionId: job.id,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length };
}

/* --------------------------------------------------------------------- Workable */

interface WorkableJob {
  title: string;
  shortcode: string;
  url: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  telecommuting?: boolean;
  employment_type?: string;
  industry?: string;
  description?: string;
  country?: string;
  city?: string;
  state?: string;
  locations?: { country?: string; city?: string; region?: string }[];
}

async function workable(employer: EmployerRow): Promise<BoardFetchResult> {
  const data = await fetchJson<{ jobs?: WorkableJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(employer.slug)}?details=true`,
  );
  const all = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs: RawJob[] = [];
  for (const job of all) {
    if (!isRoleTitle(job.title ?? '', undefined, employer)) continue;
    const description = clean(job.description);
    const salary = pickSalary(description, 'Workable posting');
    const locations = (job.locations ?? []).length
      ? (job.locations ?? []).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '))
      : [[job.city, job.state, job.country].filter(Boolean).join(', ')];
    jobs.push({
      source: `workable:${employer.slug}`,
      ats: 'workable',
      board: employer.slug,
      externalId: job.shortcode,
      company: employer.name,
      title: job.title,
      locations: locations.filter(Boolean),
      workplaceType: job.telecommuting ? 'remote' : null,
      isRemote: job.telecommuting ?? null,
      descriptionText: description,
      applyUrl: job.application_url ?? job.url,
      linkType: 'employer',
      postedAt: isoDate(job.published_on ?? job.created_at),
      postedConfidence: job.published_on ? 'confirmed' : 'unknown',
      employmentType: job.employment_type ?? null,
      salary,
      salarySource: salary ? 'Employer posting (Workable)' : null,
      requisitionId: job.shortcode,
      industry: employer.industry ?? job.industry ?? null,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length };
}

/* -------------------------------------------------------------------- Recruitee */

interface RecruiteeOffer {
  id: number;
  title: string;
  description?: string;
  careers_url?: string;
  careers_apply_url?: string;
  city?: string;
  country?: string;
  country_code?: string;
  remote?: boolean;
  hybrid?: boolean;
  published_at?: string;
  employment_type_code?: string;
  salary?: { min?: string; max?: string; currency?: string; period?: string } | null;
}

async function recruitee(employer: EmployerRow): Promise<BoardFetchResult> {
  const data = await fetchJson<{ offers?: RecruiteeOffer[] }>(
    `https://${encodeURIComponent(employer.slug)}.recruitee.com/api/offers/`,
  );
  const all = Array.isArray(data.offers) ? data.offers : [];
  const jobs: RawJob[] = [];
  for (const offer of all) {
    if (!isRoleTitle(offer.title ?? '', undefined, employer)) continue;
    const description = clean(offer.description);
    let salary: ParsedSalary | null = null;
    const min = Number(offer.salary?.min);
    const max = Number(offer.salary?.max);
    if (Number.isFinite(min) && min > 40_000) {
      salary = {
        min: Math.round(min),
        max: Number.isFinite(max) ? Math.round(max) : null,
        interval: 'year', hourlyRate: null, isOTE: false,
        evidence: 'Recruitee structured salary field',
      };
    }
    if (!salary) salary = pickSalary(description, 'Recruitee posting');
    jobs.push({
      source: `recruitee:${employer.slug}`,
      ats: 'recruitee',
      board: employer.slug,
      externalId: String(offer.id),
      company: employer.name,
      title: offer.title,
      locations: [[offer.city, offer.country].filter(Boolean).join(', ')].filter(Boolean),
      workplaceType: offer.remote ? 'remote' : offer.hybrid ? 'hybrid' : null,
      isRemote: offer.remote ?? null,
      descriptionText: description,
      applyUrl: offer.careers_apply_url ?? offer.careers_url ?? `https://${employer.slug}.recruitee.com/o/${offer.id}`,
      linkType: 'employer',
      postedAt: isoDate(offer.published_at),
      postedConfidence: offer.published_at ? 'confirmed' : 'unknown',
      employmentType: offer.employment_type_code ?? null,
      salary,
      salarySource: salary ? 'Employer posting (Recruitee)' : null,
      requisitionId: String(offer.id),
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length };
}

/* --------------------------------------------------------------- SmartRecruiters */

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  refNumber?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  typeOfEmployment?: { label?: string };
}

async function smartrecruiters(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  // The postings endpoint returns at most 100 per call and reports totalFound; large
  // employers (CACI, Expeditors) list several hundred, so one page silently dropped most.
  const all: SrPosting[] = [];
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  let truncated = false;
  for (let offset = 0; REFRESH.feedPages <= 0 || offset < 100 * REFRESH.feedPages; offset += 100) {
    if (offset > 0 && Date.now() > deadline) { truncated = true; break; }
    const data = await fetchJson<{ content?: SrPosting[]; totalFound?: number }>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.slug)}/postings?limit=100&offset=${offset}`,
    );
    const page = Array.isArray(data.content) ? data.content : [];
    all.push(...page);
    if (page.length < 100 || all.length >= (data.totalFound ?? 0)) break;
  }
  const candidates = all.filter((p) => isRoleTitle(p.name ?? '', undefined, employer));
  const jobs: RawJob[] = [];
  for (const posting of candidates) {
    if (Date.now() > deadline) { truncated = true; break; }
    if (known?.has(`smartrecruiters:${employer.slug}:${posting.id}`)) {
      jobs.push(unchangedJob(`smartrecruiters:${employer.slug}`, 'smartrecruiters', String(posting.id), employer.name, posting.name ?? '', `https://jobs.smartrecruiters.com/${employer.slug}/${posting.id}`));
      continue;
    }
    let description = '';
    try {
      const detail = await fetchJson<{
        jobAd?: { sections?: Record<string, { text?: string }> };
      }>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.slug)}/postings/${posting.id}`);
      const sections = detail.jobAd?.sections ?? {};
      description = stripHtml(Object.values(sections).map((s) => s?.text ?? '').join('\n'));
    } catch {
      description = '';
    }
    const salary = pickSalary(description, 'SmartRecruiters posting');
    jobs.push({
      source: `smartrecruiters:${employer.slug}`,
      ats: 'smartrecruiters',
      board: employer.slug,
      externalId: posting.id,
      company: employer.name,
      title: posting.name,
      locations: [
        [posting.location?.city, posting.location?.region, posting.location?.country].filter(Boolean).join(', '),
      ].filter(Boolean),
      workplaceType: posting.location?.remote ? 'remote' : null,
      isRemote: posting.location?.remote ?? null,
      descriptionText: description,
      applyUrl: `https://jobs.smartrecruiters.com/${employer.slug}/${posting.id}`,
      linkType: 'employer',
      postedAt: isoDate(posting.releasedDate),
      postedConfidence: posting.releasedDate ? 'confirmed' : 'unknown',
      employmentType: posting.typeOfEmployment?.label ?? null,
      salary,
      salarySource: salary ? 'Employer posting (SmartRecruiters)' : null,
      requisitionId: posting.refNumber ?? posting.id,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: all.length, truncated };
}

interface OraclePosting {
  Id?: string | number;
  Title?: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  WorkplaceType?: string;
  WorkplaceTypeCode?: string;
  ShortDescriptionStr?: string;
  ExternalResponsibilitiesStr?: string;
  ExternalQualificationsStr?: string;
}

interface OracleSearch {
  TotalJobsCount?: number;
  requisitionList?: OraclePosting[];
}

async function oracle(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const slash = employer.slug.lastIndexOf('/');
  const host = employer.slug.slice(0, slash);
  const site = employer.slug.slice(slash + 1);
  if (slash < 1 || !/^[a-z0-9.-]+\.oraclecloud\.com$/i.test(host) || !/^[a-z0-9_-]+$/i.test(site)) {
    return { jobs: [], ok: false, error: 'Oracle slug must be <host>/<siteNumber>', totalListed: 0 };
  }

  const source = `oracle:${employer.slug}`;
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const pageSize = 200;
  let totalListed = 0;
  let truncated = false;
  const jobs: RawJob[] = [];
  const seen = new Set<string>();

  const fetchPage = async (keyword: string | null, offset: number): Promise<OracleSearch | null> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const url = new URL(`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions`);
    url.searchParams.set('onlyData', 'true');
    url.searchParams.set('expand', 'requisitionList');
    url.searchParams.set(
      'finder',
      `findReqs;siteNumber=${site}${keyword ? `,keyword=${keyword}` : ''},limit=${pageSize},offset=${offset}`,
    );
    let data: { items?: OracleSearch[] };
    try {
      data = await fetchJson<{ items?: OracleSearch[] }>(
        url.toString(),
        Math.min(REFRESH.timeoutMs, remaining),
      );
    } catch (err) {
      if (Date.now() >= deadline && (err as Error).name === 'AbortError') return null;
      throw err;
    }
    const search = data.items?.[0];
    if (!search || typeof search.TotalJobsCount !== 'number' || !Array.isArray(search.requisitionList)) {
      throw new Error('Oracle response did not include a requisition list and numeric total');
    }
    return search;
  };

  const appendRolePostings = (page: OraclePosting[]) => {
    for (const posting of page) {
      if (posting.Id == null || !posting.Title || !isRoleTitle(posting.Title, undefined, employer)) continue;
      const externalId = String(posting.Id);
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      const detailsUrl = `https://${host}/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(site)}/requisitions/${encodeURIComponent(externalId)}`;
      if (known?.has(`${source}:${externalId}`)) {
        jobs.push(unchangedJob(source, 'oracle', externalId, employer.name, posting.Title, detailsUrl));
        continue;
      }
      const workplaceType = posting.WorkplaceType || posting.WorkplaceTypeCode || null;
      const description = [
        posting.ShortDescriptionStr,
        posting.ExternalResponsibilitiesStr,
        posting.ExternalQualificationsStr,
      ].filter((part): part is string => Boolean(part?.trim())).join('\n\n');
      jobs.push({
        source,
        ats: 'oracle',
        board: employer.slug,
        externalId,
        company: employer.name,
        title: posting.Title,
        locations: posting.PrimaryLocation ? [posting.PrimaryLocation] : [],
        workplaceType,
        isRemote: workplaceType ? /remote/i.test(workplaceType) : null,
        descriptionText: description || null,
        applyUrl: detailsUrl,
        linkType: 'employer',
        postedAt: isoDate(posting.PostedDate),
        postedConfidence: posting.PostedDate ? 'confirmed' : 'unknown',
        industry: employer.industry,
        companySize: employer.company_size,
        hqState: employer.hq_state,
      });
    }
  };

  try {
    const firstPage = await fetchPage(null, 0);
    if (!firstPage) {
      truncated = true;
      console.warn(`[oracle] ${employer.slug}: time budget reached before first page`);
    } else {
      totalListed = firstPage.TotalJobsCount!;
      appendRolePostings(firstPage.requisitionList!);
      if (totalListed > 10_000) {
        if (!firstPage.requisitionList!.length) {
          truncated = true;
          console.warn(`[oracle] ${employer.slug}: API returned an empty first page of ${totalListed}`);
        }
        terms: for (const keyword of rotatedSearchTerms(employer.slug)) {
          let offset = 0;
          for (;;) {
            const search = await fetchPage(keyword, offset);
            if (!search) {
              truncated = true;
              console.warn(`[oracle] ${employer.slug}: role search reached the per-employer time budget`);
              break terms;
            }
            const page = search.requisitionList!;
            if (!page.length && offset < search.TotalJobsCount!) {
              truncated = true;
              console.warn(`[oracle] ${employer.slug}: keyword "${keyword}" returned an empty page at ${offset} of ${search.TotalJobsCount}`);
              break;
            }
            appendRolePostings(page);
            offset += page.length;
            if (!page.length || offset >= search.TotalJobsCount!) break;
          }
        }
      } else {
        let offset = firstPage.requisitionList!.length;
        while (offset < totalListed) {
          const search = await fetchPage(null, offset);
          if (!search) {
            truncated = true;
            console.warn(`[oracle] ${employer.slug}: list pagination reached the per-employer time budget`);
            break;
          }
          totalListed = Math.max(totalListed, search.TotalJobsCount!);
          const page = search.requisitionList!;
          if (!page.length) {
            truncated = true;
            console.warn(`[oracle] ${employer.slug}: API returned an empty page at ${offset} of ${totalListed}`);
            break;
          }
          appendRolePostings(page);
          offset += page.length;
        }
      }
    }
  } catch (err) {
    return {
      jobs,
      ok: false,
      error: (err as Error).message.slice(0, 200),
      retryable: isRetryableBoardError(err),
      totalListed,
    };
  }

  return { jobs, ok: true, totalListed, truncated };
}

interface DayforcePosting {
  Title?: string;
  Description?: string;
  JobDetailsUrl?: string;
  ApplyUrl?: string;
  DatePosted?: string;
  ReferenceNumber?: string | number;
  IsVirtualLocation?: boolean;
}

async function dayforce(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const source = `dayforce:${employer.slug}`;
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return { jobs: [], ok: false, error: 'Dayforce time budget exceeded', retryable: true, totalListed: 0 };
  }
  const data = await fetchJson<DayforcePosting[]>(employer.slug, Math.min(REFRESH.timeoutMs, remaining));
  if (!Array.isArray(data)) {
    return { jobs: [], ok: false, error: 'Dayforce feed did not return a posting list', totalListed: 0 };
  }

  let truncated = false;
  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  for (const posting of data) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    if (!posting.Title || !isRoleTitle(posting.Title, undefined, employer)) continue;
    const externalId = posting.ReferenceNumber != null
      ? String(posting.ReferenceNumber)
      : posting.JobDetailsUrl ?? '';
    const applyUrl = posting.ApplyUrl || posting.JobDetailsUrl;
    if (!externalId || !applyUrl) continue;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    if (known?.has(`${source}:${externalId}`)) {
      jobs.push(unchangedJob(source, 'dayforce', externalId, employer.name, posting.Title, applyUrl));
      continue;
    }
    jobs.push({
      source,
      ats: 'dayforce',
      board: employer.slug,
      externalId,
      company: employer.name,
      title: posting.Title,
      locations: [],
      workplaceType: posting.IsVirtualLocation === true ? 'remote' : null,
      isRemote: typeof posting.IsVirtualLocation === 'boolean' ? posting.IsVirtualLocation : null,
      descriptionText: posting.Description ?? null,
      applyUrl,
      linkType: 'employer',
      postedAt: isoDate(posting.DatePosted),
      postedConfidence: posting.DatePosted ? 'confirmed' : 'unknown',
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: data.length, truncated };
}

function elementsWithClass(html: string, className: string): string[] {
  const contents: string[] = [];
  const openings = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  for (const opening of html.matchAll(openings)) {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(opening[2])?.[1]?.split(/\s+/) ?? [];
    if (!classes.includes(className)) continue;
    const tag = opening[1];
    const start = (opening.index ?? 0) + opening[0].length;
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tags.lastIndex = start;
    let depth = 1;
    for (const token of html.matchAll(tags)) {
      if (/^<\//.test(token[0])) depth -= 1;
      else if (!/\/\s*>$/.test(token[0])) depth += 1;
      if (depth === 0) {
        contents.push(html.slice(start, token.index ?? start));
        break;
      }
    }
  }
  return contents;
}

function icimsDescription(html: string): string {
  const content = elementsWithClass(html, 'iCIMS_JobContent')[0];
  return content ? clean(content) : '';
}

function icimsLocations(posting: JobPostingLd): string[] {
  const places = posting.jobLocation == null
    ? []
    : Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
  return places.map((place) => {
    const address = place.address;
    if (!address) return '';
    const country = typeof address.addressCountry === 'string' ? address.addressCountry : address.addressCountry?.name;
    return [address.addressLocality, address.addressRegion, country]
      .filter((part): part is string =>
        typeof part === 'string' && Boolean(part.trim()) && !/^unavailable$/i.test(part.trim()),
      )
      .map((part) => part.trim())
      .join(', ');
  }).filter(Boolean);
}

function icimsRestrictions(posting: JobPostingLd): string[] {
  const requirements = posting.applicantLocationRequirements == null
    ? []
    : Array.isArray(posting.applicantLocationRequirements)
      ? posting.applicantLocationRequirements
      : [posting.applicantLocationRequirements];
  return requirements.map((requirement) => {
    if (typeof requirement === 'string') return requirement.trim();
    const address = requirement.address;
    const country = typeof address?.addressCountry === 'string'
      ? address.addressCountry
      : address?.addressCountry?.name;
    return [
      requirement.name,
      address?.addressLocality,
      address?.addressRegion,
      country,
    ].filter((part): part is string =>
      typeof part === 'string' && Boolean(part.trim()) && !/^unavailable$/i.test(part.trim()),
    ).map((part) => part.trim()).join(', ');
  }).filter((restriction) =>
    Boolean(restriction) && !/^unavailable$/i.test(restriction.trim()),
  );
}

function icimsBaseSalary(posting: JobPostingLd): ParsedSalary | null {
  const baseSalary = posting.baseSalary;
  if (!baseSalary?.value || baseSalary.currency?.toUpperCase() !== 'USD') return null;
  const value = baseSalary.value;
  const asAmount = (amount: number | string | undefined): number | null => {
    if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null;
    if (typeof amount !== 'string') return null;
    const parsed = Number(amount.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  };
  const min = asAmount(value.minValue ?? value.value);
  const max = asAmount(value.maxValue ?? value.value) ?? min;
  if (min == null || max == null) return null;
  const unit = /hour/i.test(value.unitText ?? '') ? 'per hour' : 'per year';
  const format = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const salaryText = min === max
    ? `USD ${format(min)} ${unit}`
    : `USD ${format(min)} - USD ${format(max)} ${unit}`;
  return pickSalary(salaryText, 'iCIMS base salary');
}

interface UkgOpportunity {
  Id?: string | number;
  Title?: string;
  RequisitionNumber?: string | null;
  Locations?: {
    LocalizedDescription?: string | null;
    Address?: {
      City?: string | null;
      State?: { Code?: string | null; Name?: string | null } | null;
      Country?: { Code?: string | null; Name?: string | null } | null;
      Line2?: string | null;
    } | null;
  }[] | null;
  PostedDate?: string | null;
  Description?: string | null;
  CompensationAnnualMinimum?: number | string | null;
  CompensationAnnualMaximum?: number | string | null;
  CompensationHourlyMinimum?: number | string | null;
  CompensationHourlyMaximum?: number | string | null;
  CompensationCurrencyCode?: string | null;
  PayRangeVisible?: boolean;
  PayRange?: { PayRangeMinimum?: number | string | null; PayRangeMaximum?: number | string | null } | null;
  PayRangeCurrencyCode?: string | null;
}

interface UkgSearchResult {
  opportunities?: UkgOpportunity[];
  totalCount?: number;
}

function ukgCoordinates(slug: string): { host: string; tenant: string; boardGuid: string } | null {
  const match = /^(recruiting2?\.ultipro\.com)\/([A-Za-z0-9]+)\/([0-9a-f-]{36})$/i.exec(slug);
  return match ? { host: match[1].toLowerCase(), tenant: match[2], boardGuid: match[3] } : null;
}

function budgetTimeout(deadline: number): number {
  return Math.min(REFRESH.timeoutMs, Math.max(0, deadline - Date.now()));
}

async function directReaderPause(deadline: number): Promise<boolean> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return false;
  if (DIRECT_READER_PACE_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(DIRECT_READER_PACE_MS, remaining)));
  }
  return Date.now() < deadline;
}

async function directReaderGet(url: string, deadline: number, headers: Record<string, string> = {}): Promise<Response> {
  const timeoutMs = budgetTimeout(deadline);
  if (!timeoutMs) throw new Error('employer budget exceeded');
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function directReaderPost(
  url: string,
  deadline: number,
  body: unknown,
  headers: Record<string, string> = {},
  expectedHost?: string,
): Promise<Response> {
  if (!await directReaderPause(deadline)) throw new Error('employer budget exceeded');
  const timeoutMs = budgetTimeout(deadline);
  if (!timeoutMs) throw new Error('employer budget exceeded');
  const response = await fetch(url, {
    method: 'POST',
    redirect: expectedHost ? 'manual' : 'follow',
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (expectedHost && response.status >= 300 && response.status < 400) {
    throw new Error('Phenom widget API redirects are not accepted');
  }
  if (expectedHost && new URL(response.url || url).host.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new Error('Phenom widget API response host did not match careers page host');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function ukgSearchBody(skip: number): unknown {
  return {
    opportunitySearch: {
      Top: 50,
      Skip: skip,
      QueryString: '',
      OrderBy: [{ Value: 'postedDateDesc', PropertyName: 'PostedDate', Ascending: false }],
      Filters: [4, 5, 6].map((fieldName) => ({ t: 'TermsSearchFilterDto', fieldName, extra: null, values: [] })),
    },
    matchCriteria: {
      PreferredJobs: [],
      Educations: [],
      LicenseAndCertifications: [],
      Skills: [],
      hasNoLicenses: false,
      SkippedSkills: [],
    },
  };
}

async function ukgSearch(url: string, skip: number, deadline: number): Promise<UkgSearchResult> {
  const timeoutMs = budgetTimeout(deadline);
  if (!timeoutMs) throw new Error('employer budget exceeded');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': BROWSER_USER_AGENT,
    },
    body: JSON.stringify(ukgSearchBody(skip)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<UkgSearchResult>;
}

function ukgDetailFromHtml(html: string): UkgOpportunity | null {
  for (const match of html.matchAll(/CandidateOpportunityDetail\s*\(/g)) {
    const start = html.indexOf('{', match.index + match[0].length);
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1)) as UkgOpportunity;
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

function amountNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function ukgStructuredSalary(
  minimum: number | string | null | undefined,
  maximum: number | string | null | undefined,
  unit: 'year' | 'hour',
  currency: string | null | undefined,
): ParsedSalary | null {
  if (currency && !/^(?:USD|US\$|US DOLLARS?)$/i.test(currency.trim())) return null;
  const min = amountNumber(minimum);
  const max = amountNumber(maximum);
  if (min == null && max == null) return null;
  const format = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const value = min != null && max != null && min !== max
    ? `USD ${format(min)} - USD ${format(max)}`
    : `USD ${format(min ?? max!)}`;
  return pickSalary(`${value} per ${unit}`, 'UKG structured compensation');
}

function ukgSalary(detail: UkgOpportunity, description: string): ParsedSalary | null {
  const visibleRange = detail.PayRangeVisible
    ? ukgStructuredSalary(
      detail.PayRange?.PayRangeMinimum,
      detail.PayRange?.PayRangeMaximum,
      amountNumber(detail.CompensationHourlyMinimum) != null || amountNumber(detail.CompensationHourlyMaximum) != null ? 'hour' : 'year',
      detail.PayRangeCurrencyCode ?? detail.CompensationCurrencyCode,
    )
    : null;
  const annual = ukgStructuredSalary(
    detail.CompensationAnnualMinimum,
    detail.CompensationAnnualMaximum,
    'year',
    detail.CompensationCurrencyCode,
  );
  const hourly = ukgStructuredSalary(
    detail.CompensationHourlyMinimum,
    detail.CompensationHourlyMaximum,
    'hour',
    detail.CompensationCurrencyCode,
  );
  return visibleRange ?? annual ?? hourly ?? pickSalary(description, 'UKG posting');
}

function ukgLocations(opportunity: UkgOpportunity): string[] {
  const locations: string[] = [];
  let remote = /\bremote\b/i.test(opportunity.Title ?? '');
  for (const location of opportunity.Locations ?? []) {
    const address = location.Address;
    const city = address?.City?.trim();
    const state = address?.State?.Code?.trim() || address?.State?.Name?.trim();
    const country = address?.Country?.Name?.trim() || address?.Country?.Code?.trim();
    const formatted = [city, state, country].filter(Boolean).join(', ');
    if (formatted) locations.push(formatted);
    remote ||= /\bremote\b/i.test(`${address?.Line2 ?? ''} ${location.LocalizedDescription ?? ''}`);
  }
  if (remote) locations.push('Remote');
  return [...new Set(locations)];
}

async function ukg(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const coordinates = ukgCoordinates(employer.slug);
  if (!coordinates) return { jobs: [], ok: false, error: 'invalid UKG board slug', totalListed: 0 };
  const { host, tenant, boardGuid } = coordinates;
  const boardPath = `https://${host}/${tenant}/JobBoard/${boardGuid}`;
  const listUrl = `${boardPath}/JobBoardView/LoadSearchResults`;
  const all: UkgOpportunity[] = [];
  let totalCount = 0;
  let skip = 0;
  let truncated = false;

  while (skip === 0 || skip < totalCount) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    let data: UkgSearchResult;
    try {
      data = await ukgSearch(listUrl, skip, deadline);
    } catch (error) {
      if (Date.now() >= deadline) {
        truncated = true;
        break;
      }
      throw error;
    }
    if (!Array.isArray(data.opportunities) || typeof data.totalCount !== 'number' || !Number.isFinite(data.totalCount)) {
      throw new Error('UKG search response had no opportunities or numeric totalCount');
    }
    if (skip === 0) totalCount = data.totalCount;
    if (!data.opportunities.length && skip < totalCount) {
      truncated = true;
      break;
    }
    all.push(...data.opportunities);
    skip += 50;
    if (skip < totalCount && !await directReaderPause(deadline)) {
      truncated = true;
      break;
    }
  }

  const source = `ukg:${host}/${tenant}/${boardGuid}`;
  const candidates = all.filter((opportunity) => isRoleTitle(opportunity.Title ?? '', undefined, employer));
  const jobs: RawJob[] = [];
  for (const listing of candidates) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const id = String(listing.Id ?? '');
    if (!id) continue;
    const applyUrl = `${boardPath}/OpportunityDetail?opportunityId=${encodeURIComponent(id)}`;
    if (known?.has(`${source}:${id}`)) {
      jobs.push(unchangedJob(source, 'ukg', id, employer.name, listing.Title ?? '', applyUrl));
      continue;
    }
    if (!await directReaderPause(deadline)) {
      truncated = true;
      break;
    }
    try {
      const response = await directReaderGet(applyUrl, deadline, { Accept: 'text/html,application/xhtml+xml' });
      const detail = ukgDetailFromHtml(await response.text());
      if (!detail?.Title) continue;
      if (!isRoleTitle(detail.Title, undefined, employer)) continue;
      const description = clean(detail.Description);
      const salary = ukgSalary(detail, description);
      const postedAt = isoDate(detail.PostedDate ?? listing.PostedDate);
      jobs.push({
        source,
        ats: 'ukg',
        board: `${host}/${tenant}/${boardGuid}`,
        externalId: id,
        company: employer.name,
        title: detail.Title,
        locations: ukgLocations({ ...detail, Title: detail.Title, Locations: detail.Locations ?? listing.Locations }),
        descriptionText: description || null,
        applyUrl,
        linkType: 'employer',
        postedAt,
        postedConfidence: postedAt ? 'confirmed' : 'unknown',
        salary,
        salarySource: salary ? 'Employer posting (UKG)' : null,
        requisitionId: detail.RequisitionNumber ?? listing.RequisitionNumber ?? id,
        industry: employer.industry,
        companySize: employer.company_size,
        hqState: employer.hq_state,
      });
    } catch (error) {
      if (Date.now() >= deadline) truncated = true;
      console.warn(`[ukg] ${host}/${tenant}/${id}: ${(error as Error).message.slice(0, 120)}`);
      if (Date.now() >= deadline || /HTTP 429|HTTP 5\d\d/i.test((error as Error).message)) break;
    }
  }
  return { jobs, ok: true, totalListed: totalCount, truncated };
}

interface TaleoJob {
  jobId?: string | number;
  contestNo?: string | number;
  column?: unknown[];
  linkedColumn?: number | string;
  locationsColumns?: (number | string)[];
}

interface TaleoSearchResult {
  requisitionList?: TaleoJob[];
  pagingData?: { pageSize?: number; totalCount?: number };
}

function taleoCoordinates(slug: string): { host: string; section: string } | null {
  const match = /^([a-z0-9-]+\.taleo\.net)\/([^/?#]+)$/i.exec(slug);
  return match ? { host: match[1].toLowerCase(), section: match[2] } : null;
}

function taleoCookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
}

function taleoPortal(html: string): string | null {
  return /portalNo\s*:\s*['"](\d+)['"]/i.exec(html)?.[1]
    ?? /[?&]portal=(\d+)/i.exec(html.replace(/&amp;/gi, '&'))?.[1]
    ?? /portal\s*=\s*['"]?(\d+)/i.exec(html)?.[1]
    ?? null;
}

function taleoSearchBody(pageNo: number, ascendingSortingOrder: 'false' | 'true'): unknown {
  return {
    multilineEnabled: false,
    sortingSelection: { sortBySelectionParam: '3', ascendingSortingOrder },
    fieldData: { fields: { KEYWORD: '', LOCATION: '' }, valid: true },
    filterSelectionParam: { searchFilterSelections: [] },
    advancedSearchFiltersSelectionParam: { searchFilterSelections: [] },
    pageNo,
  };
}

async function taleoSearch(
  url: string,
  referer: string,
  cookies: string,
  pageNo: number,
  deadline: number,
  ascendingSortingOrder: 'false' | 'true',
): Promise<TaleoSearchResult> {
  const timeoutMs = budgetTimeout(deadline);
  if (!timeoutMs) throw new Error('employer budget exceeded');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    tz: 'GMT-08:00',
    tzname: 'America/Los_Angeles',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: referer,
    'User-Agent': BROWSER_USER_AGENT,
  };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(taleoSearchBody(pageNo, ascendingSortingOrder)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return await response.json() as TaleoSearchResult;
  } catch {
    throw new Error('Taleo search response was not JSON');
  }
}

function taleoTitle(job: TaleoJob): string {
  const index = Number(job.linkedColumn);
  const value = Number.isInteger(index) ? job.column?.[index] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

function taleoLocations(job: TaleoJob): string[] {
  const locations: string[] = [];
  for (const columnIndex of job.locationsColumns ?? []) {
    const index = Number(columnIndex);
    const raw = Number.isInteger(index) ? job.column?.[index] : undefined;
    if (typeof raw !== 'string') continue;
    let values: unknown = raw;
    try {
      values = JSON.parse(raw) as unknown;
    } catch { /* keep a plain location string */ }
    const entries = Array.isArray(values) ? values : [values];
    for (const entry of entries) {
      if (typeof entry !== 'string' || !entry.trim()) continue;
      const parts = entry.trim().split('-');
      locations.push(parts.length >= 3 ? `${parts.slice(2).join('-')}, ${parts[1]}, ${parts[0]}` : entry.trim());
    }
  }
  return [...new Set(locations)];
}

function taleoPostedAt(job: TaleoJob): string | null {
  for (const value of job.column ?? []) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!/^(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})$/i.test(text)) continue;
    const date = isoDate(text);
    if (date) return date;
  }
  return null;
}

function taleoInitialHistory(html: string): string {
  const input = [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\b(?:name|id)=["']initialHistory["']/i.test(tag));
  const value = input ? /\bvalue=["']([^"']*)["']/i.exec(input)?.[1] : null;
  if (!value) return '';
  let decoded = value.replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'");
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded.replace(/(?:%[0-9a-f]{2})+/gi, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence;
      }
    });
  }
  return unescapeHtml(decoded);
}

function taleoDescription(html: string): string {
  const state = taleoInitialHistory(html);
  const marker = 'requisitionDescriptionInterface!|!descRequisition!|!';
  const markerIndex = state.indexOf(marker);
  if (markerIndex < 0) return '';
  const tail = state.slice(markerIndex + marker.length);
  const payloadStart = tail.indexOf('!!*!');
  if (payloadStart >= 0) {
    const payload = tail.slice(payloadStart + 4);
    const end = payload.indexOf('!|!');
    const encoded = payload.slice(0, end < 0 ? undefined : end);
    const decoded = encoded.replace(/(?:%[0-9a-f]{2})+/gi, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence;
      }
    });
    return clean(decoded.replace(/\\([:;,])/g, '$1'));
  }
  const start = tail.search(/<(?=(?:p|div|ul|ol|h[1-6]|table|span)\b)/i);
  if (start < 0) return '';
  const end = tail.indexOf('!|!', start);
  const payload = tail.slice(start, end < 0 ? undefined : end).replace(/\\([:;,])/g, '$1');
  return clean(payload);
}

function taleoDetailPostedAt(html: string): string | null {
  const visible = /id=["'][^"']*(?:reqPostingDate|datePosted)[^"']*["'][^>]*>([^<]*)/i.exec(html)?.[1]?.trim();
  if (visible) {
    const date = isoDate(visible);
    if (date) return date;
  }
  const state = taleoInitialHistory(html);
  const datePattern = /^(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})(?=$|[,\s])/i;
  const dateSuffix = /^(?:,\s*|\s+)\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M$/i;
  const firstDate = state.split('!|!').map((field) => field.replace(/\\([:,])/g, '$1').trim()).map((field) => {
    const match = datePattern.exec(field);
    if (!match) return null;
    const suffix = field.slice(match[0].length);
    return !suffix || dateSuffix.test(suffix) ? match[0] : null;
  }).find((date): date is string => Boolean(date));
  return firstDate ? isoDate(firstDate) : null;
}

async function taleo(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const coordinates = taleoCoordinates(employer.slug);
  if (!coordinates) return { jobs: [], ok: false, error: 'invalid Taleo board slug', totalListed: 0 };
  const { host, section } = coordinates;
  const referer = `https://${host}/careersection/${section}/jobsearch.ftl?lang=en`;
  const listUrl = `https://${host}/careersection/rest/jobboard/searchjobs?lang=en&portal=`;
  const page = await directReaderGet(referer, deadline, { Accept: 'text/html,application/xhtml+xml' });
  const cookies = taleoCookies(page);
  const portal = taleoPortal(await page.text());
  if (!portal) return { jobs: [], ok: false, error: 'Taleo portal id not found', totalListed: 0 };
  const all = new Map<string, TaleoJob>();
  let totalCount = 0;
  let truncated = false;

  const readPass = async (
    ascendingSortingOrder: 'false' | 'true',
    primary = false,
  ): Promise<{ rowsRead: number; addedIds: number }> => {
    let pageNo = 1;
    let rowsRead = 0;
    let addedIds = 0;
    let passTotalCount: number | null = null;
    while (true) {
      if (!await directReaderPause(deadline)) {
        truncated = true;
        return { rowsRead, addedIds };
      }
      let data: TaleoSearchResult;
      try {
        data = await taleoSearch(
          `${listUrl}${encodeURIComponent(portal)}`,
          referer,
          cookies,
          pageNo,
          deadline,
          ascendingSortingOrder,
        );
      } catch (error) {
        if (Date.now() >= deadline) {
          truncated = true;
          return { rowsRead, addedIds };
        }
        throw error;
      }
      if (!Array.isArray(data.requisitionList) || !data.pagingData || typeof data.pagingData.totalCount !== 'number') {
        throw new Error('Taleo search response had no requisitionList or numeric totalCount');
      }
      if (pageNo === 1) {
        passTotalCount = data.pagingData.totalCount;
        if (primary) totalCount = passTotalCount;
      }
      if (!data.requisitionList.length) return { rowsRead, addedIds };
      rowsRead += data.requisitionList.length;
      for (const job of data.requisitionList) {
        const key = job.jobId != null
          ? `job:${String(job.jobId)}`
          : job.contestNo != null ? `contest:${String(job.contestNo)}` : null;
        if (key && !all.has(key)) {
          all.set(key, job);
          addedIds += 1;
        }
      }
      if (passTotalCount !== null && rowsRead >= passTotalCount) return { rowsRead, addedIds };
      pageNo += 1;
    }
  };

  const normalPass = await readPass('false', true);
  if (normalPass.rowsRead < totalCount && !truncated) {
    const ascendingPass = await readPass('true');
    if (!truncated && ascendingPass.addedIds > 0 && all.size < totalCount) truncated = true;
  }

  const source = `taleo:${host}/${section}`;
  const candidates = [...all.values()].filter((job) => isRoleTitle(taleoTitle(job), undefined, employer));
  const jobs: RawJob[] = [];
  for (const listing of candidates) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const jobId = String(listing.jobId ?? '');
    const contestNo = String(listing.contestNo ?? listing.jobId ?? '');
    const detailKey = contestNo || jobId;
    const applyUrl = `https://${host}/careersection/${section}/jobdetail.ftl?job=${encodeURIComponent(detailKey)}&lang=en`;
    const title = taleoTitle(listing);
    if (known?.has(`${source}:${jobId || contestNo}`)) {
      jobs.push(unchangedJob(source, 'taleo', jobId || contestNo, employer.name, title, applyUrl));
      continue;
    }
    if (!await directReaderPause(deadline)) {
      truncated = true;
      break;
    }
    try {
      const response = await directReaderGet(applyUrl, deadline, {
        Accept: 'text/html,application/xhtml+xml',
        Referer: referer,
      });
      const html = await response.text();
      const description = taleoDescription(html);
      const postedAt = taleoPostedAt(listing) ?? taleoDetailPostedAt(html);
      const salary = pickSalary(description, 'Taleo posting');
      if (!isRoleTitle(title, undefined, employer)) continue;
      jobs.push({
        source,
        ats: 'taleo',
        board: `${host}/${section}`,
        externalId: jobId || contestNo,
        company: employer.name,
        title,
        locations: taleoLocations(listing),
        descriptionText: description || null,
        applyUrl,
        linkType: 'employer',
        postedAt,
        postedConfidence: postedAt ? 'confirmed' : 'unknown',
        salary,
        salarySource: salary ? 'Employer posting (Taleo)' : null,
        requisitionId: contestNo || jobId,
        industry: employer.industry,
        companySize: employer.company_size,
        hqState: employer.hq_state,
      });
    } catch (error) {
      if (Date.now() >= deadline) truncated = true;
      console.warn(`[taleo] ${host}/${section}/${detailKey}: ${(error as Error).message.slice(0, 120)}`);
      if (Date.now() >= deadline || /HTTP 429|HTTP 5\d\d/i.test((error as Error).message)) break;
    }
  }
  return { jobs, ok: true, totalListed: all.size, truncated };
}

function successFactorsHost(slug: string): string | null {
  const host = slug.replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0].toLowerCase();
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

function successFactorsDatePosted(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bitemprop=["']datePosted["']/i.test(tag)) continue;
    const content = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) return isoDate(content);
  }
  return null;
}

async function successfactors(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const host = successFactorsHost(employer.slug);
  if (!host) return { jobs: [], ok: false, error: 'invalid SuccessFactors RMK host', totalListed: 0 };
  let feed: ReturnType<typeof parseSuccessFactorsFeed>;
  try {
    const response = await directReaderGet(`https://${host}/sitemap.xml`, deadline, { Accept: 'application/rss+xml,application/xml,text/xml,*/*' });
    feed = parseSuccessFactorsFeed(await response.text());
  } catch (error) {
    if (Date.now() >= deadline) return { jobs: [], ok: true, totalListed: 0, truncated: true };
    throw error;
  }

  const source = `successfactors:${host}`;
  const candidates = feed.items.filter((item) => isRoleTitle(item.title, undefined, employer));
  const jobs: RawJob[] = [];
  let truncated = false;
  for (const item of candidates) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const applyUrl = item.link;
    if (known?.has(`${source}:${item.id}`)) {
      jobs.push(unchangedJob(source, 'successfactors', item.id, employer.name, item.title, applyUrl));
      continue;
    }
    if (!await directReaderPause(deadline)) {
      truncated = true;
      break;
    }
    try {
      const response = await directReaderGet(applyUrl, deadline, { Accept: 'text/html,application/xhtml+xml' });
      const datePosted = successFactorsDatePosted(await response.text());
      const description = clean(item.description);
      const salary = pickSalary(description, 'SAP SuccessFactors posting');
      jobs.push({
        source,
        ats: 'successfactors',
        board: host,
        externalId: item.id,
        company: employer.name,
        title: item.title,
        locations: item.location ? [item.location] : [],
        descriptionText: description || null,
        applyUrl,
        linkType: 'employer',
        postedAt: datePosted,
        postedConfidence: datePosted ? 'confirmed' : 'unknown',
        salary,
        salarySource: salary ? 'Employer posting (SAP SuccessFactors)' : null,
        requisitionId: item.id,
        industry: employer.industry,
        companySize: employer.company_size,
        hqState: employer.hq_state,
      });
    } catch (error) {
      if (Date.now() >= deadline) truncated = true;
      console.warn(`[successfactors] ${host}/${item.id}: ${(error as Error).message.slice(0, 120)}`);
      if (Date.now() >= deadline || /HTTP 429|HTTP 5\d\d/i.test((error as Error).message)) break;
    }
  }
  return { jobs, ok: true, totalListed: feed.items.length, truncated };
}

function neogovCoordinates(slug: string): { host: string; folder: string } | null {
  const match = /^((?:www\.)?(?:governmentjobs|schooljobs)\.com)\/([A-Za-z0-9_-]+)$/i.exec(slug.trim());
  return match ? { host: match[1].toLowerCase(), folder: match[2] } : null;
}

function neogovSalary(item: NeogovFeedItem): ParsedSalary | null {
  const currency = item.salaryCurrency.trim().toUpperCase();
  if (currency && !/^(?:USD|US\$|US DOLLARS?)$/.test(currency)) return null;
  const minimum = item.minimumSalary.trim() ? amountNumber(item.minimumSalary) : null;
  const maximum = item.maximumSalary.trim() ? amountNumber(item.maximumSalary) : null;
  if (minimum === null && maximum === null) return null;
  if ([minimum, maximum].some((amount) => amount !== null && (!Number.isFinite(amount) || amount <= 0))) return null;
  if (minimum !== null && maximum !== null && maximum < minimum) return null;

  const interval = item.salaryInterval.toLowerCase().replace(/[^a-z]/g, '');
  const multiplier = interval === 'year' || interval === 'annual' || interval === 'yearly'
    ? 1
    : interval === 'hour' || interval === 'hourly'
      ? RULES.hoursPerYear
      : interval === 'month' || interval === 'monthly'
        ? 12
        : interval === 'biweekly' || interval === 'biweek'
          ? 26
          : null;
  if (multiplier === null) return null;
  const hourly = multiplier === RULES.hoursPerYear;
  return {
    min: minimum === null ? null : Math.round(minimum * multiplier),
    max: maximum === null ? null : Math.round(maximum * multiplier),
    interval: hourly ? 'hour' : 'year',
    hourlyRate: hourly ? minimum : null,
    isOTE: false,
    evidence: `NEOGOV structured salary fields (${item.salaryInterval}${currency ? ` ${currency}` : ''})`,
  };
}

async function neogov(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const coordinates = neogovCoordinates(employer.slug);
  if (!coordinates) return { jobs: [], ok: false, error: 'invalid NEOGOV agency slug', totalListed: 0 };
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const feedUrl = `https://${coordinates.host}/SearchEngine/JobsFeed?agency=${encodeURIComponent(coordinates.folder)}`;
  let items: ReturnType<typeof parseNeogovFeed>;
  try {
    const response = await directReaderGet(feedUrl, deadline, { Accept: 'application/rss+xml,application/xml,text/xml,*/*' });
    items = parseNeogovFeed(await response.text());
  } catch (error) {
    if (Date.now() >= deadline) return { jobs: [], ok: true, totalListed: 0, truncated: true };
    throw error;
  }

  const source = `neogov:${coordinates.host}/${coordinates.folder}`;
  const candidates = items.filter((item) => isRoleTitle(item.title, undefined, employer));
  const jobs: RawJob[] = candidates.map((item) => {
    if (known?.has(`${source}:${item.jobId}`)) {
      return unchangedJob(source, 'neogov', item.jobId, employer.name, item.title, item.link);
    }
    const description = clean([
      item.description,
      item.examplesOfDuties,
      item.qualifications,
      item.supplementalInformation,
    ].filter(Boolean).join('\n\n'));
    const salary = neogovSalary(item);
    const postedAt = isoDate(item.advertiseFromDateUTC.replace(/:0$/, '')) ?? isoDate(item.pubDate);
    return {
      source,
      ats: 'neogov',
      board: `${coordinates.host}/${coordinates.folder}`,
      externalId: item.jobId,
      company: employer.name,
      title: item.title,
      locations: item.location ? [item.location] : [],
      descriptionText: description || null,
      applyUrl: item.link,
      linkType: 'employer',
      postedAt,
      postedConfidence: 'confirmed',
      employmentType: item.jobType || null,
      salary,
      salarySource: salary ? `Employer posting (NEOGOV structured ${item.salaryInterval} fields)` : null,
      requisitionId: item.jobNumberSingle || null,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    };
  });
  return { jobs, ok: true, totalListed: items.length };
}

async function icims(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const host = icimsHost(employer.slug);
  if (!host) return { jobs: [], ok: false, error: 'invalid iCIMS host', totalListed: 0 };
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  const sitemap = await fetchIcimsText(
    `https://${host}/sitemap.xml`,
    host,
    Math.min(REFRESH.timeoutMs, Math.max(1, deadline - Date.now())),
  );
  const all = icimsSitemapJobs(sitemap, host);
  const source = `icims:${host}`;
  const jobs: RawJob[] = [];
  const candidates = all.filter((job) => isRoleTitle(job.slug.replace(/-/g, ' '), undefined, employer));
  let truncated = false;

  for (const job of candidates) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const applyUrl = job.url;
    if (known?.has(`${source}:${job.id}`)) {
      jobs.push(unchangedJob(source, 'icims', job.id, employer.name, job.slug.replace(/-/g, ' '), applyUrl));
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, WORKDAY_PACE_MS));
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    let html: string;
    try {
      html = await fetchIcimsText(icimsDetailUrl(job), host, Math.min(REFRESH.timeoutMs, remaining));
    } catch (error) {
      truncated = true;
      console.warn(`[icims] ${host}/${job.id}: ${(error as Error).message.slice(0, 120)}`);
      if (Date.now() >= deadline || /HTTP 429|HTTP 5\d\d/i.test((error as Error).message)) break;
      continue;
    }
    const posting = jobPostingFrom(html);
    if (!posting?.title) {
      truncated = true;
      continue;
    }
    if (!isRoleTitle(posting.title, undefined, employer)) continue;

    const description = icimsDescription(html);
    const remote = posting.jobLocationType?.toUpperCase() === 'TELECOMMUTE';
    const salary = icimsBaseSalary(posting) ?? pickSalary(description, 'iCIMS posting');
    const postedAt = isoDate(posting.datePosted);
    const employmentType = Array.isArray(posting.employmentType)
      ? posting.employmentType.join(', ')
      : posting.employmentType ?? null;
    const identifier = typeof posting.identifier === 'string'
      ? posting.identifier
      : posting.identifier?.value ?? job.id;

    jobs.push({
      source,
      ats: 'icims',
      board: host,
      externalId: job.id,
      company: employer.name,
      title: posting.title,
      locations: icimsLocations(posting),
      restrictions: icimsRestrictions(posting),
      workplaceType: remote ? 'remote' : null,
      isRemote: remote ? true : null,
      descriptionText: description || null,
      applyUrl,
      linkType: 'employer',
      postedAt,
      postedConfidence: postedAt ? 'confirmed' : 'unknown',
      employmentType,
      salary,
      salarySource: salary ? 'Employer posting (iCIMS)' : null,
      requisitionId: identifier,
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }

  return { jobs, ok: true, totalListed: all.length, truncated };
}

function phenomJobLocations(posting: JobPostingLd | null): string[] {
  const values = Array.isArray(posting?.jobLocation)
    ? posting.jobLocation
    : posting?.jobLocation ? [posting.jobLocation] : [];
  return values.map(({ address = {} }) => {
    const country = typeof address.addressCountry === 'string'
      ? address.addressCountry
      : address.addressCountry?.name;
    return [address.addressLocality, address.addressRegion, country].filter(Boolean).join(', ');
  }).filter(Boolean);
}

function phenomSalary(posting: JobPostingLd | null, description: string): ParsedSalary | null {
  const baseSalary = posting?.baseSalary;
  const value = baseSalary?.value;
  if (baseSalary && value && (!baseSalary.currency || /^USD$/i.test(baseSalary.currency))) {
    const number = (input: string | number | undefined) => {
      if (input === undefined) return null;
      const parsed = Number(String(input).replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const minimum = number(value.minValue ?? value.value);
    const maximum = number(value.maxValue ?? value.value);
    const unit = value.unitText?.toLowerCase() ?? 'year';
    const factor = /month/.test(unit) ? 12 : 1;
    const isHourly = /hour/.test(unit);
    const min = minimum === null ? null : Math.round(minimum * factor);
    const max = maximum === null ? null : Math.round(maximum * factor);
    const format = (amount: number) => amount.toLocaleString('en-US');
    if (min !== null || max !== null) {
      const low = min ?? max!;
      const high = max ?? min!;
      const amount = low === high ? format(low) : `${format(low)} - ${format(high)}`;
      const structured = parseSalaryFromText(
        `Base salary USD ${amount} per ${isHourly ? 'hour' : 'year'}`,
        'Phenom structured baseSalary',
      );
      if (structured) return structured;
    }
  }
  return pickSalary(description, 'Phenom posting');
}

function phenomRestrictions(posting: JobPostingLd | null): string[] {
  const requirements = posting?.applicantLocationRequirements;
  const values = Array.isArray(requirements) ? requirements : requirements ? [requirements] : [];
  return values.map((requirement) => {
    if (typeof requirement === 'string') return requirement;
    if (requirement.name) return requirement.name;
    const address = requirement.address ?? {};
    const country = typeof address.addressCountry === 'string'
      ? address.addressCountry
      : address.addressCountry?.name;
    return [address.addressLocality, address.addressRegion, country].filter(Boolean).join(', ');
  }).filter(Boolean);
}

async function phenom(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const pageUrl = employer.careers_url || `https://${employer.slug}`;
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  let totalHits = 0;
  let from = 0;
  let truncated = false;
  let detailsTruncated = false;
  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  try {
    const page = await directReaderGet(pageUrl, deadline, { Accept: 'text/html,application/xhtml+xml' });
    const config = parsePhenomConfig(await page.text(), page.url || pageUrl);
    if (!config) return { jobs, ok: false, error: 'Phenom page configuration not found', totalListed: 0 };
    if (!phenomEndpointMatchesPageHost(config.widgetApiEndpoint, config.pageHost)) {
      return {
        jobs,
        ok: false,
        error: 'Phenom widget API endpoint host does not match final careers page host',
        totalListed: 0,
      };
    }
    const boardUrl = new URL(config.baseUrl);
    const source = `Phenom:${boardUrl.host}${boardUrl.pathname.replace(/\/$/, '')}`;
    const size = 500;
    while (true) {
      if (Date.now() >= deadline) { truncated = true; break; }
      const response = await directReaderPost(config.widgetApiEndpoint, deadline, {
        ddoKey: 'refineSearch',
        jobs: true,
        from,
        size,
        sort: { order: 'desc', field: 'dateCreated' },
        refNum: config.refNum,
        siteType: config.siteType,
        locale: config.locale,
        pageName: config.pageName,
      }, {}, config.pageHost);
      const parsed = parsePhenomResponse(await response.json());
      if (from === 0) totalHits = parsed.totalHits;
      for (const item of parsed.jobs) {
        const externalId = item.jobSeqNo || item.jobId;
        if (externalId) seen.add(externalId);
        if (!isRoleTitle(item.title, undefined, employer)) continue;
        let candidateUrl: URL | null = null;
        if (item.jobUrl) {
          try {
            candidateUrl = new URL(phenomJobUrl(item.jobUrl, config.baseUrl));
          } catch {
            candidateUrl = null;
          }
        }
        const ownUrl = candidateUrl?.hostname === boardUrl.hostname
          ? candidateUrl.toString()
          : phenomJobUrl(`job/${encodeURIComponent(externalId)}`, config.baseUrl);
        if (known?.has(`${source}:${externalId}`)) {
          jobs.push(unchangedJob(source, 'phenom', externalId, employer.name, item.title, ownUrl));
          continue;
        }
        let detail: JobPostingLd | null = null;
        try {
          const detailResponse = await directReaderGet(ownUrl, deadline, { Accept: 'text/html,application/xhtml+xml' });
          detail = jobPostingFrom(await detailResponse.text());
        } catch {
          if (Date.now() >= deadline) detailsTruncated = true;
        }
        const description = detail?.description ? clean(detail.description) : clean(item.description);
        const salary = phenomSalary(detail, description);
        const structuredLocations = phenomJobLocations(detail);
        const jobLocationType = detail?.jobLocationType ?? null;
        const isRemote = /TELECOMMUTE/i.test(jobLocationType ?? '') ? true : null;
        const postedAt = isoDate(detail?.datePosted || item.postedDate || item.dateCreated);
        jobs.push({
          source, ats: 'phenom', board: `${boardUrl.host}${boardUrl.pathname.replace(/\/$/, '')}`,
          externalId, company: employer.name, title: item.title,
          locations: structuredLocations.length ? structuredLocations : item.locations,
          restrictions: phenomRestrictions(detail),
          workplaceType: isRemote ? 'remote' : jobLocationType,
          isRemote,
          postedAt,
          postedConfidence: postedAt ? 'confirmed' : 'unknown',
          descriptionHtml: detail?.description ?? null,
          descriptionText: description || null,
          applyUrl: ownUrl, linkType: 'employer',
          salary,
          salarySource: salary ? 'Employer posting (Phenom)' : null,
        });
      }
      from += parsed.itemsCount;
      if (from >= totalHits) break;
      if (parsed.itemsCount === 0) throw new Error(`Phenom returned an empty page before totalHits at offset ${from}`);
    }
    return { jobs, ok: true, totalListed: totalHits, uniqueRead: seen.size, truncated: truncated || detailsTruncated };
  } catch (err) {
    if (Date.now() >= deadline) {
      return { jobs, ok: true, totalListed: totalHits, uniqueRead: seen.size, truncated: true };
    }
    return { jobs, ok: false, error: (err as Error).message, retryable: isRetryableBoardError(err), totalListed: totalHits, truncated };
  }
}

const ADAPTERS: Record<Ats, (employer: EmployerRow, known?: Set<string>) => Promise<BoardFetchResult>> = {
  greenhouse, lever, ashby, workable, recruitee, smartrecruiters,
  // Workday coordinates live in careers_url, so the adapter ignores the slug.
  workday: fetchWorkday,
  oracle,
  dayforce,
  icims,
  ukg,
  taleo,
  successfactors,
  neogov,
  phenom,
};


/**
 * Workday public CXS API.
 *
 * Large employers (health systems, universities, retailers, manufacturers) publish their board at
 * https://{tenant}.{wdN}.myworkdayjobs.com/{site}. The same host answers a public JSON search:
 *   POST /wday/cxs/{tenant}/{site}/jobs  {searchText, limit, offset}
 * and a detail read:
 *   GET  /wday/cxs/{tenant}/{site}{externalPath}
 * This is the employer's own ATS, not a job board, so it satisfies the sourcing rule.
 */
const WORKDAY_HOST = /^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i;

interface WorkdayPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

export function parseWorkdayUrl(url: string | null | undefined): { tenant: string; wd: string; site: string } | null {
  if (!url) return null;
  const m = WORKDAY_HOST.exec(url);
  if (!m) return null;
  return { tenant: m[1].toLowerCase(), wd: m[2], site: m[3] };
}

/**
 * Workday answers a tenant that is inside its weekly maintenance window with a 303 to
 * community.workday.com/maintenance-page. Following that redirect produced an HTML body
 * and the misleading error "Unexpected token '<'"; every Workday board then looked broken
 * for the length of the window. The redirect is caught here and reported as what it is.
 */
export class WorkdayMaintenance extends Error {
  constructor() { super('Workday maintenance window — board unavailable, retry on the next run'); }
}

const WORKDAY_MAINTENANCE = /maintenance/i;

/**
 * Workday gives a real date in the detail payload (`startDate`), but the listing only says
 * "Posted Today" / "Posted 3 Days Ago" / "Posted 30+ Days Ago". The listing text used to be
 * written straight into a DATE column and failed the whole board.
 */
export function workdayPostedDate(
  startDate: string | null | undefined,
  postedOn: string | null | undefined,
  now = new Date(),
): { date: string | null; confidence: 'confirmed' | 'inferred' | 'unknown' } {
  const exact = isoDate(startDate);
  if (exact) return { date: exact, confidence: 'confirmed' };
  const text = (postedOn ?? '').trim();
  // "Posted Today" / "Posted 3 Days Ago" is Workday's own posting date, exact to the day, so it
  // counts as confirmed. "Posted 30+ Days Ago" is only a lower bound: store the earliest it can
  // be (31 days) as inferred — old enough to be archived, never shown as a precise date.
  let daysAgo: number | null = null;
  let lowerBound = false;
  if (/\btoday\b/i.test(text)) daysAgo = 0;
  else if (/\byesterday\b/i.test(text)) daysAgo = 1;
  else {
    const m = /(\d+)(\+?)\s*days?\s*ago/i.exec(text);
    if (m) {
      lowerBound = m[2] === '+';
      daysAgo = Number(m[1]) + (lowerBound ? 1 : 0);
    }
  }
  if (daysAgo === null) {
    const parsed = isoDate(text);
    return parsed ? { date: parsed, confidence: 'inferred' } : { date: null, confidence: 'unknown' };
  }
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return { date: d.toISOString().slice(0, 10), confidence: lowerBound ? 'inferred' : 'confirmed' };
}

/**
 * The generic phrases ("project manager", "program manager") always run first because they match
 * most of a board; the remaining phrases start from a different point each half-hour slot, per
 * employer, so a board that hits its time budget still sees every phrase across the day instead
 * of restarting from the top and never reaching the later ones.
 */
export function rotatedSearchTerms(seed: string, now = Date.now()): string[] {
  const all = searchTerms();
  const generic = all.filter((t) => /^(?:project|program|programme) (?:manager|management)$/.test(t));
  const rest = all.filter((t) => !generic.includes(t));
  if (!rest.length) return all;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const slot = Math.floor(now / (30 * 60 * 1000));
  const start = (hash + slot) % rest.length;
  return [...generic, ...rest.slice(start), ...rest.slice(0, start)];
}

const WORKDAY_PACE_MS = Number(process.env.WORKDAY_PACE_MS ?? 400);
const WORKDAY_MAX_RETRY_WAIT_MS = 20_000;
const WORKDAY_FULL_READ_MAX = Number(process.env.WORKDAY_FULL_READ_MAX ?? 2000);

/**
 * One tenant is asked for hundreds of pages per sweep (249 phrases, 20 postings a page), and in
 * run 31 forty-one of fifty-nine tenants answered 429. Requests to a tenant are paced, and a 429
 * waits for Retry-After (or a short back-off) and tries again before the board counts as failed.
 */
async function workdaySearch(tenant: string, wd: string, site: string, text: string, offset: number, limit = 20) {
  for (let attempt = 0; ; attempt += 1) {
    await new Promise((r) => setTimeout(r, WORKDAY_PACE_MS));
    const res = await fetch(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RemotePMRadar/1.0)' },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 && attempt < 3) {
      // Retry-After is seconds or an HTTP date; either way the wait is capped so one tenant
      // cannot hold a worker past the employer budget — a longer limit is left for the next slot.
      const header = res.headers.get('retry-after') ?? '';
      const seconds = /^\d+$/.test(header) ? Number(header) : Math.max(0, (Date.parse(header) - Date.now()) / 1000);
      const wait = Math.min((seconds || 3 * 2 ** attempt) * 1000, WORKDAY_MAX_RETRY_WAIT_MS);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return workdaySearchResponse(res);
  }
}

async function workdaySearchResponse(res: Response) {
  if (res.status >= 300 && res.status < 400) {
    if (WORKDAY_MAINTENANCE.test(res.headers.get('location') ?? '')) throw new WorkdayMaintenance();
    throw new Error(`workday search redirected (${res.status})`);
  }
  if (!res.ok) throw new Error(`workday search ${res.status}`);
  return res.json() as Promise<{ total?: number; jobPostings?: WorkdayPosting[] }>;
}

/** True for failures that say nothing about the board itself: timeouts, 5xx, maintenance. */
export function isRetryableBoardError(err: unknown): boolean {
  if (err instanceof WorkdayMaintenance) return true;
  const message = (err as Error)?.message ?? '';
  const status = (err as { status?: number })?.status ?? Number(/\b(429|5\d\d)\b/.exec(message)?.[1] ?? 0);
  if (status === 429 || status >= 500) return true;
  return /abort|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|maintenance/i.test(message);
}

async function workdayDetail(tenant: string, wd: string, site: string, externalPath: string) {
  const res = await fetch(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${externalPath}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RemotePMRadar/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    jobPostingInfo?: {
      title?: string; jobDescription?: string; location?: string; additionalLocations?: string[];
      startDate?: string; timeType?: string; remoteType?: string; externalUrl?: string;
    };
  };
  return data.jobPostingInfo ?? null;
}

async function fetchWorkday(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  const coords = parseWorkdayUrl(employer.careers_url);
  if (!coords) return { jobs: [], ok: false, error: 'not a workday url', totalListed: 0 };
  const { tenant, wd, site } = coords;
  const collected = new Map<string, WorkdayPosting>();
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  // "Posted N Days Ago" is relative to when the listing was read, not to when its detail page
  // arrives minutes later; anchor the relative dates to the listing time so midnight cannot
  // shift a posting a day younger than it is.
  const listedAt = new Date();
  let truncated = false;
  let fullReadIncomplete = false;
  const collectPostings = (postings: WorkdayPosting[], seenExternalPaths?: Set<string>) => {
    for (const posting of postings) {
      if (posting.externalPath) seenExternalPaths?.add(posting.externalPath);
      if (!posting.externalPath || !isRoleTitle(posting.title ?? '', undefined, employer)) continue;
      if (!collected.has(posting.externalPath)) collected.set(posting.externalPath, posting);
    }
  };
  try {
    // Small boards are read in full because that is complete and far cheaper than 249 phrase searches.
    // Workday returns at most 20 postings per request (a larger limit returns nothing, verified
    // against highmarkhealth.wd1); full reads page to the reported total, while large or unknown
    // boards retain rotating phrase searches. The threshold chooses a strategy, never a read cap.
    if (Date.now() > deadline) {
      truncated = true;
    } else {
      const firstPage = await workdaySearch(tenant, wd, site, '', 0);
      const firstPostings = firstPage.jobPostings ?? [];
      if (typeof firstPage.total === 'number' && firstPage.total <= WORKDAY_FULL_READ_MAX) {
        const seenExternalPaths = new Set<string>();
        collectPostings(firstPostings, seenExternalPaths);
        let offset = firstPostings.length;
        while (firstPostings.length >= 20 && offset < firstPage.total) {
          if (Date.now() > deadline) { truncated = true; break; }
          const page = await workdaySearch(tenant, wd, site, '', offset);
          const postings = page.jobPostings ?? [];
          collectPostings(postings, seenExternalPaths);
          if (postings.length < 20) break;
          offset += postings.length;
        }
        // Offset pages can shift when postings close, so only a complete unique-ID count proves absence.
        if (seenExternalPaths.size < firstPage.total) {
          truncated = true;
          fullReadIncomplete = true;
          console.warn(`[workday] ${tenant}/${site}: full read saw ${seenExternalPaths.size} of ${firstPage.total} unique postings`);
        }
      } else {
        collectPostings(firstPostings);
        terms: for (const text of rotatedSearchTerms(employer.slug)) {
          for (let offset = 0; ; offset += 20) {
            if (Date.now() > deadline) { truncated = true; break terms; }
            const page = await workdaySearch(tenant, wd, site, text, offset);
            const postings = page.jobPostings ?? [];
            collectPostings(postings);
            if (postings.length < 20) break;
          }
        }
      }
    }
  } catch (err) {
    return { jobs: [], ok: false, error: (err as Error).message, retryable: isRetryableBoardError(err), totalListed: collected.size };
  }
  if (truncated && !fullReadIncomplete) console.warn(`[workday] ${tenant}/${site}: time budget reached with ${collected.size} matching postings`);

  const jobs: RawJob[] = [];
  for (const [path, posting] of collected) {
    if (Date.now() > deadline + REFRESH.employerBudgetMs) { truncated = true; break; }
    if (known?.has(`Workday:${path}`)) {
      jobs.push(unchangedJob('Workday', 'workday', path, employer.name, posting.title ?? '', `https://${tenant}.${wd}.myworkdayjobs.com/${site}${path}`));
      continue;
    }
    const detail = await workdayDetail(tenant, wd, site, path).catch(() => null);
    const html = detail?.jobDescription ?? null;
    const text = html ? stripHtml(html) : '';
    const locations = [detail?.location, ...(detail?.additionalLocations ?? [])].filter(Boolean) as string[];
    const posted = workdayPostedDate(detail?.startDate, posting.postedOn, listedAt);
    jobs.push({
      source: 'Workday',
      ats: 'workday' as unknown as Ats,
      board: `${tenant}/${site}`,
      externalId: path,
      company: employer.name,
      title: detail?.title ?? posting.title ?? '',
      locations: locations.length ? locations : [posting.locationsText ?? ''],
      workplaceType: detail?.remoteType ?? null,
      isRemote: /remote/i.test(`${detail?.remoteType ?? ''} ${posting.locationsText ?? ''}`) ? true : null,
      descriptionHtml: html,
      descriptionText: text,
      applyUrl: `https://${tenant}.${wd}.myworkdayjobs.com/${site}${path}`,
      linkType: 'employer',
      postedAt: posted.date,
      postedConfidence: posted.confidence,
      employmentType: detail?.timeType ?? null,
      salary: parseSalaryFromText(text),
      salarySource: 'description',
      industry: employer.industry,
      companySize: employer.company_size,
      hqState: employer.hq_state,
    });
  }
  return { jobs, ok: true, totalListed: collected.size, truncated };
}

/**
 * A posting that is already in the database. Its detail page is not read again — that is what
 * made a Workday tenant cost four minutes a sweep — so only identity is reported; the stored row
 * keeps its description, salary, dates and placement and is simply marked seen.
 */
function unchangedJob(source: string, ats: Ats, externalId: string, company: string, title: string, applyUrl: string): RawJob {
  return { source, ats, externalId, company, title, locations: [], applyUrl, linkType: 'employer', unchanged: true };
}

/** `known` holds the job keys (`source:externalId`) already stored for this employer. */
export async function fetchBoard(employer: EmployerRow, known?: Set<string>): Promise<BoardFetchResult> {
  if (parseWorkdayUrl(employer.careers_url)) return fetchWorkday(employer, known);
  if (employer.ats === 'manual') return fetchCareersPage(employer, known).catch((err) => ({ jobs: [], ok: false, error: (err as Error).message.slice(0, 200), retryable: isRetryableBoardError(err), totalListed: 0 }));
  const adapter = ADAPTERS[employer.ats];
  if (!adapter) return { jobs: [], ok: false, error: `Unsupported ATS: ${employer.ats}`, totalListed: 0 };
  try {
    const result = await adapter(employer, known);
    return result;
  } catch (err) {
    return { jobs: [], ok: false, error: (err as Error).message.slice(0, 200), retryable: isRetryableBoardError(err), totalListed: 0 };
  }
}

/*
 * Employer boards only.
 *
 * Aggregator adapters (Himalayas, Remotive, Remote OK) were removed on instruction: the board
 * must never show a job lead or a job-board listing. Every posting in the database is read
 * from the employer's own applicant-tracking system or careers endpoint.
 */

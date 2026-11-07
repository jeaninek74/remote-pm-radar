import { fetchJson } from './http';
import { REFRESH } from '../config';
import { isRoleTitle, searchTerms } from './titles';
import { fetchCareersPage } from './careers';
import { isoDate, stripHtml } from './text';
import { parseAshbyCompensation, parsePayRangeBlock, parseSalaryFromText, type ParsedSalary } from './salary';
import type { Ats, BoardFetchResult, RawJob } from './types';
import type { EmployerRow } from './types';

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
  for (let offset = 0; offset < 100 * REFRESH.feedPages; offset += 100) {
    const data = await fetchJson<{ content?: SrPosting[]; totalFound?: number }>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.slug)}/postings?limit=100&offset=${offset}`,
    );
    const page = Array.isArray(data.content) ? data.content : [];
    all.push(...page);
    if (page.length < 100 || all.length >= (data.totalFound ?? 0)) break;
  }
  const candidates = all.filter((p) => isRoleTitle(p.name ?? '', undefined, employer));
  const deadline = Date.now() + REFRESH.employerBudgetMs;
  let truncated = false;
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

const ADAPTERS: Record<Ats, (employer: EmployerRow, known?: Set<string>) => Promise<BoardFetchResult>> = {
  greenhouse, lever, ashby, workable, recruitee, smartrecruiters,
  // Workday coordinates live in careers_url, so the adapter ignores the slug.
  workday: fetchWorkday,
  oracle,
  dayforce,
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

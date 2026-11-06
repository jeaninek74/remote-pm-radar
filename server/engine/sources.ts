import { fetchJson } from './http';
import { isPmTitle } from './titles';
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

const MAX_DETAIL_FETCHES = 22;

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

async function greenhouse(employer: EmployerRow): Promise<BoardFetchResult> {
  const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(employer.slug)}/jobs?content=false`;
  const list = await fetchJson<{ jobs?: GhJob[] }>(listUrl);
  const all = Array.isArray(list.jobs) ? list.jobs : [];
  const candidates = all.filter((job) => isPmTitle(job.title ?? '')).slice(0, MAX_DETAIL_FETCHES);

  const jobs: RawJob[] = [];
  for (const job of candidates) {
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
  return { jobs, ok: true, totalListed: all.length };
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
    if (!isPmTitle(posting.text ?? '')) continue;
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
    if (!isPmTitle(job.title ?? '')) continue;
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
    if (!isPmTitle(job.title ?? '')) continue;
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
    if (!isPmTitle(offer.title ?? '')) continue;
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

async function smartrecruiters(employer: EmployerRow): Promise<BoardFetchResult> {
  const data = await fetchJson<{ content?: SrPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.slug)}/postings?limit=100`,
  );
  const all = Array.isArray(data.content) ? data.content : [];
  const candidates = all.filter((p) => isPmTitle(p.name ?? '')).slice(0, 15);
  const jobs: RawJob[] = [];
  for (const posting of candidates) {
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
  return { jobs, ok: true, totalListed: all.length };
}

const ADAPTERS: Record<Ats, (employer: EmployerRow) => Promise<BoardFetchResult>> = {
  greenhouse, lever, ashby, workable, recruitee, smartrecruiters,
};

export async function fetchBoard(employer: EmployerRow): Promise<BoardFetchResult> {
  const adapter = ADAPTERS[employer.ats];
  if (!adapter) return { jobs: [], ok: false, error: `Unsupported ATS: ${employer.ats}`, totalListed: 0 };
  try {
    const result = await adapter(employer);
    return result;
  } catch (err) {
    return { jobs: [], ok: false, error: (err as Error).message.slice(0, 200), totalListed: 0 };
  }
}

/* ------------------------------------------------------------------- Feed sources */

interface HimalayasJob {
  title: string;
  companyName: string;
  guid: string;
  applicationLink?: string;
  pubDate?: number;
  locationRestrictions?: string[];
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  currency?: string | null;
  employmentType?: string | null;
  description?: string;
  excerpt?: string;
  seniority?: string[];
}

async function himalayas(pages: number): Promise<RawJob[]> {
  const jobs: RawJob[] = [];
  for (let page = 0; page < pages; page++) {
    const data = await fetchJson<{ jobs?: HimalayasJob[]; nextCursor?: string | null }>(
      `https://himalayas.app/jobs/api?limit=100&offset=${page * 100}`,
    );
    const batch = Array.isArray(data.jobs) ? data.jobs : [];
    if (!batch.length) break;
    for (const job of batch) {
      if (!isPmTitle(job.title ?? '')) continue;
      let salary: ParsedSalary | null = null;
      if (job.minSalary && (job.currency ?? 'USD') === 'USD') {
        const period = (job.salaryPeriod ?? 'annual').toLowerCase();
        const factor = /month/.test(period) ? 12 : /hour/.test(period) ? 2080 : 1;
        if (/annual|year|month|hour/.test(period)) {
          salary = {
            min: Math.round(job.minSalary * factor),
            max: job.maxSalary ? Math.round(job.maxSalary * factor) : null,
            interval: /hour/.test(period) ? 'hour' : 'year',
            hourlyRate: /hour/.test(period) ? job.minSalary : null,
            isOTE: false,
            evidence: `Himalayas listing (aggregator-reported ${period} range)`,
          };
        }
      }
      const description = clean(job.description ?? job.excerpt ?? '');
      if (!salary) salary = pickSalary(description, 'Himalayas description');
      jobs.push({
        source: 'himalayas',
        ats: null,
        board: null,
        externalId: job.guid ?? `${job.companyName}-${job.title}`,
        company: job.companyName,
        title: job.title,
        locations: ['Remote'],
        restrictions: job.locationRestrictions ?? [],
        descriptionText: description,
        descriptionHtml: job.description ?? null,
        applyUrl: job.applicationLink ?? job.guid,
        linkType: 'job_board',
        postedAt: isoDate(job.pubDate ?? null),
        postedConfidence: job.pubDate ? 'confirmed' : 'unknown',
        employmentType: job.employmentType ?? null,
        salary,
        salarySource: salary ? 'Himalayas listing' : null,
        requisitionId: null,
        industry: null,
        companySize: null,
        hqState: null,
      });
    }
  }
  return jobs;
}

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  salary?: string;
  url: string;
  job_type?: string;
  description?: string;
}

async function remotive(): Promise<RawJob[]> {
  const data = await fetchJson<{ jobs?: RemotiveJob[] }>('https://remotive.com/api/remote-jobs?limit=500');
  const all = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs: RawJob[] = [];
  for (const job of all) {
    if (!isPmTitle(job.title ?? '')) continue;
    const description = clean(job.description);
    const salary = parseSalaryFromText(job.salary ?? '', 'Remotive listing') ?? pickSalary(description, 'Remotive description');
    jobs.push({
      source: 'remotive',
      ats: null,
      board: null,
      externalId: String(job.id),
      company: job.company_name,
      title: job.title,
      locations: ['Remote'],
      restrictions: job.candidate_required_location ? [job.candidate_required_location] : [],
      descriptionText: description,
      applyUrl: job.url,
      linkType: 'job_board',
      postedAt: isoDate(job.publication_date),
      postedConfidence: job.publication_date ? 'confirmed' : 'unknown',
      employmentType: job.job_type ?? null,
      salary,
      salarySource: salary ? 'Remotive listing' : null,
      requisitionId: null,
    });
  }
  return jobs;
}

interface RemoteOkJob {
  id: string;
  position: string;
  company: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  date?: string;
  url: string;
  apply_url?: string;
  description?: string;
  tags?: string[];
}

async function remoteok(): Promise<RawJob[]> {
  const data = await fetchJson<RemoteOkJob[]>('https://remoteok.com/api');
  const all = Array.isArray(data) ? data.filter((row) => row && typeof row === 'object' && row.id && row.position) : [];
  const jobs: RawJob[] = [];
  for (const job of all) {
    if (!isPmTitle(job.position ?? '')) continue;
    const description = clean(job.description);
    let salary: ParsedSalary | null = null;
    if (job.salary_min && job.salary_min > 40_000) {
      salary = {
        min: Math.round(job.salary_min),
        max: job.salary_max ? Math.round(job.salary_max) : null,
        interval: 'year', hourlyRate: null, isOTE: false,
        evidence: 'Remote OK listing (aggregator-reported annual range)',
      };
    }
    if (!salary) salary = pickSalary(description, 'Remote OK description');
    const applyUrl = job.apply_url || job.url;
    jobs.push({
      source: 'remoteok',
      ats: null,
      board: null,
      externalId: String(job.id),
      company: job.company,
      title: job.position,
      locations: [job.location ?? 'Remote'],
      restrictions: [job.location ?? ''],
      descriptionText: description,
      applyUrl,
      linkType: /remoteok\.com/.test(applyUrl) ? 'job_board' : 'employer',
      postedAt: isoDate(job.date ?? null),
      postedConfidence: job.date ? 'confirmed' : 'unknown',
      employmentType: null,
      salary,
      salarySource: salary ? 'Remote OK listing' : null,
      requisitionId: null,
    });
  }
  return jobs;
}

export const FEEDS: { id: string; label: string; run: (pages: number) => Promise<RawJob[]> }[] = [
  { id: 'himalayas', label: 'Himalayas feed', run: himalayas },
  { id: 'remotive', label: 'Remotive feed', run: () => remotive() },
  { id: 'remoteok', label: 'Remote OK feed', run: () => remoteok() },
];

import { REFRESH } from '../config';
import { evaluateLocation } from './location';
import { fetchJson, fetchText } from './http';
import { stripHtml } from './text';

export const HARVEST_ATS = [
  'lever',
  'greenhouse',
  'ashby',
  'workable',
  'smartrecruiters',
  'recruitee',
] as const;

export type HarvestAts = (typeof HARVEST_ATS)[number];

export interface ClusterIndexEntry {
  key: string;
  file: string;
  offset: number;
  length: number;
  clusterId: string;
}

const SURT_PREFIX_BY_PATTERN: Record<string, string> = {
  'jobs.lever.co/*': 'co,lever,jobs)/',
  'boards.greenhouse.io/*': 'io,greenhouse,boards)/',
  'job-boards.greenhouse.io/*': 'io,greenhouse,job-boards)/',
  'jobs.ashbyhq.com/*': 'com,ashbyhq,jobs)/',
  'apply.workable.com/*': 'com,workable,apply)/',
  'jobs.smartrecruiters.com/*': 'com,smartrecruiters,jobs)/',
  'careers.smartrecruiters.com/*': 'com,smartrecruiters,careers)/',
  '*.recruitee.com/*': 'com,recruitee,',
};

export function surtPrefix(hostPattern: string): string | null {
  return SURT_PREFIX_BY_PATTERN[hostPattern] ?? null;
}

export function blocksForPrefix<T extends { key: string }>(
  entries: readonly T[],
  prefix: string,
): T[] {
  let preceding: T | null = null;
  const matching: T[] = [];
  for (const entry of entries) {
    if (entry.key < prefix) {
      preceding = entry;
    } else if (entry.key.startsWith(prefix)) {
      matching.push(entry);
    } else {
      break;
    }
  }
  return [...(preceding ? [preceding] : []), ...matching];
}

export interface BoardCandidateInput {
  ats: HarvestAts;
  slug: string;
  source: string;
}

export interface BoardCandidatePayload {
  candidates: BoardCandidateInput[];
}

export type BoardCandidateStatus = 'empty' | 'no_name' | 'foreign' | 'duplicate' | 'added';

export interface BoardCandidateValidation {
  status: BoardCandidateStatus;
  name?: string;
  careersUrl?: string;
  total?: number;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,99}$/;
const RESERVED_SLUGS = new Set([
  'api', 'assets', 'auth', 'careers', 'embed', 'favicon.ico', 'jobs', 'login', 'robots.txt',
  'static', 'v0', 'v1', 'www',
]);

export function isHarvestAts(value: unknown): value is HarvestAts {
  return typeof value === 'string' && (HARVEST_ATS as readonly string[]).includes(value);
}

export function isBoardCandidateSlug(value: unknown): value is string {
  return typeof value === 'string'
    && SLUG_PATTERN.test(value)
    && !RESERVED_SLUGS.has(value.toLowerCase());
}

function firstPathSegment(url: URL): string | null {
  const segment = url.pathname.split('/').filter(Boolean)[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return null;
  }
}

function normalizedCandidate(ats: HarvestAts, value: string | null | undefined) {
  const slug = value?.trim().toLowerCase();
  return slug && isBoardCandidateSlug(slug) ? { ats, slug } : null;
}

export function extractBoardSlug(value: string): { ats: HarvestAts; slug: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');

  if (host === 'jobs.lever.co') return normalizedCandidate('lever', firstPathSegment(url));
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    if (/^\/embed\/job_board\/?$/i.test(url.pathname)) {
      return normalizedCandidate('greenhouse', url.searchParams.get('for'));
    }
    return normalizedCandidate('greenhouse', firstPathSegment(url));
  }
  if (host === 'jobs.ashbyhq.com') return normalizedCandidate('ashby', firstPathSegment(url));
  if (host === 'apply.workable.com') return normalizedCandidate('workable', firstPathSegment(url));
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') {
    return normalizedCandidate('smartrecruiters', firstPathSegment(url));
  }
  if (host.endsWith('.recruitee.com')) {
    return normalizedCandidate('recruitee', host.slice(0, -'.recruitee.com'.length));
  }
  return null;
}

export function isBoardCandidatePayload(value: unknown): value is BoardCandidatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidates = (value as { candidates?: unknown }).candidates;
  return Array.isArray(candidates)
    && candidates.length <= 2000
    && candidates.every((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
      const item = candidate as Record<string, unknown>;
      return isHarvestAts(item.ats)
        && isBoardCandidateSlug(item.slug)
        && typeof item.source === 'string'
        && item.source.trim().length > 0
        && item.source.length <= 300;
    });
}

export function classifyBoardCandidate(
  name: string | null | undefined,
  postingLocations: string[][],
  duplicate = false,
): BoardCandidateStatus {
  if (!postingLocations.length) return 'empty';
  if (!name?.trim()) return 'no_name';
  if (postingLocations.every((locations) => evaluateLocation({ locations }).ca === 'not_us')) {
    return 'foreign';
  }
  return duplicate ? 'duplicate' : 'added';
}

interface CandidateBoard {
  name: string | null;
  careersUrl: string;
  postingLocations: string[][];
}

function timeoutFor(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Board candidate validation deadline exceeded');
  return Math.min(REFRESH.timeoutMs, remaining);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function locationGroup(...values: unknown[]): string[] {
  const parts = values.map(text).filter(Boolean);
  return parts.length ? [parts.join(', ')] : [];
}

const ATS_TITLE_SUFFIX = /\s*[|–—-]\s*(?:lever|ashby|greenhouse|workable|smartrecruiters|recruitee)\s*$/i;
const ROLE_TITLE_SUFFIX = /(?:\s*[|–—-]\s*|\s+)(?:jobs?|careers?|open roles?)\s*$/i;

export function pageTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  let title = match ? stripHtml(match[1]).trim() : '';
  while (title) {
    const withoutAts = title.replace(ATS_TITLE_SUFFIX, '').trim();
    if (withoutAts !== title) {
      title = withoutAts;
      continue;
    }
    const withoutRoleSuffix = title.replace(ROLE_TITLE_SUFFIX, '').trim();
    if (withoutRoleSuffix === title) break;
    title = withoutRoleSuffix;
  }
  if (!title || /^(?:careers|jobs|open roles?)(?:\s*[|–-]\s*(?:lever|ashby|recruitee))?$/i.test(title)) {
    return null;
  }
  return title;
}

async function pageCompanyName(url: string, deadline: number): Promise<string | null> {
  const html = await fetchText(url, timeoutFor(deadline));
  return pageTitle(html);
}

async function readCandidateBoard(ats: HarvestAts, slug: string, deadline: number): Promise<CandidateBoard> {
  const encoded = encodeURIComponent(slug);
  switch (ats) {
    case 'greenhouse': {
      const [listing, meta] = await Promise.all([
        fetchJson<{ jobs?: unknown[] }>(
          `https://boards-api.greenhouse.io/v1/boards/${encoded}/jobs?content=false`,
          timeoutFor(deadline),
        ),
        fetchJson<{ name?: unknown }>(
          `https://boards-api.greenhouse.io/v1/boards/${encoded}`,
          timeoutFor(deadline),
        ),
      ]);
      const jobs = Array.isArray(listing.jobs) ? listing.jobs : [];
      const name = text(meta.name) || (jobs.length
        ? text(record(jobs[0]).company_name) || null
        : null);
      return {
        name,
        careersUrl: `https://boards.greenhouse.io/${encoded}`,
        postingLocations: jobs.map((job) => locationGroup(record(record(job).location).name)),
      };
    }
    case 'lever': {
      const raw = await fetchJson<unknown>(
        `https://api.lever.co/v0/postings/${encoded}?mode=json`,
        timeoutFor(deadline),
      );
      const jobs = Array.isArray(raw) ? raw : [];
      const first = record(jobs[0]);
      const apiName = text(first.company) || text(first.organizationName);
      const name = apiName || (jobs.length
        ? await pageCompanyName(`https://jobs.lever.co/${encoded}`, deadline)
        : null);
      return {
        name,
        careersUrl: `https://jobs.lever.co/${encoded}`,
        postingLocations: jobs.map((job) => {
          const categories = record(record(job).categories);
          const all = Array.isArray(categories.allLocations)
            ? categories.allLocations.map(text).filter(Boolean)
            : [];
          return all.length ? all : locationGroup(categories.location);
        }),
      };
    }
    case 'ashby': {
      const data = await fetchJson<{ jobs?: unknown[]; companyName?: unknown; organizationName?: unknown }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encoded}`,
        timeoutFor(deadline),
      );
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      const name = text(data.companyName) || text(data.organizationName) || (jobs.length
        ? await pageCompanyName(`https://jobs.ashbyhq.com/${encoded}`, deadline)
        : null);
      return {
        name,
        careersUrl: `https://jobs.ashbyhq.com/${encoded}`,
        postingLocations: jobs.map((job) => {
          const item = record(job);
          const secondary = Array.isArray(item.secondaryLocations)
            ? item.secondaryLocations.map((location) => text(record(location).location)).filter(Boolean)
            : [];
          return [text(item.location), ...secondary].filter(Boolean);
        }),
      };
    }
    case 'workable': {
      const data = await fetchJson<{ name?: unknown; jobs?: unknown[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${encoded}?details=true`,
        timeoutFor(deadline),
      );
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      return {
        name: text(data.name) || null,
        careersUrl: `https://apply.workable.com/${encoded}/`,
        postingLocations: jobs.map((job) => {
          const item = record(job);
          const locations = Array.isArray(item.locations)
            ? item.locations.map((location) => locationGroup(
              record(location).city, record(location).region, record(location).country,
            )[0]).filter(Boolean)
            : [];
          return locations.length
            ? locations
            : locationGroup(item.city, item.state, item.country);
        }),
      };
    }
    case 'smartrecruiters': {
      const postings: unknown[] = [];
      let offset = 0;
      let totalFound: number | null = null;
      do {
        const data = await fetchJson<{ content?: unknown[]; totalFound?: unknown }>(
          `https://api.smartrecruiters.com/v1/companies/${encoded}/postings?limit=100&offset=${offset}`,
          timeoutFor(deadline),
        );
        const page = Array.isArray(data.content) ? data.content : [];
        postings.push(...page);
        totalFound = typeof data.totalFound === 'number' && Number.isFinite(data.totalFound)
          ? data.totalFound
          : null;
        if (page.length < 100 || (totalFound !== null && postings.length >= totalFound)) break;
        offset += page.length;
        if (Date.now() >= deadline) throw new Error('Board candidate validation deadline exceeded');
      } while (postings.length);
      const postingName = text(record(record(postings[0]).company).name);
      const company = postingName
        ? null
        : await fetchJson<{ name?: unknown }>(
          `https://api.smartrecruiters.com/v1/companies/${encoded}`,
          timeoutFor(deadline),
        ).catch(() => null);
      return {
        name: postingName || text(company?.name) || null,
        careersUrl: `https://jobs.smartrecruiters.com/${encoded}`,
        postingLocations: postings.map((posting) => {
          const location = record(record(posting).location);
          return locationGroup(location.city, location.region, location.country);
        }),
      };
    }
    case 'recruitee': {
      const [data, name] = await Promise.all([
        fetchJson<{ offers?: unknown[] }>(
          `https://${encoded}.recruitee.com/api/offers/`,
          timeoutFor(deadline),
        ),
        pageCompanyName(`https://${encoded}.recruitee.com/`, deadline),
      ]);
      const offers = Array.isArray(data.offers) ? data.offers : [];
      return {
        name,
        careersUrl: `https://${encoded}.recruitee.com/`,
        postingLocations: offers.map((offer) => {
          const item = record(offer);
          return locationGroup(item.city, item.country);
        }),
      };
    }
  }
}

export async function validateBoardCandidate(
  ats: string,
  slug: string,
  deadline: number,
  isDuplicate: (name: string) => boolean | Promise<boolean> = () => false,
): Promise<BoardCandidateValidation> {
  if (!isHarvestAts(ats) || !isBoardCandidateSlug(slug)) {
    throw new Error('Invalid board candidate');
  }
  const board = await readCandidateBoard(ats, slug.toLowerCase(), deadline);
  const statusWithoutDuplicate = classifyBoardCandidate(board.name, board.postingLocations);
  if (statusWithoutDuplicate !== 'added') {
    return { status: statusWithoutDuplicate, name: board.name ?? undefined, careersUrl: board.careersUrl, total: board.postingLocations.length };
  }
  const duplicate = await isDuplicate(board.name!);
  return {
    status: classifyBoardCandidate(board.name, board.postingLocations, duplicate),
    name: board.name!,
    careersUrl: board.careersUrl,
    total: board.postingLocations.length,
  };
}

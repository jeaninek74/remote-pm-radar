import { timingSafeEqual } from 'node:crypto';
import { careersExternalId, rawJobFromRenderedCareersPage } from './careers';
import type { EmployerRow, RawJob } from './types';

export interface BrowserPage {
  url: string;
  linkText: string;
  html: string;
}

export interface BrowserIngestPayload {
  employerId: number;
  complete: boolean;
  timedOut: boolean;
  listedUrls: string[];
  pages: BrowserPage[];
}

export interface BrowserPayloadPage extends BrowserPage {
  frameOrigin?: string;
}

export interface BrowserPayloadChunks {
  chunks: BrowserIngestPayload[];
  complete: boolean;
  skippedUrls: string[];
}

export function buildBrowserPayloadChunks(
  employerId: number,
  complete: boolean,
  timedOut: boolean,
  listedUrls: string[],
  pages: BrowserPayloadPage[],
  maxBodyBytes: number,
): BrowserPayloadChunks {
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error('Browser ingest body limit must be a positive integer');
  }
  const makePayload = (
    pageChunk: BrowserPage[],
    includeListedUrls: boolean,
    payloadComplete: boolean,
  ): BrowserIngestPayload => ({
    employerId,
    complete: payloadComplete,
    timedOut,
    listedUrls: includeListedUrls ? listedUrls : [],
    pages: pageChunk,
  });
  const fits = (payload: BrowserIngestPayload) =>
    Buffer.byteLength(JSON.stringify(payload)) <= maxBodyBytes;
  if (!fits(makePayload([], true, false))) {
    throw new Error('Full listedUrls payload exceeds the browser ingest body limit');
  }

  const pageChunks: BrowserPage[][] = [];
  const skippedUrls: string[] = [];
  let current: BrowserPage[] = [];
  let payloadComplete = complete;
  for (const page of pages) {
    const payloadPage = { url: page.url, linkText: page.linkText, html: page.html };
    if (!fits(makePayload([payloadPage], false, false))) {
      skippedUrls.push(page.url);
      payloadComplete = false;
      continue;
    }
    const trial = [...current, payloadPage];
    if (!fits(makePayload(trial, false, false))) {
      if (current.length) pageChunks.push(current);
      current = [payloadPage];
    } else {
      current = trial;
    }
  }
  if (current.length) pageChunks.push(current);

  const finalPageChunk = pageChunks.at(-1);
  const listedUrlsFitWithFinalChunk = Boolean(
    finalPageChunk && fits(makePayload(finalPageChunk, true, payloadComplete)),
  );
  const chunks = pageChunks.map((pageChunk, index) => {
    const isFinalPageChunk = index === pageChunks.length - 1 && listedUrlsFitWithFinalChunk;
    return makePayload(
      pageChunk,
      isFinalPageChunk,
      isFinalPageChunk ? payloadComplete : false,
    );
  });
  if (!listedUrlsFitWithFinalChunk) {
    chunks.push(makePayload([], true, payloadComplete));
  }
  return { chunks, complete: payloadComplete, skippedUrls };
}

export function browserIngestAuthStatus(
  authorization: string | undefined,
  expectedToken: string | undefined,
): 200 | 401 {
  if (!expectedToken) return 401;
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const supplied = Buffer.from(authorization ?? '');
  if (expected.length !== supplied.length) return 401;
  return timingSafeEqual(expected, supplied) ? 200 : 401;
}

export function isBrowserIngestPayload(value: unknown): value is BrowserIngestPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Partial<BrowserIngestPayload>;
  return Number.isInteger(body.employerId)
    && typeof body.complete === 'boolean'
    && typeof body.timedOut === 'boolean'
    && Array.isArray(body.listedUrls)
    && body.listedUrls.every((url) => typeof url === 'string')
    && Array.isArray(body.pages)
    && body.pages.every((page) => page !== null
      && typeof page === 'object'
      && typeof page.url === 'string'
      && typeof page.linkText === 'string'
      && typeof page.html === 'string');
}

export function browserJobKey(employer: EmployerRow, url: string): string {
  const source = `browser:${employer.slug}`;
  const origin = new URL(employer.careers_url ?? '').origin;
  return `${source}:${careersExternalId(origin, url)}`.slice(0, 190);
}

export function browserUnchangedJob(employer: EmployerRow, url: string): RawJob {
  const source = `browser:${employer.slug}`;
  const origin = new URL(employer.careers_url ?? '').origin;
  return {
    source,
    externalId: careersExternalId(origin, url),
    company: employer.name,
    title: '',
    locations: [],
    applyUrl: url,
    linkType: 'employer',
    unchanged: true,
  };
}

export function browserJobsFromPages(
  employer: EmployerRow,
  knownJobKeys: Set<string>,
  listedUrls: string[],
  pages: BrowserPage[],
): RawJob[] {
  const origin = new URL(employer.careers_url ?? '').origin;
  const source = `browser:${employer.slug}`;
  const jobs: RawJob[] = [];
  const listed = new Set<string>();
  for (const url of listedUrls) {
    const externalId = careersExternalId(origin, url);
    const key = `${source}:${externalId}`.slice(0, 190);
    if (knownJobKeys.has(key) && !listed.has(key)) {
      jobs.push(browserUnchangedJob(employer, url));
      listed.add(key);
    }
  }
  for (const page of pages) {
    const job = rawJobFromRenderedCareersPage(employer, source, origin, page.url, page.linkText, page.html);
    if (job) jobs.push(job);
  }
  return jobs;
}

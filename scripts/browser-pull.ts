import { readFile } from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { evaluateRaw } from '../server/engine/ingest';
import {
  browserJobKey,
  browserIngestAuthStatus,
  type BrowserPage,
} from '../server/engine/browser-pull';
import {
  careersPostingUrl,
  isBrowserCareersPostingLink,
  rawJobFromRenderedCareersPage,
  sameCareerSite,
} from '../server/engine/careers';
import type { EmployerRow, RawJob } from '../server/engine/types';

const EMPLOYER_BUDGET_MS = 180_000;
const DETAIL_CONCURRENCY = 2;
const MAX_POST_BODY_BYTES = 7 * 1024 * 1024;
const RETRY_WINDOW_MS = 10 * 60_000;
const RETRY_DELAY_MS = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface BrowserEmployer {
  id: number;
  name: string;
  slug: string;
  careers_url: string;
  job_keys: string[];
}

interface BrowserTarget {
  name: string;
  url: string;
  urls?: string[];
  slug?: string;
  id?: number;
  jobKeys?: Set<string>;
  hqState?: string | null;
}

interface CandidateLink {
  url: string;
  linkText: string;
  frameOrigin: string;
}

interface RenderedEmployer {
  employer: EmployerRow;
  employerId: number | null;
  listedUrls: string[];
  pages: (BrowserPage & { frameOrigin: string })[];
  complete: boolean;
  timedOut: boolean;
  candidates: CandidateLink[];
}

function browserSlugForUrl(value: string): string {
  const url = new URL(value);
  return `${url.hostname}${url.pathname.replace(/\/+$/, '')}`;
}

function employerForTarget(target: BrowserTarget): EmployerRow {
  const url = target.url;
  return {
    id: target.id ?? 0,
    slug: target.slug ?? browserSlugForUrl(url),
    ats: 'browser',
    name: target.name,
    industry: null,
    company_size: null,
    hq_state: target.hqState ?? null,
    careers_url: url,
    black_owned: false,
    ownership_status: 'Not researched',
    ownership_source: null,
    last_searched_at: null,
    last_resolve_at: null,
    active: true,
  };
}

async function waitForRenderedPage(page: Page, url: string, deadline: number): Promise<boolean> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return false;
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(25_000, remaining),
    });
  } catch {
    return false;
  }
  const idleRemaining = deadline - Date.now();
  if (idleRemaining > 0) {
    await page.waitForLoadState('networkidle', {
      timeout: Math.min(12_000, idleRemaining),
    }).catch(() => undefined);
  }
  const settle = Math.min(3_000, Math.max(0, deadline - Date.now()));
  if (settle > 0) await page.waitForTimeout(settle);
  return true;
}

async function collectCandidates(
  page: Page,
  employerUrl: string,
): Promise<{ candidates: CandidateLink[]; complete: boolean }> {
  const employerHost = new URL(employerUrl).hostname;
  const found = new Map<string, CandidateLink>();
  let complete = true;
  for (const frame of page.frames()) {
    let frameUrl: URL;
    try {
      frameUrl = new URL(frame.url());
      if (frameUrl.protocol !== 'http:' && frameUrl.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    const embedded = frame !== page.mainFrame();
    let links: { url: string; text: string }[];
    try {
      links = await frame.locator('a').evaluateAll((anchors) => anchors.map((anchor) => {
        const element = anchor as HTMLAnchorElement;
        return {
          url: element.href || element.getAttribute('href') || '',
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        };
      }));
    } catch {
      complete = false;
      continue;
    }
    for (const link of links) {
      let url: URL;
      try {
        url = new URL(link.url);
      } catch {
        continue;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (!embedded && !sameCareerSite(url.hostname, employerHost)) continue;
      if (!isBrowserCareersPostingLink(url.toString(), link.text)) continue;
      const candidate = {
        url: careersPostingUrl(url.toString()),
        linkText: link.text,
        frameOrigin: frameUrl.origin,
      };
      const previous = found.get(candidate.url);
      if (!previous || (!previous.linkText && candidate.linkText)) found.set(candidate.url, candidate);
    }
  }
  return { candidates: [...found.values()], complete };
}

async function renderEmployer(
  context: BrowserContext,
  target: BrowserTarget,
): Promise<RenderedEmployer> {
  const employer = employerForTarget(target);
  const base = employer.careers_url ?? '';
  const deadline = Date.now() + EMPLOYER_BUDGET_MS;
  let complete = true;
  let timedOut = false;
  const candidateByUrl = new Map<string, CandidateLink>();
  const listingUrls = [...new Set(target.urls?.length ? target.urls : [base])];
  for (const listingUrl of listingUrls) {
    if (Date.now() >= deadline) {
      timedOut = true;
      complete = false;
      break;
    }
    const rootPage = await context.newPage();
    try {
      if (!(await waitForRenderedPage(rootPage, listingUrl, deadline))) complete = false;
      if (Date.now() < deadline) {
        const collected = await collectCandidates(rootPage, listingUrl);
        complete &&= collected.complete;
        for (const candidate of collected.candidates) {
          const previous = candidateByUrl.get(candidate.url);
          if (!previous || (!previous.linkText && candidate.linkText)) {
            candidateByUrl.set(candidate.url, candidate);
          }
        }
      }
    } catch (error) {
      complete = false;
      console.error(`ROOT ${target.name} ${listingUrl}: ${(error as Error).message}`);
    } finally {
      await rootPage.close().catch(() => undefined);
    }
  }
  if (Date.now() >= deadline) {
    timedOut = true;
    complete = false;
  }
  const candidates = [...candidateByUrl.values()];

  for (const candidate of candidates) {
    console.log(`LINK\t${target.name}\t${candidate.frameOrigin}\t${candidate.url}`);
  }

  const candidatesToRender = candidates.filter((candidate) =>
    !target.jobKeys?.has(browserJobKey(employer, candidate.url)));
  const pages: (BrowserPage & { frameOrigin: string })[] = [];
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() >= deadline) {
        timedOut = true;
        complete = false;
        return;
      }
      const index = cursor++;
      if (index >= candidatesToRender.length) return;
      const candidate = candidatesToRender[index];
      const page = await context.newPage();
      try {
        if (!(await waitForRenderedPage(page, candidate.url, deadline))) {
          complete = false;
          continue;
        }
        pages[index] = {
          url: candidate.url,
          linkText: candidate.linkText,
          html: await page.content(),
          frameOrigin: candidate.frameOrigin,
        };
      } catch (error) {
        complete = false;
        console.error(`DETAIL ${target.name} ${candidate.url}: ${(error as Error).message}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  if (Date.now() >= deadline || cursor < candidatesToRender.length) {
    timedOut = true;
    complete = false;
  }
  return {
    employer,
    employerId: target.id ?? null,
    listedUrls: candidates.map((candidate) => candidate.url),
    pages: pages.filter((page): page is BrowserPage & { frameOrigin: string } => Boolean(page)),
    complete,
    timedOut,
    candidates,
  };
}

function rawJobsFor(rendered: RenderedEmployer): RawJob[] {
  const origin = new URL(rendered.employer.careers_url ?? '').origin;
  const source = `browser:${rendered.employer.slug}`;
  return rendered.pages.flatMap((page) => {
    const job = rawJobFromRenderedCareersPage(
      rendered.employer,
      source,
      origin,
      page.url,
      page.linkText,
      page.html,
    );
    return job ? [job] : [];
  });
}

function printDryRun(rendered: RenderedEmployer): void {
  const jobs = rawJobsFor(rendered);
  const buckets: Record<string, number> = {
    tab0: 0,
    tab1: 0,
    tab2: 0,
    unsalaried: 0,
    queue: 0,
    archived: 0,
    excluded: 0,
  };
  const samples: { job: RawJob; bucket: string }[] = [];
  for (const job of jobs) {
    const evaluated = evaluateRaw(job, rendered.employer);
    const bucket = evaluated?.bucket ?? 'excluded';
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    if (samples.length < 3) samples.push({ job, bucket });
  }
  const bucketText = Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .map(([bucket, count]) => `${bucket}:${count}`)
    .join(',') || 'none';
  console.log(
    `SITE\t${rendered.employer.name}\tpostings=${rendered.listedUrls.length}`
    + `\ttitleMatched=${jobs.length}\tbuckets=${bucketText}`
    + `\tcomplete=${rendered.complete}\ttimedOut=${rendered.timedOut}`,
  );
  for (const { job, bucket } of samples) {
    console.log(`SAMPLE\t${rendered.employer.name}\t${JSON.stringify({
      title: job.title,
      applyUrl: job.applyUrl,
      postedAt: job.postedAt ?? null,
      salary: job.salary ?? null,
      location: job.locations.join('; '),
      bucket,
    })}`);
  }
}

function parseJsonlTargets(text: string): BrowserTarget[] {
  const selected = new Map<string, BrowserTarget & { count: number; urls: string[] }>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as {
      name?: unknown;
      website?: unknown;
      state?: unknown;
      url?: unknown;
      postings?: unknown;
      pages?: unknown;
    };
    const name = typeof row.name === 'string' ? row.name : '';
    if (Array.isArray(row.pages)) {
      const pages = row.pages.filter((page): page is {
        url: string;
        finalUrl?: string;
        postings: number;
      } =>
        page !== null
        && typeof page === 'object'
        && typeof page.url === 'string'
        && typeof page.postings === 'number'
        && page.postings > 0
        && /^https?:\/\//i.test(
          typeof page.finalUrl === 'string' ? page.finalUrl : page.url,
        ));
      if (!pages.length) continue;
      const pageTargets = pages.map((page) => ({
        url: typeof page.finalUrl === 'string' ? page.finalUrl : page.url,
        postings: page.postings,
      }));
      const chosen = pageTargets.reduce((best, current) => current.postings > best.postings ? current : best);
      const urls = [...new Set(pageTargets.map((page) => page.url))];
      const key = name || chosen.url;
      const previous = selected.get(key);
      if (!previous) {
        selected.set(key, {
          name: name || new URL(chosen.url).hostname,
          url: chosen.url,
          urls,
          hqState: typeof row.state === 'string' ? row.state : null,
          count: chosen.postings,
        });
      } else {
        previous.urls = [...new Set([...previous.urls, ...urls])];
        if (chosen.postings > previous.count) {
          previous.url = chosen.url;
          previous.count = chosen.postings;
        }
      }
      continue;
    }
    const directUrl = typeof row.url === 'string'
      ? row.url
      : typeof row.website === 'string'
        ? row.website
        : '';
    if (!/^https?:\/\//i.test(directUrl)) continue;
    const key = name || directUrl;
    if (!selected.has(key)) {
      selected.set(key, {
        name: name || new URL(directUrl).hostname,
        url: directUrl,
        urls: [directUrl],
        hqState: typeof row.state === 'string' ? row.state : null,
        count: typeof row.postings === 'number' ? row.postings : 0,
      });
    }
  }
  return [...selected.values()].map(({ count: _count, ...target }) => target);
}

async function readUrlTargets(filename: string): Promise<BrowserTarget[]> {
  const contents = await readFile(filename, 'utf8');
  if (filename.toLowerCase().endsWith('.txt')) {
    return contents.split(/\r?\n/).flatMap((line) => {
      const value = line.trim();
      if (!value) return [];
      const [first, second] = value.split(/\t+/);
      const url = second && /^https?:\/\//i.test(second) ? second : first;
      if (!/^https?:\/\//i.test(url)) return [];
      return [{ name: second ? first : new URL(url).hostname, url }];
    });
  }
  return parseJsonlTargets(contents);
}

async function runBrowserTargets(
  targets: BrowserTarget[],
  mode: 'dry-run' | 'probe' | 'server',
): Promise<RenderedEmployer[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const rendered: RenderedEmployer[] = [];
  try {
    for (const target of targets) {
      try {
        const result = await renderEmployer(context, target);
        rendered.push(result);
        if (mode === 'dry-run') printDryRun(result);
        if (mode === 'probe') {
          console.log(
            `PROBE\t${target.url}\tpostings=${result.listedUrls.length}`
            + `\ttitleMatched=${rawJobsFor(result).length}`,
          );
        }
      } catch (error) {
        console.error(`EMPLOYER ${target.name}: ${(error as Error).message}`);
        rendered.push({
          employer: employerForTarget(target),
          employerId: target.id ?? null,
          listedUrls: [],
          pages: [],
          complete: false,
          timedOut: false,
          candidates: [],
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return rendered;
}

function postPayloads(rendered: RenderedEmployer): Record<string, unknown>[] {
  const employerId = rendered.employerId;
  if (employerId === null) throw new Error('Cannot post a browser pull without an employer id');
  const pageChunks: (BrowserPage & { frameOrigin: string })[][] = [];
  let current: (BrowserPage & { frameOrigin: string })[] = [];
  for (const page of rendered.pages) {
    const trial = [...current, page].map(({ url, linkText, html }) => ({ url, linkText, html }));
    const body = JSON.stringify({
      employerId,
      complete: false,
      timedOut: rendered.timedOut,
      listedUrls: [],
      pages: trial,
    });
    if (Buffer.byteLength(body) > MAX_POST_BODY_BYTES) {
      if (!current.length) {
        console.error(`SKIP oversized posting page for ${rendered.employer.name}: ${page.url}`);
        rendered.complete = false;
        continue;
      }
      pageChunks.push(current);
      current = [page];
      continue;
    }
    current.push(page);
  }
  if (current.length || !pageChunks.length) pageChunks.push(current);

  const listedBodyBytes = Buffer.byteLength(JSON.stringify(rendered.listedUrls));
  const pageBodyBytes = Math.max(...pageChunks.map((chunk) => Buffer.byteLength(JSON.stringify(
    chunk.map(({ url, linkText, html }) => ({ url, linkText, html })),
  ))));
  if (listedBodyBytes + pageBodyBytes + 1024 > MAX_POST_BODY_BYTES) {
    throw new Error('Full listedUrls payload exceeds the browser ingest body limit');
  }
  return pageChunks.map((chunk, index) => ({
    employerId,
    complete: index === pageChunks.length - 1 && rendered.complete,
    timedOut: rendered.timedOut,
    listedUrls: index === pageChunks.length - 1 ? rendered.listedUrls : [],
    pages: chunk.map(({ url, linkText, html }) => ({ url, linkText, html })),
  }));
}

function postWindowDelay(now = new Date()): number {
  const minute = now.getUTCMinutes();
  const second = now.getUTCSeconds();
  if (minute >= 28 && minute <= 32) return ((33 - minute) * 60 - second) * 1000;
  if (minute >= 58) return ((63 - minute) * 60 - second) * 1000;
  if (minute <= 2) return ((3 - minute) * 60 - second) * 1000;
  return 0;
}

async function waitForPostWindow(): Promise<void> {
  for (;;) {
    const delay = postWindowDelay();
    if (delay <= 0) return;
    console.log(`POST window blocked; waiting ${Math.ceil(delay / 1000)} seconds`);
    await sleep(delay);
  }
}

async function postWithRetry(
  radarUrl: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const startedAt = Date.now();
  for (;;) {
    await waitForPostWindow();
    const response = await fetch(`${radarUrl}/api/browser-ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 409) {
      if (Date.now() - startedAt >= RETRY_WINDOW_MS) {
        throw new Error('Server remained busy for ten minutes');
      }
      console.log('Server returned 409; retrying in 60 seconds');
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}

async function runServerMode(): Promise<void> {
  const token = process.env.BROWSER_INGEST_TOKEN;
  if (browserIngestAuthStatus(undefined, token) === 404) {
    console.log('BROWSER_INGEST_TOKEN not set; skipping');
    return;
  }
  const radarUrl = (process.env.RADAR_URL ?? 'https://remote-pm-radar.onrender.com').replace(/\/+$/, '');
  const response = await fetch(`${radarUrl}/api/browser-employers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GET /api/browser-employers failed: HTTP ${response.status}`);
  const payload = await response.json() as { employers?: BrowserEmployer[] };
  const employers = payload.employers ?? [];
  const targets: BrowserTarget[] = employers.map((employer) => ({
    id: employer.id,
    name: employer.name,
    slug: employer.slug,
    url: employer.careers_url,
    jobKeys: new Set(employer.job_keys),
  }));

  const rendered = await runBrowserTargets(targets, 'server');
  let posted = 0;
  let failed = 0;
  for (const result of rendered) {
    if (!result.complete || result.timedOut) failed += 1;
    try {
      const chunks = postPayloads(result);
      for (const chunk of chunks) {
        const responseBody = await postWithRetry(radarUrl, token!, chunk);
        console.log(`INGEST\t${result.employer.name}\t${JSON.stringify(responseBody)}`);
        posted += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`POST ${result.employer.name}: ${(error as Error).message}`);
    }
  }
  console.log(`SUMMARY\temployers=${rendered.length}\tposts=${posted}\tfailed=${failed}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--probe' && args[1]) {
    const url = args[1];
    await runBrowserTargets([{ name: new URL(url).hostname, url }], 'probe');
    return;
  }
  if (args[0] === '--dry-run') {
    const urlIndex = args.indexOf('--urls');
    const filename = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
    if (!filename) throw new Error('Usage: browser-pull.ts --dry-run --urls <jsonl|txt>');
    const targets = await readUrlTargets(filename);
    console.log(`DRY-RUN\tsites=${targets.length}\tinput=${filename}`);
    await runBrowserTargets(targets, 'dry-run');
    return;
  }
  await runServerMode();
}

void main().catch((error: unknown) => {
  console.error(`browser-pull failed: ${(error as Error).message}`);
  process.exitCode = 0;
});

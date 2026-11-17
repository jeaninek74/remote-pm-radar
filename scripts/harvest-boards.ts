import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  extractBoardSlug,
  HARVEST_ATS,
  type BoardCandidateInput,
  type HarvestAts,
} from '../server/engine/harvest';

const INDEX_HOST = 'https://index.commoncrawl.org';
const HARVEST_AUDIENCE = 'remote-pm-radar-board-harvest';
const REQUEST_PACE_MS = 1_000;
const MAX_ATTEMPTS = 5;
const PAGE_SIZE = 2_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const HOST_PATTERNS: Record<HarvestAts, string[]> = {
  lever: ['jobs.lever.co/*'],
  greenhouse: ['boards.greenhouse.io/*', 'job-boards.greenhouse.io/*'],
  ashby: ['jobs.ashbyhq.com/*'],
  workable: ['apply.workable.com/*'],
  smartrecruiters: ['jobs.smartrecruiters.com/*', 'careers.smartrecruiters.com/*'],
  recruitee: ['*.recruitee.com/*'],
};

interface CrawlInfo {
  id: string;
  time?: string;
  'cdx-api'?: string;
}

interface HarvestOptions {
  dry: boolean;
  crawlCount: number;
  ats: HarvestAts[];
  outputPath?: string;
}

let lastRequestAt = 0;

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const assignment = args.find((arg) => arg.startsWith(prefix));
  if (assignment) return assignment.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseOptions(args: string[]): HarvestOptions {
  const rawCrawlCount = optionValue(args, 'crawls');
  const crawlCount = rawCrawlCount === undefined ? 3 : Number(rawCrawlCount);
  if (!Number.isInteger(crawlCount) || crawlCount < 1) {
    throw new Error('--crawls must be a positive integer');
  }
  const rawAts = optionValue(args, 'ats');
  const ats = rawAts
    ? rawAts.split(',').map((value) => value.trim().toLowerCase())
    : [...HARVEST_ATS];
  if (!ats.length || ats.some((value) => !(HARVEST_ATS as readonly string[]).includes(value))) {
    throw new Error(`--ats must contain supported values: ${HARVEST_ATS.join(', ')}`);
  }
  return {
    dry: args.includes('--dry'),
    crawlCount,
    ats: [...new Set(ats)] as HarvestAts[],
    outputPath: optionValue(args, 'output'),
  };
}

async function paceRequest(): Promise<void> {
  const delay = lastRequestAt + REQUEST_PACE_MS - Date.now();
  if (delay > 0) await sleep(delay);
  lastRequestAt = Date.now();
}

async function fetchTextWithRetry(url: string): Promise<{ status: number; text: string }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await paceRequest();
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'remote-pm-radar board discovery' },
        signal: AbortSignal.timeout(45_000),
      });
      text = await response.text();
    } catch (error) {
      lastError = error as Error;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(1_000 * (2 ** attempt));
      continue;
    }
    if (response.ok || response.status === 404) {
      return { status: response.status, text };
    }
    lastError = new Error(`Common Crawl index returned HTTP ${response.status}`);
    if (response.status < 500 && response.status !== 429) throw lastError;
    if (attempt < MAX_ATTEMPTS - 1) await sleep(1_000 * (2 ** attempt));
  }
  throw lastError ?? new Error('Common Crawl request failed');
}

function indexApi(crawl: CrawlInfo): string {
  const value = crawl['cdx-api'] ?? `${INDEX_HOST}/${crawl.id}-index`;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'index.commoncrawl.org') {
    throw new Error(`Unexpected Common Crawl index URL for ${crawl.id}`);
  }
  return url.toString().replace(/\/$/, '');
}

function indexQuery(index: string, pattern: string, page?: number, showNumPages = false): string {
  const url = new URL(index);
  url.searchParams.set('url', pattern);
  url.searchParams.set('output', 'json');
  if (page !== undefined) {
    url.searchParams.set('fl', 'url');
    url.searchParams.set('page', String(page));
  } else if (showNumPages) {
    url.searchParams.set('showNumPages', 'true');
  }
  return url.toString();
}

function pageCount(response: { status: number; text: string }): number {
  if (response.status === 404 || !response.text.trim()) return 0;
  const body = response.text.trim();
  const direct = Number(body);
  if (Number.isInteger(direct) && direct >= 0) return direct;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0) return parsed;
    if (parsed && typeof parsed === 'object') {
      const object = parsed as Record<string, unknown>;
      for (const key of ['pages', 'numPages', 'pageCount', 'totalPages']) {
        const count = object[key];
        if (typeof count === 'number' && Number.isInteger(count) && count >= 0) return count;
      }
    }
  } catch {
    // A malformed page-count response is reported below with the response sample.
  }
  throw new Error(`Could not read Common Crawl page count: ${body.slice(0, 200)}`);
}

function urlsFromPage(body: string): string[] {
  const urls: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === 'string') urls.push(value);
      else if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).url === 'string') {
        urls.push((value as Record<string, string>).url);
      }
    } catch {
      if (/^https?:\/\//i.test(line)) urls.push(line.trim());
    }
  }
  return urls;
}

async function latestCrawls(count: number): Promise<CrawlInfo[]> {
  const response = await fetchTextWithRetry(`${INDEX_HOST}/collinfo.json`);
  if (response.status !== 200) throw new Error(`Common Crawl collection list returned HTTP ${response.status}`);
  const body: unknown = JSON.parse(response.text);
  if (!Array.isArray(body)) throw new Error('Common Crawl collection list was not an array');
  const crawls = body.filter((item): item is CrawlInfo =>
    item !== null && typeof item === 'object' && typeof (item as CrawlInfo).id === 'string',
  );
  crawls.sort((left, right) => {
    const a = Date.parse(left.time ?? '');
    const b = Date.parse(right.time ?? '');
    return Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
  });
  return crawls.slice(0, count);
}

async function crawlPattern(
  crawl: CrawlInfo,
  ats: HarvestAts,
  pattern: string,
  candidates: Map<string, BoardCandidateInput>,
): Promise<void> {
  const index = indexApi(crawl);
  const countResponse = await fetchTextWithRetry(indexQuery(index, pattern, undefined, true));
  const count = pageCount(countResponse);
  console.log(`${crawl.id} ${ats} ${pattern}: ${count} pages`);
  for (let page = 0; page < count; page += 1) {
    const response = await fetchTextWithRetry(indexQuery(index, pattern, page));
    if (response.status === 404) continue;
    for (const url of urlsFromPage(response.text)) {
      const candidate = extractBoardSlug(url);
      if (!candidate || candidate.ats !== ats) continue;
      const key = `${candidate.ats}:${candidate.slug}`;
      if (!candidates.has(key)) {
        candidates.set(key, {
          ...candidate,
          source: `${crawl.id}:${new URL(url).hostname.toLowerCase()}`,
        });
      }
    }
  }
}

function reportCandidates(candidates: BoardCandidateInput[]): void {
  for (const ats of HARVEST_ATS) {
    const rows = candidates.filter((candidate) => candidate.ats === ats);
    console.log(`${ats}: ${rows.length} unique slugs`);
    for (const row of rows.slice(0, 10)) console.log(`  ${row.slug} (${row.source})`);
  }
}

async function oidcAuthorization(): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub Actions OIDC token request is unavailable');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', HARVEST_AUDIENCE);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: HTTP ${response.status}`);
  const payload = await response.json() as { value?: unknown };
  if (typeof payload.value !== 'string' || !payload.value) {
    throw new Error('GitHub OIDC token response did not include a token');
  }
  return `Bearer ${payload.value}`;
}

async function postCandidates(candidates: BoardCandidateInput[]): Promise<void> {
  const radarUrl = (process.env.RADAR_URL ?? 'https://remote-pm-radar.onrender.com').replace(/\/+$/, '');
  const authorization = await oidcAuthorization();
  let inserted = 0;
  for (let offset = 0; offset < candidates.length; offset += PAGE_SIZE) {
    const batch = candidates.slice(offset, offset + PAGE_SIZE);
    const response = await fetch(`${radarUrl}/api/board-candidates`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: batch }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Board candidate endpoint returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    const result = JSON.parse(text) as { inserted?: unknown };
    if (typeof result.inserted === 'number') inserted += result.inserted;
    console.log(`posted ${offset + batch.length}/${candidates.length}: ${batch.length} received`);
  }
  console.log(`endpoint inserted ${inserted} new board candidates`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const crawls = await latestCrawls(options.crawlCount);
  if (!crawls.length) throw new Error('Common Crawl returned no collections');
  console.log(`Scanning ${crawls.length} crawls: ${crawls.map((crawl) => crawl.id).join(', ')}`);

  const candidates = new Map<string, BoardCandidateInput>();
  const scanFailures: string[] = [];
  for (const crawl of crawls) {
    for (const ats of options.ats) {
      for (const pattern of HOST_PATTERNS[ats]) {
        try {
          await crawlPattern(crawl, ats, pattern, candidates);
        } catch (error) {
          const message = (error as Error).message;
          scanFailures.push(`${crawl.id} ${ats} ${pattern}: ${message}`);
          console.error(`[harvest] scan failed after retries (${crawl.id} ${ats} ${pattern}): ${message}`);
        }
      }
    }
  }

  const results = [...candidates.values()];
  if (scanFailures.length) {
    console.warn(`[harvest] continuing with partial results after ${scanFailures.length} scan failure(s)`);
  }
  reportCandidates(results);
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      crawls: crawls.map((crawl) => crawl.id),
      counts: Object.fromEntries(HARVEST_ATS.map((ats) => [
        ats,
        results.filter((candidate) => candidate.ats === ats).length,
      ])),
      candidates: results,
    }, null, 2)}\n`);
    console.log(`wrote candidate snapshot to ${outputPath}`);
  }
  if (options.dry) {
    console.log(`dry run: ${results.length} unique candidates; no POST made`);
    return;
  }
  await postCandidates(results);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

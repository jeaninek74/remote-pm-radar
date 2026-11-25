import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { readGzipLines } from '../server/engine/wdc-stream';
import {
  filterWebsiteCandidates,
  resolveWdcPostingPages,
  mergeWdcAggregates,
  resolveWebsite,
  WdcAggregator,
  type CareersSiteInput,
  type ExpansionResult,
  type WebsiteCandidate,
  type WebsiteCandidateFilterCounts,
  type WdcDomainAggregate,
} from '../server/engine/website';
import {
  collectHttpsFallbackMetrics,
  getHttpsFallbackMetrics,
  resetHttpsFallbackMetrics,
} from '../server/engine/http';

const WDC_BASE_URL = 'https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/JobPosting';
const CAREERS_SITES_AUDIENCE = 'remote-pm-radar-careers-sites';
const CACHE_VERSION = 'wdc-jobposting-2024-12-v3';
const SOURCE = 'Web Data Commons JobPosting 2024-12';
const REQUEST_PACE_MS = 200;
const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const retryDelay = (attempt: number) => Math.min(2_000 * (2 ** attempt), 30_000);

interface HarvestOptions {
  dry: boolean;
  parts: number[];
  partsExplicit: boolean;
  minutes: number;
  outputPath?: string;
}

interface CandidateCache {
  version: string;
  counts: WebsiteCandidateFilterCounts;
  candidates: WebsiteCandidate[];
}

interface CareersSiteRecord extends CareersSiteInput {
  result: Exclude<ExpansionResult, { kind: 'skipped' }>;
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
  const rawParts = optionValue(args, 'parts');
  const parts = rawParts === undefined
    ? Array.from({ length: 14 }, (_value, index) => index)
    : rawParts.split(',').map((value) => Number(value.trim()));
  if (!parts.length || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 13)) {
    throw new Error('--parts must be a comma-separated list of integers from 0 through 13');
  }
  const rawMinutes = optionValue(args, 'minutes');
  const minutes = rawMinutes === undefined ? 300 : Number(rawMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('--minutes must be a positive number');
  }
  return {
    dry: args.includes('--dry'),
    parts: [...new Set(parts)],
    partsExplicit: rawParts !== undefined,
    minutes,
    outputPath: optionValue(args, 'output'),
  };
}

async function paceRequest(): Promise<void> {
  const delay = lastRequestAt + REQUEST_PACE_MS - Date.now();
  if (delay > 0) await sleep(delay);
  lastRequestAt = Date.now();
}

async function readWdcPart(part: number): Promise<WdcDomainAggregate[]> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let source: Readable | undefined;
    try {
      await paceRequest();
      const response = await fetch(`${WDC_BASE_URL}/part_${part}.gz`, {
        headers: { 'User-Agent': 'remote-pm-radar careers-site discovery' },
        signal: AbortSignal.timeout(55 * 60_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`WDC part ${part} returned HTTP ${response.status}`);
      }
      if (!response.body) throw new Error(`WDC part ${part} had no response body`);
      source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>);
      const aggregator = new WdcAggregator();
      const lineCount = await readGzipLines(source, (line) => aggregator.addLine(line));
      const aggregates = aggregator.finish();
      console.log(`[careers-sites] part ${part}: read ${lineCount.toLocaleString()} quads, ${aggregates.length.toLocaleString()} domains`);
      return aggregates;
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = retryDelay(attempt);
        console.warn(`[careers-sites] part ${part} failed (${lastError.message}); retrying in ${delay / 1000}s`);
        await sleep(delay);
      }
    } finally {
      if (source && !source.destroyed) source.destroy();
    }
  }
  throw lastError ?? new Error(`Could not read WDC part ${part}`);
}

function isCandidateCache(value: unknown): value is CandidateCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cache = value as Record<string, unknown>;
  return cache.version === CACHE_VERSION
    && !!cache.counts
    && typeof cache.counts === 'object'
    && Array.isArray(cache.candidates);
}

async function readCandidateCache(cachePath: string): Promise<CandidateCache | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, 'utf8'));
    return isCandidateCache(parsed) ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[careers-sites] could not read candidate cache: ${(error as Error).message}`);
    }
    return null;
  }
}

async function buildCandidateCache(parts: number[], cachePath?: string): Promise<CandidateCache> {
  const aggregates = new Map<string, WdcDomainAggregate>();
  for (const part of parts) mergeWdcAggregates(aggregates, await readWdcPart(part));
  const filtered = filterWebsiteCandidates([...aggregates.values()]);
  const cache: CandidateCache = {
    version: CACHE_VERSION,
    counts: filtered.counts,
    candidates: filtered.candidates,
  };
  if (cachePath) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache)}\n`, 'utf8');
    console.log(`[careers-sites] cached ${cache.candidates.length.toLocaleString()} filtered candidates at ${cachePath}`);
  }
  return cache;
}

function reportCandidateCounts(counts: WebsiteCandidateFilterCounts): void {
  console.log(`[careers-sites] domains parsed: ${counts.inputDomains.toLocaleString()}`);
  console.log(`[careers-sites] after JobPosting-page filter: ${counts.withJobPostingPages.toLocaleString()}`);
  console.log(`[careers-sites] after <=2 organization names: ${counts.afterOrganizationLimit.toLocaleString()}`);
  console.log(`[careers-sites] after US/telecommute filter: ${counts.afterCountryFilter.toLocaleString()}`);
  console.log(`[careers-sites] after country-code TLD filter: ${counts.afterCountryCodeFilter.toLocaleString()}`);
  console.log(`[careers-sites] after ATS/board-domain filter: ${counts.afterDomainFilter.toLocaleString()}`);
  console.log(`[careers-sites] after template-organization filter: ${counts.afterTemplateFilter.toLocaleString()}`
    + ` (${counts.templateOrganizationNames} template names, ${counts.domainNameFallbacks} domain-name fallbacks)`);
}

async function oidcAuthorization(): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub Actions OIDC token request is unavailable');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', CAREERS_SITES_AUDIENCE);
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

async function apiRequest(url: string, init: RequestInit): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await paceRequest();
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
      continue;
    }
    if (response.ok) return response;
    const text = await response.text();
    lastError = new Error(`Careers sites API returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    if (response.status < 500 && response.status !== 429) throw lastError;
    if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
  }
  throw lastError ?? new Error('Careers sites API request failed');
}

async function knownDomains(radarUrl: string): Promise<Set<string>> {
  const authorization = await oidcAuthorization();
  const response = await apiRequest(`${radarUrl}/api/careers-sites/known`, {
    headers: { Authorization: authorization },
  });
  const payload: unknown = await response.json();
  if (
    !payload
    || typeof payload !== 'object'
    || !Array.isArray((payload as Record<string, unknown>).domains)
    || !(payload as { domains: unknown[] }).domains.every((domain) => typeof domain === 'string')
  ) {
    throw new Error('Careers sites known endpoint returned an invalid domain list');
  }
  return new Set((payload as { domains: string[] }).domains);
}

async function postBatch(radarUrl: string, records: CareersSiteRecord[]): Promise<void> {
  const authorization = await oidcAuthorization();
  const response = await apiRequest(`${radarUrl}/api/careers-sites`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ results: records }),
  });
  const text = await response.text();
  const payload = JSON.parse(text) as { counts?: Record<string, number> };
  console.log(`[careers-sites] posted ${records.length} records: ${JSON.stringify(payload.counts ?? {})}`);
}

function reportResults(counts: { careersWithPostings: number; board: number; unknownOrUnreadable: number }): void {
  console.log(`[careers-sites] careers with postings: ${counts.careersWithPostings}`);
  console.log(`[careers-sites] board results: ${counts.board}`);
  console.log(`[careers-sites] unknown/unreadable results: ${counts.unknownOrUnreadable}`);
}

async function main(): Promise<void> {
  resetHttpsFallbackMetrics();
  const options = parseOptions(process.argv.slice(2));
  const cachePath = path.resolve(
    process.env.WDC_CANDIDATES_CACHE_PATH ?? 'wdc-jobposting-2024-12-candidates.json',
  );
  const restoredCache = !options.partsExplicit ? await readCandidateCache(cachePath) : null;
  let cache = restoredCache;
  if (!cache) {
    cache = await buildCandidateCache(options.parts, options.partsExplicit ? undefined : cachePath);
  }
  const candidates = cache.candidates;
  const filterCounts = cache.counts;
  if (restoredCache) {
    console.log(`[careers-sites] restored candidate cache ${cachePath}`);
  } else if (!options.partsExplicit) {
    console.log('[careers-sites] parsed and filtered WDC dataset');
  }
  reportCandidateCounts(filterCounts);

  const radarUrl = (process.env.RADAR_URL ?? 'https://remote-pm-radar.onrender.com').replace(/\/+$/, '');
  const known = options.dry ? new Set<string>() : await knownDomains(radarUrl);
  const pending = candidates.filter((candidate) => !known.has(candidate.domain));
  const deadline = Date.now() + options.minutes * 60_000;
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : undefined;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, '', 'utf8');
  }
  console.log(`[careers-sites] candidates ${candidates.length}; known-domain skips ${candidates.length - pending.length};`
    + ` live-resolution budget ${options.minutes} minutes${options.dry ? ' (dry)' : ''}`);

  const resultCounts = { careersWithPostings: 0, board: 0, unknownOrUnreadable: 0 };
  const reasonCounts = new Map<string, number>();
  let postingPageFallbacks = 0;
  let sitesRead = 0;
  let nextCandidate = 0;
  let primaryHttpsRetrySites = 0;
  let wdcFallbackHttpsRetrySites = 0;
  const primaryHttpsRetryDomains: string[] = [];
  const wdcFallbackHttpsRetryDomains: string[] = [];
  let appendQueue = Promise.resolve();
  let postQueue = Promise.resolve();
  const postBatchBuffer: CareersSiteRecord[] = [];
  const appendRecord = (record: CareersSiteRecord): Promise<void> => {
    if (!outputPath) return Promise.resolve();
    appendQueue = appendQueue.then(() => appendFile(outputPath, `${JSON.stringify(record)}\n`, 'utf8'));
    return appendQueue;
  };
  const enqueueBatch = (records: CareersSiteRecord[]): Promise<void> => {
    postQueue = postQueue.then(() => postBatch(radarUrl, records));
    return postQueue;
  };
  const deliverResult = async (record: CareersSiteRecord): Promise<void> => {
    if (record.result.kind === 'careers' && record.result.postings > 0) resultCounts.careersWithPostings += 1;
    else if (record.result.kind === 'board') resultCounts.board += 1;
    else if (record.result.kind === 'unknown' || record.result.kind === 'unreadable') resultCounts.unknownOrUnreadable += 1;
    if (record.result.kind === 'unknown') {
      const reason = record.result.reason.replace(/\s+/g, ' ').slice(0, 140);
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    } else if (record.result.kind === 'unreadable') {
      const reason = `unreadable: ${record.result.platform}${record.result.reason ? ` (${record.result.reason})` : ''}`;
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    await appendRecord(record);
    if (!options.dry) {
      postBatchBuffer.push(record);
      if (postBatchBuffer.length >= 50) {
        const batch = postBatchBuffer.splice(0, 50);
        await enqueueBatch(batch);
      }
    }
  };

  const worker = async () => {
    while (Date.now() < deadline) {
      const candidateIndex = nextCandidate;
      nextCandidate += 1;
      if (candidateIndex >= pending.length) return;
      const candidate = pending[candidateIndex];
      sitesRead += 1;
      let result: ExpansionResult;
      const siteDeadline = Date.now() + 60_000;
      try {
        const primary = await collectHttpsFallbackMetrics(() => resolveWebsite(
          candidate.name,
          `https://${candidate.domain}/`,
          siteDeadline,
        ));
        result = primary.value;
        if (primary.metrics.recoveries > 0) {
          primaryHttpsRetrySites += 1;
          primaryHttpsRetryDomains.push(candidate.domain);
        }
        if (result.kind === 'unknown' || result.kind === 'unreadable') {
          const wdcFallback = await collectHttpsFallbackMetrics(() => resolveWdcPostingPages(
            candidate.name,
            candidate.domain,
            candidate.pageUrls,
            siteDeadline,
          ));
          const fallback = wdcFallback.value;
          if (wdcFallback.metrics.recoveries > 0) {
            wdcFallbackHttpsRetrySites += 1;
            wdcFallbackHttpsRetryDomains.push(candidate.domain);
          }
          if (fallback) {
            result = fallback;
            postingPageFallbacks += 1;
          }
        }
      } catch (error) {
        result = { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) };
      }
      const record: CareersSiteRecord = {
        domain: candidate.domain,
        name: candidate.name,
        source: SOURCE,
        result: result.kind === 'skipped'
          ? { kind: 'unknown', reason: result.reason }
          : result,
      };
      await deliverResult(record);
    }
  };
  await Promise.all(Array.from({ length: 16 }, () => worker()));
  if (postBatchBuffer.length && !options.dry) {
    await enqueueBatch(postBatchBuffer.splice(0, postBatchBuffer.length));
  }
  await appendQueue;
  await postQueue;

  console.log(`[careers-sites] sites read: ${sitesRead}; remaining before deadline: ${pending.length - sitesRead}`);
  reportResults(resultCounts);
  console.log(`[careers-sites] WDC posting-page fallback results: ${postingPageFallbacks}`);
  const httpsFallbackMetrics = getHttpsFallbackMetrics();
  console.log(`[careers-sites] node:https retries: ${httpsFallbackMetrics.attempts} attempted, ${httpsFallbackMetrics.recoveries} recovered`);
  console.log(`[careers-sites] candidates with HTTPS retry recovery: ${primaryHttpsRetrySites} primary, ${wdcFallbackHttpsRetrySites} WDC fallback`);
  console.log(`[careers-sites] HTTPS-recovered domains: ${JSON.stringify({ primary: primaryHttpsRetryDomains, wdcFallback: wdcFallbackHttpsRetryDomains })}`);
  console.log(`[careers-sites] result counts by reason: ${JSON.stringify(Object.fromEntries([...reasonCounts].sort(([a], [b]) => a.localeCompare(b))))}`);
  if (outputPath) console.log(`[careers-sites] wrote live-resolution results to ${outputPath}`);
  if (options.dry) console.log('[careers-sites] dry run: skipped known-domain GET and all POST requests');
}

void main().catch((error) => {
  console.error(`[careers-sites] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

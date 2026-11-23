import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import {
  blocksForPrefix,
  extractBoardSlug,
  HARVEST_ATS,
  surtPrefix,
  type BoardCandidateInput,
  type ClusterIndexEntry,
  type HarvestAts,
} from '../server/engine/harvest';

const INDEX_HOST = 'https://index.commoncrawl.org';
const DATA_HOST = 'https://data.commoncrawl.org';
const COLLECTIONS_PATH = '/cc-index/collections';
const HARVEST_AUDIENCE = 'remote-pm-radar-board-harvest';
const REQUEST_PACE_MS = 200;
const MAX_ATTEMPTS = 5;
const PAGE_SIZE = 2_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const gunzipAsync = promisify(gunzip);
const retryDelay = (attempt: number) => Math.min(2_000 * (2 ** attempt), 30_000);

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
  const crawlCount = rawCrawlCount === undefined ? 6 : Number(rawCrawlCount);
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
        signal: AbortSignal.timeout(120_000),
      });
      text = await response.text();
    } catch (error) {
      lastError = error as Error;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(retryDelay(attempt));
      continue;
    }
    if (response.ok || response.status === 404) {
      return { status: response.status, text };
    }
    lastError = new Error(`Common Crawl index returned HTTP ${response.status}`);
    if (response.status < 500 && response.status !== 429) throw lastError;
    if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
  }
  throw lastError ?? new Error('Common Crawl request failed');
}

function parseClusterEntry(line: string): ClusterIndexEntry | null {
  const columns = line.split('\t');
  const keyAndTimestamp = columns[0];
  const file = columns[1]?.trim();
  const separator = keyAndTimestamp?.lastIndexOf(' ') ?? -1;
  const key = separator > 0 ? keyAndTimestamp.slice(0, separator) : '';
  const offset = Number(columns[2]);
  const length = Number(columns[3]);
  if (
    !key
    || !file
    || !Number.isSafeInteger(offset)
    || offset < 0
    || !Number.isSafeInteger(length)
    || length <= 0
  ) return null;
  return { key, file, offset, length, clusterId: columns[4]?.trim() ?? '' };
}

interface PrefixBlockState {
  prefix: string;
  preceding: ClusterIndexEntry | null;
  matching: ClusterIndexEntry[];
  done: boolean;
}

function uniqueBlocks(entries: ClusterIndexEntry[]): ClusterIndexEntry[] {
  const blocks = new Map<string, ClusterIndexEntry>();
  for (const entry of entries) {
    blocks.set(`${entry.file}:${entry.offset}:${entry.length}`, entry);
  }
  return [...blocks.values()].sort((left, right) =>
    left.file.localeCompare(right.file) || left.offset - right.offset);
}

async function clusterBlocks(crawlId: string, prefixes: string[]): Promise<ClusterIndexEntry[]> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await paceRequest();
    let bodyStream: Readable | undefined;
    let lines: ReturnType<typeof createInterface> | undefined;
    try {
      const response = await fetch(
        `${DATA_HOST}${COLLECTIONS_PATH}/${encodeURIComponent(crawlId)}/indexes/cluster.idx`,
        {
          headers: { 'User-Agent': 'remote-pm-radar board discovery' },
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Common Crawl cluster index returned HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Common Crawl cluster index had no response body');
      bodyStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>);
      lines = createInterface({ input: bodyStream, crlfDelay: Infinity });
      const states: PrefixBlockState[] = prefixes.map((prefix) => ({
        prefix,
        preceding: null,
        matching: [],
        done: false,
      }));
      for await (const line of lines) {
        const entry = parseClusterEntry(line);
        if (!entry) continue;
        for (const state of states) {
          if (state.done) continue;
          if (entry.key < state.prefix) {
            state.preceding = entry;
          } else if (entry.key.startsWith(state.prefix)) {
            state.matching.push(entry);
          } else {
            state.done = true;
          }
        }
      }
      return uniqueBlocks(states.flatMap((state) => blocksForPrefix(
        [...(state.preceding ? [state.preceding] : []), ...state.matching],
        state.prefix,
      )));
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
    } finally {
      lines?.close();
      bodyStream?.destroy();
    }
  }
  throw lastError ?? new Error(`Could not read Common Crawl cluster index for ${crawlId}`);
}

async function fetchClusterBlock(crawlId: string, entry: ClusterIndexEntry): Promise<Buffer> {
  const collectionUrl = `${DATA_HOST}${COLLECTIONS_PATH}/${encodeURIComponent(crawlId)}/`;
  const file = entry.file.replace(/^\/+/, '');
  const relativePath = file.startsWith('indexes/') ? file : `indexes/${file}`;
  const url = new URL(relativePath, collectionUrl).toString();
  const rangeEnd = entry.offset + entry.length - 1;
  if (!Number.isSafeInteger(rangeEnd)) throw new Error('Common Crawl range exceeds safe integer bounds');
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await paceRequest();
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'remote-pm-radar board discovery',
          Range: `bytes=${entry.offset}-${rangeEnd}`,
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error(`Common Crawl range returned HTTP ${response.status}`);
      }
      const compressed = Buffer.from(await response.arrayBuffer());
      if (compressed.length !== entry.length) {
        throw new Error(`Common Crawl range returned ${compressed.length} bytes; expected ${entry.length}`);
      }
      return await gunzipAsync(compressed);
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
    }
  }
  throw lastError ?? new Error('Common Crawl range request failed');
}

function collectCandidatesFromBlock(
  crawlId: string,
  body: Buffer,
  prefixes: string[],
  candidates: Map<string, BoardCandidateInput>,
): void {
  for (const line of body.toString('utf8').split(/\r?\n/)) {
    const firstSpace = line.indexOf(' ');
    const secondSpace = line.indexOf(' ', firstSpace + 1);
    if (firstSpace <= 0 || secondSpace < 0) continue;
    const surt = line.slice(0, firstSpace);
    if (!prefixes.some((prefix) => surt.startsWith(prefix))) continue;
    let record: unknown;
    try {
      record = JSON.parse(line.slice(secondSpace + 1));
    } catch {
      continue;
    }
    const url = record && typeof record === 'object'
      ? (record as Record<string, unknown>).url
      : null;
    if (typeof url !== 'string') continue;
    const candidate = extractBoardSlug(url);
    if (!candidate) continue;
    const key = `${candidate.ats}:${candidate.slug}`;
    if (!candidates.has(key)) {
      candidates.set(key, {
        ...candidate,
        source: `${crawlId}:${new URL(url).hostname.toLowerCase()}`,
      });
    }
  }
}

async function latestCrawls(count: number): Promise<CrawlInfo[]> {
  try {
    const response = await fetchTextWithRetry(`${INDEX_HOST}/collinfo.json`);
    if (response.status !== 200) throw new Error(`Common Crawl collection list returned HTTP ${response.status}`);
    const body: unknown = JSON.parse(response.text);
    if (!Array.isArray(body)) throw new Error('Common Crawl collection list was not an array');
    const crawls = body.filter((item): item is CrawlInfo =>
      item !== null && typeof item === 'object' && typeof (item as CrawlInfo).id === 'string',
    );
    if (!crawls.length) throw new Error('Common Crawl collection list was empty');
    crawls.sort((left, right) => {
      const a = Date.parse(left.time ?? '');
      const b = Date.parse(right.time ?? '');
      return Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
    });
    return crawls.slice(0, count);
  } catch (error) {
    console.warn(`[harvest] collinfo.json failed; falling back to collections index: ${(error as Error).message}`);
  }
  const response = await fetchTextWithRetry(`${DATA_HOST}${COLLECTIONS_PATH}/index.html`);
  if (response.status !== 200) throw new Error(`Common Crawl collections index returned HTTP ${response.status}`);
  const crawlIds = [...new Set(response.text.match(/CC-MAIN-\d{4}-\d{2}/g) ?? [])]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, count);
  if (!crawlIds.length) throw new Error('Common Crawl collections index contained no crawl ids');
  return crawlIds.map((id) => ({ id }));
}

async function scanCrawl(
  crawlId: string,
  patterns: string[],
  candidates: Map<string, BoardCandidateInput>,
  scanFailures: string[],
): Promise<void> {
  const prefixes = [...new Set(patterns.map(surtPrefix).filter((prefix): prefix is string => prefix !== null))];
  let blocks: ClusterIndexEntry[];
  try {
    blocks = await clusterBlocks(crawlId, prefixes);
  } catch (error) {
    const message = (error as Error).message;
    scanFailures.push(`${crawlId} cluster.idx: ${message}`);
    console.error(`[harvest] cluster index failed after retries (${crawlId}): ${message}`);
    return;
  }
  console.log(`${crawlId}: ${blocks.length} overlapping range blocks for ${prefixes.length} SURT prefixes`);
  for (const block of blocks) {
    try {
      const body = await fetchClusterBlock(crawlId, block);
      collectCandidatesFromBlock(crawlId, body, prefixes, candidates);
    } catch (error) {
      const message = (error as Error).message;
      scanFailures.push(`${crawlId} ${block.file} bytes=${block.offset}-${block.offset + block.length - 1}: ${message}`);
      console.error(`[harvest] range scan failed after retries (${crawlId} ${block.file} ${block.offset}+${block.length}): ${message}`);
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
  const startedAt = Date.now();
  const options = parseOptions(process.argv.slice(2));
  const crawls = await latestCrawls(options.crawlCount);
  if (!crawls.length) throw new Error('Common Crawl returned no collections');
  console.log(`Scanning ${crawls.length} crawls: ${crawls.map((crawl) => crawl.id).join(', ')}`);

  const candidates = new Map<string, BoardCandidateInput>();
  const scanFailures: string[] = [];
  const patterns = options.ats.flatMap((ats) => HOST_PATTERNS[ats]);
  for (const crawl of crawls) {
    await scanCrawl(crawl.id, patterns, candidates, scanFailures);
  }

  const results = [...candidates.values()];
  console.log(`[harvest] scan failures ${scanFailures.length}`);
  if (scanFailures.length) {
    console.warn(`[harvest] continuing with partial results after ${scanFailures.length} scan failure(s)`);
    process.exitCode = 1;
  }
  reportCandidates(results);
  console.log(`[harvest] wall time ${((Date.now() - startedAt) / 1000).toFixed(1)} seconds`);
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

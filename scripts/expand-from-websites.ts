import { appendFile, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import {
  sameCareersPostingSet,
  type CareersPostingIdentity,
} from '../server/engine/careers';
import { isNonEmployerBoard } from '../server/engine/harvest';
import {
  canonicalCareersUrl,
  careersSlug,
  normalizedCareersUrl,
  resolveWebsite,
  type ExpansionResult,
} from '../server/engine/website';
import { isAlreadyWrittenResult, matchesRetryResult } from './expansion-retry';

interface WebsiteEmployer {
  name: string;
  website: string;
  state: string;
  industry: string;
  size: string;
  source: string;
}

interface ExpansionRecord {
  name: string;
  state: string;
  source: string;
  result: ExpansionResult;
}

const OUTPUT_FILE = '/home/ubuntu/expansion-results.jsonl';
const DRY_RUN_OUTPUT_FILE = '/home/ubuntu/expansion-results-dry-run.jsonl';
const NEON_URI_ENDPOINT =
  'https://console.neon.tech/api/v2/projects/still-cell-79180440/connection_uri' +
  '?branch_id=br-withered-wildflower-ar6s3tkz&database_name=neondb&role_name=neondb_owner&pooled=true';

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
}

async function loadOutput(path: string): Promise<ExpansionRecord[]> {
  try {
    const contents = await readFile(path, 'utf8');
    return contents.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line) as ExpansionRecord;
      } catch {
        throw new Error(`invalid JSON on line ${index + 1} of ${path}`);
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) throw new Error('NEON_API_KEY is required when DATABASE_URL is not set');
  const response = await fetch(NEON_URI_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Neon connection URI request failed: HTTP ${response.status}`);
  const data = await response.json() as { uri?: string };
  if (!data.uri) throw new Error('Neon did not return a connection URI');
  return data.uri;
}

async function readExistingNames(pool: Pool, normalizedNames: string[]): Promise<Set<string>> {
  if (!normalizedNames.length) return new Set();
  const rows = await pool.query<{ normalized_name: string }>(
    `SELECT lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) AS normalized_name
       FROM employers
      WHERE lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) = ANY($1::text[])`,
    [normalizedNames],
  );
  return new Set(rows.rows.map((row) => row.normalized_name));
}

async function readExistingCareersUrls(pool: Pool): Promise<Set<string>> {
  const rows = await pool.query<{ careers_url: string }>(
    'SELECT careers_url FROM employers WHERE careers_url IS NOT NULL',
  );
  const urls = new Set<string>();
  for (const row of rows.rows) {
    try {
      urls.add(normalizedCareersUrl(row.careers_url));
    } catch { /* ignore malformed stored URLs */ }
  }
  return urls;
}

async function readInputs(paths: string[]): Promise<WebsiteEmployer[]> {
  const entries: WebsiteEmployer[] = [];
  for (const path of paths) {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array`);
    for (const value of parsed) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} contains a non-object entry`);
      }
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.name !== 'string' ||
        typeof entry.website !== 'string' ||
        typeof entry.state !== 'string' ||
        typeof entry.industry !== 'string' ||
        typeof entry.size !== 'string' ||
        typeof entry.source !== 'string'
      ) {
        throw new Error(`${path} contains an entry missing name, website, state, industry, size, or source`);
      }
      entries.push(entry as unknown as WebsiteEmployer);
    }
  }
  return entries;
}

function parseArgs(args: string[]): {
  files: string[];
  limit: number | null;
  write: boolean;
  dryRun: boolean;
  retryPlatform: string | null;
  retryFrom: string[];
  smallestStates: number | null;
  outputFile: string | null;
} {
  const files: string[] = [];
  let limit: number | null = null;
  let write = false;
  let dryRun = false;
  let retryPlatform: string | null = null;
  const retryFrom: string[] = [];
  let smallestStates: number | null = null;
  let outputFile: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--write') {
      write = true;
    } else if (args[index] === '--dry-run') {
      dryRun = true;
    } else if (args[index] === '--retry-platform') {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith('--')) throw new Error('--retry-platform requires a platform name');
      retryPlatform = value;
      index += 1;
    } else if (args[index] === '--retry-from') {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith('--')) throw new Error('--retry-from requires a results JSONL path');
      retryFrom.push(value);
      index += 1;
    } else if (args[index] === '--output') {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith('--')) throw new Error('--output requires a path');
      outputFile = value;
      index += 1;
    } else if (args[index] === '--limit') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--limit requires a positive integer');
      limit = value;
      index += 1;
    } else if (args[index] === '--smallest-states') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--smallest-states requires a positive integer');
      smallestStates = value;
      index += 1;
    } else if (args[index].startsWith('--')) {
      throw new Error(`unknown option: ${args[index]}`);
    } else {
      files.push(args[index]);
    }
  }
  if (dryRun && write) throw new Error('--dry-run cannot be combined with --write');
  if (!files.length) {
    throw new Error('usage: npx tsx scripts/expand-from-websites.ts <input.json> [...] [--limit N] [--smallest-states N] [--retry-platform NAME] [--retry-from results.jsonl] [...] [--dry-run] [--output PATH] [--write]');
  }
  return { files, limit, write, dryRun, retryPlatform, retryFrom, smallestStates, outputFile };
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      await worker(items[current]);
    }
  }));
}

function sampleSmallestStates(entries: WebsiteEmployer[], stateCount: number, limit: number): WebsiteEmployer[] {
  const byState = new Map<string, WebsiteEmployer[]>();
  for (const entry of entries) {
    const bucket = byState.get(entry.state) ?? [];
    bucket.push(entry);
    byState.set(entry.state, bucket);
  }
  const states = [...byState]
    .sort(([stateA, rowsA], [stateB, rowsB]) => rowsA.length - rowsB.length || stateA.localeCompare(stateB))
    .slice(0, stateCount)
    .map(([state]) => state);
  const offsets = new Map(states.map((state) => [state, 0]));
  const selected: WebsiteEmployer[] = [];
  while (selected.length < limit) {
    let added = false;
    for (const state of states) {
      const offset = offsets.get(state) ?? 0;
      const entry = byState.get(state)?.[offset];
      if (!entry) continue;
      selected.push(entry);
      offsets.set(state, offset + 1);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected;
}

function printSummary(entries: WebsiteEmployer[], records: Map<string, ExpansionRecord>, outputFile: string): void {
  const selected = entries.map((entry) => records.get(entry.name)).filter((row): row is ExpansionRecord => Boolean(row));
  const kinds = new Map<string, number>();
  const platforms = new Map<string, number>();
  for (const row of selected) {
    const kind = row.result.kind;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    const platform = row.result.kind === 'board'
      ? row.result.ats
      : row.result.kind === 'unreadable'
        ? row.result.platform
        : row.result.kind === 'careers'
          ? 'manual'
        : row.result.kind === 'skipped'
          ? 'employer already exists'
          : null;
    if (platform) platforms.set(platform, (platforms.get(platform) ?? 0) + 1);
  }
  console.log(`[expand] processed ${selected.length}/${entries.length} entries (${process.argv.includes('--write') ? 'write enabled' : 'dry run'})`);
  console.log(`[expand] kinds: ${[...kinds].map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}`);
  console.log(`[expand] platforms: ${[...platforms].map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}`);
  const hits = selected.filter((row) => row.result.kind === 'board').slice(0, 10);
  console.log('[expand] sample board hits:');
  if (!hits.length) console.log('  (none)');
  for (const row of hits) {
    if (row.result.kind === 'board') console.log(`  ${row.name} | ${row.result.ats} | ${row.result.careersUrl}`);
  }
  const careerHits = selected.filter((row): row is ExpansionRecord & { result: Extract<ExpansionResult, { kind: 'careers' }> } =>
    row.result.kind === 'careers');
  console.log(`[expand] careers fallback: sites=${careerHits.length} postings=${careerHits.reduce((sum, row) => sum + row.result.postings, 0)} matching=${careerHits.reduce((sum, row) => sum + row.result.matching, 0)}`);
  const byState = new Map<string, { sites: number; postings: number; matching: number }>();
  for (const row of careerHits) {
    const counts = byState.get(row.state) ?? { sites: 0, postings: 0, matching: 0 };
    counts.sites += 1;
    counts.postings += row.result.postings;
    counts.matching += row.result.matching;
    byState.set(row.state, counts);
  }
  for (const [state, counts] of [...byState].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`[expand] careers state ${state}: sites=${counts.sites} postings=${counts.postings} matching=${counts.matching}`);
  }
  console.log('[expand] sample careers fallback hits:');
  if (!careerHits.length) console.log('  (none)');
  for (const row of careerHits.slice(0, 10)) {
    console.log(`  ${row.name} | ${row.result.careersUrl} | ${row.result.examplePostingUrl ?? '(posting URL unavailable)'}`);
  }
  console.log(`[expand] results: ${outputFile}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outputFile = options.outputFile
    ?? (options.retryPlatform
      ? `/home/ubuntu/expansion-results-${options.retryPlatform.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-retry${options.write ? '' : '-dry-run'}.jsonl`
      : options.dryRun ? DRY_RUN_OUTPUT_FILE : OUTPUT_FILE);
  const entries = await readInputs(options.files);
  const retryFiles = options.retryFrom.length ? options.retryFrom : options.retryPlatform ? [OUTPUT_FILE] : [];
  const retryRecords = retryFiles.length ? (await Promise.all(retryFiles.map(loadOutput))).flat() : null;
  const retryNames = retryRecords
    ? new Set(retryRecords
      .filter((record) => matchesRetryResult(record.result, options.retryPlatform))
      .map((record) => normalizeName(record.name)))
    : null;
  const eligible = retryNames ? entries.filter((entry) => retryNames.has(normalizeName(entry.name))) : entries;
  const selected = options.smallestStates === null
    ? options.limit == null ? eligible : eligible.slice(0, options.limit)
    : sampleSmallestStates(eligible, options.smallestStates, options.limit ?? eligible.length);
  const oldRecords = await loadOutput(outputFile);
  const records = new Map(oldRecords.map((record) => [record.name, record]));
  const alreadyWritten = new Set([...records.values()]
    .filter((record) => isAlreadyWrittenResult(record.result, retryRecords !== null, options.retryPlatform))
    .map((record) => normalizeName(record.name)));
  const toProcess = selected.filter((entry) => !alreadyWritten.has(normalizeName(entry.name)));
  const normalizedNames = [...new Set(toProcess.map((entry) => normalizeName(entry.name)))];
  const uri = await databaseUrl();
  process.env.PGSSLMODE = 'require';
  const pool = new Pool({
    connectionString: uri,
    max: 4,
    connectionTimeoutMillis: 20_000,
    ssl: { rejectUnauthorized: false },
  });
  let appendQueue = Promise.resolve();
  const appendRecord = (record: ExpansionRecord) => {
    appendQueue = appendQueue.then(() => appendFile(outputFile, `${JSON.stringify(record)}\n`, 'utf8'));
    return appendQueue;
  };

  try {
    const existingNames = await readExistingNames(pool, normalizedNames);
    const existingCareersUrls = options.write && !options.dryRun ? await readExistingCareersUrls(pool) : new Set<string>();
    const claimedCareersUrls = new Set<string>();
    const claimedCareersPostings: { name: string; postingPaths: string[]; postingIdentities?: CareersPostingIdentity[] }[] = [];
    const claimedNames = new Set<string>();
    await mapLimit(toProcess, 12, async (entry) => {
      const normalized = normalizeName(entry.name);
      let result: ExpansionResult;
      if (existingNames.has(normalized)) {
        result = { kind: 'skipped', reason: 'employer with the same normalized name already exists' };
      } else if (claimedNames.has(normalized)) {
        result = { kind: 'skipped', reason: 'duplicate normalized name in the input' };
      } else {
        claimedNames.add(normalized);
        result = await resolveWebsite(entry.name, entry.website, Date.now() + 45_000);
        if (result.kind === 'board' && isNonEmployerBoard(result.ats, result.slug)) {
          result = { kind: 'skipped', reason: 'resolved ATS board is a job aggregator, not an employer board' };
        }
        if (options.write && !options.dryRun && result.kind === 'board') {
          await pool.query(
            `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
             ON CONFLICT (ats, slug) DO NOTHING`,
            [
              entry.name,
              result.ats,
              result.slug,
              entry.industry,
              entry.size,
              entry.state,
              result.careersUrl,
              `Website board resolution (${entry.source})`,
            ],
          );
        } else if (options.write && !options.dryRun && result.kind === 'careers') {
          const careersUrlKey = normalizedCareersUrl(result.careersUrl);
          const postingPaths = result.postingPaths;
          const postingIdentities = result.postingIdentities;
          const samePostings = claimedCareersPostings.find((claimed) =>
            sameCareersPostingSet(claimed.postingPaths, postingPaths, claimed.postingIdentities, postingIdentities));
          if (samePostings) {
            result = { kind: 'skipped', reason: `same postings as ${samePostings.name}` };
          } else if (existingCareersUrls.has(careersUrlKey) || claimedCareersUrls.has(careersUrlKey)) {
            result = { kind: 'skipped', reason: 'careers URL already exists' };
          } else {
            claimedCareersUrls.add(careersUrlKey);
            claimedCareersPostings.push({
              name: entry.name,
              postingPaths: postingPaths ?? [],
              postingIdentities,
            });
            await pool.query(
              `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active)
               VALUES ($1,'manual',$2,$3,$4,$5,$6,$7,TRUE)
               ON CONFLICT (ats, slug) DO NOTHING`,
              [
                entry.name,
                careersSlug(result.careersUrl),
                entry.industry,
                entry.size,
                entry.state,
                result.careersUrl,
                `Website careers-page fallback (${entry.source})`,
              ],
            );
            existingCareersUrls.add(careersUrlKey);
          }
        }
      }
      const record = { name: entry.name, state: entry.state, source: entry.source, result };
      records.set(entry.name, record);
      await appendRecord(record);
    });
    await appendQueue;
  } finally {
    await pool.end();
  }

  printSummary(selected, records, outputFile);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URI]') : String(error);
  console.error(`[expand] ${message}`);
  process.exitCode = 1;
});

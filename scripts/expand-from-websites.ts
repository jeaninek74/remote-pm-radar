import { appendFile, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { resolveBoard, type BoardResolution } from '../server/engine/resolve';

interface WebsiteEmployer {
  name: string;
  website: string;
  state: string;
  industry: string;
  size: string;
  source: string;
}

type ExpansionResult = BoardResolution | { kind: 'skipped'; reason: string };

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
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CAREERS_LINK = /careers?|jobs|employment|join (?:us|our team)|work (?:with|for|at) us|job (?:postings|openings|opportunities)|open positions|current openings|human resources|\bhr\b/i;
const STRONG_CAREERS_LINK = /\b(careers?|jobs? (?:at|with)|job (?:postings|openings|opportunities)|employment(?: opportunities)?|work (?:with|for|at) us|join (?:us|our team)|open positions|current openings|human resources|hr)\b/i;
const EXCLUDED_CAREERS_LINK = /career[\s_-]*(?:services?|ed(?:ucation)?|center|development|readiness|pathways?)|student|alumni|hire[\s-]*a[\s-]*grad|externship|internship program|employee[\s-]*directory/i;
const STAFF_CAREERS_LINK = /\b(staff|faculty|employees?|administrative)\b/i;
const ATS_HOSTS = [
  'myworkdayjobs.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'smartrecruiters.com',
  'oraclecloud.com',
  'dayforcehcm.com',
  'icims.com',
  'phenompeople.com',
  'phenom.com',
  'successfactors.com',
  'jobs.sap.com',
  'avature.net',
  'taleo.net',
  'eightfold.ai',
  'talentbrew.com',
  'tbcdn.com',
  'paradox.ai',
  'ultipro.com',
  'ukg.com',
  'jobvite.com',
  'adp.com',
  'csod.com',
  'rippling.com',
  'entertimeonline.com',
  'peopleadmin.com',
  'governmentjobs.com',
  'schooljobs.com',
  'applitrack.com',
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
}

function normalizeWebsite(website: string): string {
  const value = website.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new Error('website must use http or https');
  return url.toString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function sameSite(url: URL, homepage: URL): boolean {
  const host = url.hostname.toLowerCase();
  const homeHost = homepage.hostname.toLowerCase();
  if (host === homeHost || host.endsWith(`.${homeHost}`) || homeHost.endsWith(`.${host}`)) return true;
  const baseDomain = (value: string) => value.split('.').slice(-2).join('.');
  return baseDomain(host) === baseDomain(homeHost);
}

function isAtsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ATS_HOSTS.some((atsHost) => host === atsHost || host.endsWith(`.${atsHost}`));
}

function sameSiteOrAts(url: URL, homepage: URL): boolean {
  return sameSite(url, homepage) || isAtsHost(url.hostname);
}

async function careersLinks(pageUrl: string, deadline: number): Promise<string[]> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return [];
  try {
    const response = await fetch(pageUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(Math.min(10_000, remaining)),
    });
    const html = await response.text();
    const base = new URL(response.url || pageUrl);
    const anchors = html.matchAll(
      /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    );
    const seen = new Set<string>();
    const links: { url: string; priority: number; order: number }[] = [];
    for (const match of anchors) {
      const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? '').trim();
      const text = decodeHtml((match[4] ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!CAREERS_LINK.test(href) && !CAREERS_LINK.test(text)) continue;
      try {
        const target = new URL(href, base);
        if ((target.protocol === 'https:' || target.protocol === 'http:') && sameSiteOrAts(target, base)) {
          if (
            (EXCLUDED_CAREERS_LINK.test(href) || EXCLUDED_CAREERS_LINK.test(text))
            && !isAtsHost(target.hostname)
            && !STAFF_CAREERS_LINK.test(`${href}\n${text}`)
          ) continue;
          if (target.protocol === 'http:') target.protocol = 'https:';
          const url = target.toString();
          if (seen.has(url)) continue;
          seen.add(url);
          const priority = isAtsHost(target.hostname)
            ? 0
            : STRONG_CAREERS_LINK.test(`${href}\n${text}`) ? 1 : 2;
          links.push({ url, priority, order: links.length });
        }
      } catch {
        continue;
      }
    }
    return links
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((link) => link.url);
  } catch {
    return [];
  }
}

async function resolveWebsite(name: string, website: string, deadline: number): Promise<BoardResolution> {
  let homepage: string;
  try {
    homepage = normalizeWebsite(website);
  } catch (error) {
    return { kind: 'unknown', reason: `invalid website: ${(error as Error).message}` };
  }

  type UnknownResolution = Extract<BoardResolution, { kind: 'unknown' }>;
  let unreadable: Extract<BoardResolution, { kind: 'unreadable' }> | null = null;
  let firstCareersUnknown: UnknownResolution | null = null;
  let homepageUnknown: UnknownResolution | null = null;
  let firstFallbackUnknown: UnknownResolution | null = null;
  let first404: UnknownResolution | null = null;
  const triedUrls = new Set<string>();
  const tryUrl = async (
    url: string,
    source: 'homepage' | 'careers' | 'fallback' = 'careers',
  ): Promise<Extract<BoardResolution, { kind: 'board' }> | null> => {
    if (Date.now() >= deadline) return null;
    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(url).toString();
    } catch {
      return null;
    }
    if (triedUrls.has(normalizedUrl)) return null;
    triedUrls.add(normalizedUrl);
    const result = await resolveBoard(name, url, deadline);
    if (result.kind === 'board') {
      return result;
    }
    if (result.kind === 'unreadable') unreadable ??= result;
    else if (/\bHTTP\s+404\b/i.test(result.reason)) first404 ??= result;
    else if (source === 'homepage') homepageUnknown ??= result;
    else if (source === 'fallback') firstFallbackUnknown ??= result;
    else firstCareersUnknown ??= result;
    return null;
  };

  const homepageResult = await tryUrl(homepage, 'homepage');
  if (homepageResult) return homepageResult;

  const homepageUrl = new URL(homepage);
  const hopPages: string[] = [];
  for (const careersLink of await careersLinks(homepage, deadline)) {
    if (Date.now() >= deadline) break;
    const normalizedUrl = new URL(careersLink).toString();
    const wasTried = triedUrls.has(normalizedUrl);
    const result = await tryUrl(careersLink);
    if (result) return result;
    if (!wasTried && triedUrls.has(normalizedUrl) && sameSite(new URL(careersLink), homepageUrl)) {
      hopPages.push(normalizedUrl);
    }
  }

  for (const pageUrl of hopPages) {
    if (Date.now() >= deadline) break;
    for (const careersLink of await careersLinks(pageUrl, deadline)) {
      if (Date.now() >= deadline) break;
      if (triedUrls.has(new URL(careersLink).toString())) continue;
      const result = await tryUrl(careersLink);
      if (result) return result;
    }
  }

  const origin = new URL(homepage).origin;
  for (const path of ['/careers', '/jobs', '/employment']) {
    const result = await tryUrl(new URL(path, origin).toString(), 'fallback');
    if (result) return result;
  }

  return unreadable
    ?? firstCareersUnknown
    ?? homepageUnknown
    ?? firstFallbackUnknown
    ?? first404
    ?? { kind: 'unknown', reason: 'no supported board found' };
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
  outputFile: string | null;
} {
  const files: string[] = [];
  let limit: number | null = null;
  let write = false;
  let dryRun = false;
  let retryPlatform: string | null = null;
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
    } else if (args[index].startsWith('--')) {
      throw new Error(`unknown option: ${args[index]}`);
    } else {
      files.push(args[index]);
    }
  }
  if (dryRun && write) throw new Error('--dry-run cannot be combined with --write');
  if (!files.length) {
    throw new Error('usage: npx tsx scripts/expand-from-websites.ts <input.json> [...] [--limit N] [--retry-platform NAME] [--dry-run] [--output PATH] [--write]');
  }
  return { files, limit, write, dryRun, retryPlatform, outputFile };
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
  console.log(`[expand] results: ${outputFile}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outputFile = options.outputFile
    ?? (options.retryPlatform
      ? `/home/ubuntu/expansion-results-${options.retryPlatform.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-retry${options.write ? '' : '-dry-run'}.jsonl`
      : options.dryRun ? DRY_RUN_OUTPUT_FILE : OUTPUT_FILE);
  const entries = await readInputs(options.files);
  const retryNames = options.retryPlatform
    ? new Set(
      (await loadOutput(OUTPUT_FILE))
        .filter((record) =>
          record.result.kind === 'unreadable'
          && record.result.platform.toLowerCase() === options.retryPlatform!.toLowerCase(),
        )
        .map((record) => normalizeName(record.name)),
    )
    : null;
  const eligible = retryNames ? entries.filter((entry) => retryNames.has(normalizeName(entry.name))) : entries;
  const selected = options.limit == null ? eligible : eligible.slice(0, options.limit);
  const oldRecords = await loadOutput(outputFile);
  const records = new Map(oldRecords.map((record) => [record.name, record]));
  const alreadyWritten = new Set([...records.keys()].map(normalizeName));
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

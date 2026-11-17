import { readFile } from 'node:fs/promises';
import { mapLimit } from '../server/engine/http';
import {
  fetchBoard,
  parseWorkdayUrl,
  type WorkdayRequestTracker,
} from '../server/engine/sources';
import type { BoardFetchResult, EmployerRow } from '../server/engine/types';
import type { WorkdayPullEmployer, WorkdayIngestPayload } from '../server/engine/workday-pull';

const AUDIENCE = 'remote-pm-radar-workday-pull';
const MAX_POST_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Options {
  dry: boolean;
  employersFile: string | null;
}

interface EmployerOutcome {
  ok: boolean;
  error: string | null;
  jobs: number;
  truncated: boolean;
  closedKeys: number;
  seconds: number;
}

function parseOptions(args: string[]): Options {
  let dry = false;
  let employersFile: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry') {
      dry = true;
    } else if (args[index] === '--employers-file') {
      employersFile = args[index + 1] ?? null;
      if (!employersFile) throw new Error('--employers-file requires a JSONL path');
      index += 1;
    } else {
      throw new Error(`Unknown option: ${args[index]}`);
    }
  }
  return { dry, employersFile };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWorkdayPullEmployer(value: unknown): value is WorkdayPullEmployer {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.id)
    && (value.id as number) > 0
    && value.ats === 'workday'
    && typeof value.slug === 'string'
    && typeof value.name === 'string'
    && (value.careers_url === null || typeof value.careers_url === 'string')
    && typeof value.active === 'boolean'
    && Array.isArray(value.known)
    && value.known.every((key) => typeof key === 'string')
    && Array.isArray(value.stored)
    && value.stored.every((key) => typeof key === 'string');
}

async function readEmployersFile(filename: string): Promise<WorkdayPullEmployer[]> {
  const contents = await readFile(filename, 'utf8');
  return contents.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON on employers-file line ${index + 1}`);
    }
    if (!isWorkdayPullEmployer(value)) {
      throw new Error(`Invalid Workday employer on employers-file line ${index + 1}`);
    }
    return [value];
  });
}

async function authHeader(): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('GitHub OIDC token request is unavailable');
  const url = new URL(requestUrl);
  url.searchParams.set('audience', AUDIENCE);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: HTTP ${response.status}`);
  const payload = await response.json() as { value?: unknown };
  if (typeof payload.value !== 'string' || !payload.value) {
    throw new Error('GitHub OIDC token response did not include a token');
  }
  return `Bearer ${payload.value}`;
}

async function fetchServerEmployers(radarUrl: string): Promise<WorkdayPullEmployer[]> {
  const response = await fetch(`${radarUrl}/api/workday-employers`, {
    headers: { Authorization: await authHeader() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GET /api/workday-employers failed: HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.employers) || !payload.employers.every(isWorkdayPullEmployer)) {
    throw new Error('GET /api/workday-employers returned an invalid employer list');
  }
  return payload.employers;
}

async function postWithRetry(radarUrl: string, payload: WorkdayIngestPayload): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_POST_ATTEMPTS; attempt += 1) {
    const authorization = await authHeader();
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${radarUrl}/api/workday-ingest`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
      });
      text = await response.text();
    } catch (error) {
      lastError = error as Error;
      if (attempt === MAX_POST_ATTEMPTS - 1) break;
      await sleep(1_000 * (2 ** attempt));
      continue;
    }
    if (response.ok) return;
    lastError = new Error(`POST /api/workday-ingest returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    if (response.status < 500 || attempt === MAX_POST_ATTEMPTS - 1) throw lastError;
    await sleep(1_000 * (2 ** attempt));
  }
  throw lastError ?? new Error('Workday ingest POST failed');
}

function asEmployer(employer: WorkdayPullEmployer): EmployerRow {
  const { known: _known, stored: _stored, ...row } = employer;
  return row;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const radarUrl = (process.env.RADAR_URL ?? 'https://remote-pm-radar.onrender.com').replace(/\/+$/, '');
  const employers = options.employersFile
    ? await readEmployersFile(options.employersFile)
    : await fetchServerEmployers(radarUrl);
  const startedAt = Date.now();
  const tracker: WorkdayRequestTracker = { requestCount: 0, rateLimitedRequests: [] };
  let completed = 0;
  console.log(`Workday pull: ${employers.length} employers${options.dry ? ' (dry)' : ''}`);

  const outcomes = await mapLimit(employers, 4, async (entry, index): Promise<EmployerOutcome> => {
    const employerStartedAt = Date.now();
    let result: BoardFetchResult;
    try {
      const stored = parseWorkdayUrl(entry.careers_url) ? new Set(entry.stored) : undefined;
      result = await fetchBoard(
        asEmployer(entry),
        new Set(entry.known),
        stored,
        tracker,
      );
    } catch (error) {
      result = { jobs: [], ok: false, error: errorText(error), totalListed: 0 };
    }
    let error = result.ok ? null : errorText(result.error ?? 'Unknown Workday fetch error');
    if (!options.dry) {
      try {
        const payload: WorkdayIngestPayload = result.ok
          ? {
            employerId: entry.id,
            result: {
              jobs: result.jobs,
              totalListed: result.totalListed,
              truncated: result.truncated ?? false,
              closedKeys: result.closedKeys,
            },
          }
          : { employerId: entry.id, error: error ?? 'Unknown Workday fetch error' };
        await postWithRetry(radarUrl, payload);
      } catch (postError) {
        error = `POST failed: ${errorText(postError)}`;
      }
    }
    completed += 1;
    const outcome: EmployerOutcome = {
      ok: result.ok && error === null,
      error,
      jobs: result.jobs.length,
      truncated: result.truncated ?? false,
      closedKeys: result.closedKeys?.length ?? 0,
      seconds: (Date.now() - employerStartedAt) / 1000,
    };
    console.log(
      `EMPLOYER\t${index + 1}/${employers.length}\t${entry.name}`
      + `\tok=${outcome.ok}\terror=${outcome.error ?? ''}`
      + `\tjobs=${outcome.jobs}\ttruncated=${outcome.truncated}`
      + `\tclosedKeys=${outcome.closedKeys}\tseconds=${outcome.seconds.toFixed(1)}`,
    );
    if (completed % 25 === 0) console.log(`PROGRESS\t${completed}/${employers.length}`);
    return outcome;
  });

  const wallTimeMs = Date.now() - startedAt;
  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  const failed429 = outcomes.filter((outcome) => /\b429\b/.test(outcome.error ?? '')).length;
  const first429 = tracker.rateLimitedRequests.reduce<
    WorkdayRequestTracker['rateLimitedRequests'][number] | null
  >((first, event) => !first || event.requestNumber < first.requestNumber ? event : first, null);
  console.log(
    `TOTALS\temployers=${employers.length}\tok=${employers.length - failed}`
    + `\terror=${failed}\tfailed429=${failed429}`
    + `\thttp429=${tracker.rateLimitedRequests.length}`
    + `\trequests=${tracker.requestCount}`
    + `\tfirst429Request=${first429?.requestNumber ?? 'none'}`
    + `\tfirst429AtSeconds=${first429 ? ((first429.at - startedAt) / 1000).toFixed(1) : 'none'}`
    + `\twallSeconds=${(wallTimeMs / 1000).toFixed(1)}`,
  );
  for (let index = 0; index < employers.length; index += 1) {
    if (/\b(jll|accenture)\b/i.test(employers[index].name)) {
      const outcome = outcomes[index];
      console.log(
        `TARGET\t${index + 1}/${employers.length}\t${employers[index].name}`
        + `\tok=${outcome.ok}\terror=${outcome.error ?? ''}`
        + `\tjobs=${outcome.jobs}\ttruncated=${outcome.truncated}`
        + `\tclosedKeys=${outcome.closedKeys}\tseconds=${outcome.seconds.toFixed(1)}`,
      );
    }
  }
  if (employers.length > 0 && failed > employers.length / 2) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(`workday-pull failed: ${errorText(error)}`);
  process.exitCode = 1;
});

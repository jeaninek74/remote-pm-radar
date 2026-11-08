/**
 * Verifies the careers URL of every employer in `careers-employers.ts` and
 * extracts whatever board coordinates can be read from the redirect chain or the
 * page HTML.
 *
 * Usage: npx tsx scripts/resolve-careers.ts
 * Output: `careers-resolution.json` with one row per employer:
 *   status      — 'ok' when the page answered, 'dead' otherwise
 *   workday     — { tenant, wd, site } when a Workday board was found
 *   ats / slug  — when the page is served by one of the open ATS vendors
 *
 * Only `ok` rows are promoted into the employer registry, so the tracker never
 * lists a careers link that does not resolve.
 */
import { writeFileSync } from 'node:fs';
import { CAREERS_EMPLOYERS } from '../server/data/careers-employers';

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 12;

const WORKDAY_URL = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^"'?#\s/]+)/i;
const NEOGOV_URL = /https?:\/\/((?:www\.)?(?:governmentjobs|schooljobs)\.com)\/careers\/(?!home(?:\/|[?#"'<>\\\s]|$))([A-Za-z0-9_-]+)/i;
const ATS_PATTERNS: { ats: string; re: RegExp }[] = [
  { ats: 'greenhouse', re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i },
  { ats: 'lever', re: /jobs\.lever\.co\/([a-z0-9-]+)/i },
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i },
  { ats: 'workable', re: /apply\.workable\.com\/([a-z0-9-]+)/i },
  { ats: 'smartrecruiters', re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)/i },
];

export interface Resolution {
  name: string;
  industry: string;
  size: string;
  hq: string;
  careersUrl: string;
  finalUrl: string | null;
  status: 'ok' | 'dead';
  httpStatus: number | null;
  workday: { tenant: string; wd: string; site: string } | null;
  ats: string | null;
  slug: string | null;
  note: string;
}

function detect(html: string, finalUrl: string): Pick<Resolution, 'workday' | 'ats' | 'slug' | 'note'> {
  const workdayMatch = WORKDAY_URL.exec(finalUrl) ?? WORKDAY_URL.exec(html);
  if (workdayMatch) {
    return {
      workday: { tenant: workdayMatch[1].toLowerCase(), wd: workdayMatch[2], site: workdayMatch[3] },
      ats: 'workday',
      slug: `${workdayMatch[1].toLowerCase()}/${workdayMatch[3]}`,
      note: 'Workday board detected — searchable by the refresh cycle.',
    };
  }
  const neogovMatch = NEOGOV_URL.exec(finalUrl) ?? NEOGOV_URL.exec(html);
  if (neogovMatch) {
    return {
      workday: null,
      ats: 'neogov',
      slug: `${neogovMatch[1].toLowerCase()}/${neogovMatch[2]}`,
      note: 'NEOGOV agency feed detected.',
    };
  }
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.re.exec(finalUrl) ?? pattern.re.exec(html);
    if (match) return { workday: null, ats: pattern.ats, slug: match[1].toLowerCase(), note: `${pattern.ats} board detected.` };
  }
  if (/taleo\.net/i.test(finalUrl + html)) return { workday: null, ats: null, slug: null, note: 'Taleo board — no public JSON API.' };
  if (/icims\.com/i.test(finalUrl + html)) return { workday: null, ats: null, slug: null, note: 'iCIMS board — no public JSON API.' };
  if (/successfactors|sapsf/i.test(finalUrl + html)) return { workday: null, ats: null, slug: null, note: 'SAP SuccessFactors board — no public JSON API.' };
  return { workday: null, ats: null, slug: null, note: 'Careers page reachable; board is proprietary.' };
}

async function resolveOne(employer: (typeof CAREERS_EMPLOYERS)[number]): Promise<Resolution> {
  const base: Resolution = {
    name: employer.name,
    industry: employer.industry,
    size: employer.size,
    hq: employer.hq,
    careersUrl: employer.careersUrl,
    finalUrl: null,
    status: 'dead',
    httpStatus: null,
    workday: null,
    ats: null,
    slug: null,
    note: 'No response.',
  };
  try {
    const res = await fetch(employer.careersUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RemotePMRadar/1.0; +careers audit)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = (await res.text()).slice(0, 400_000);
    const finalUrl = res.url || employer.careersUrl;
    return {
      ...base,
      finalUrl,
      status: res.ok ? 'ok' : 'dead',
      httpStatus: res.status,
      ...detect(html, finalUrl),
    };
  } catch (err) {
    return { ...base, note: `Fetch failed: ${(err as Error).message.slice(0, 80)}` };
  }
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const current = index++;
        if (current >= items.length) return;
        results[current] = await worker(items[current]);
      }
    }),
  );
  return results;
}

async function main(): Promise<void> {
  console.log(`[careers] resolving ${CAREERS_EMPLOYERS.length} employers`);
  let done = 0;
  const results = await pool(CAREERS_EMPLOYERS, CONCURRENCY, async (employer) => {
    const result = await resolveOne(employer);
    done += 1;
    if (done % 15 === 0) console.log(`[careers] ${done}/${CAREERS_EMPLOYERS.length}`);
    return result;
  });

  writeFileSync('careers-resolution.json', JSON.stringify(results, null, 2));

  const ok = results.filter((r) => r.status === 'ok');
  const workday = ok.filter((r) => r.workday);
  const openAts = ok.filter((r) => r.ats && r.ats !== 'workday');
  console.log(`\n[careers] ${ok.length}/${results.length} reachable · ${workday.length} Workday · ${openAts.length} open ATS`);
  for (const row of ok) {
    const target = row.workday ? `workday ${row.workday.tenant}/${row.workday.wd}/${row.workday.site}` : row.ats ? `${row.ats} ${row.slug}` : row.note;
    console.log(`  ${row.name.padEnd(34)} ${String(row.httpStatus).padStart(3)}  ${target}`);
  }
  const dead = results.filter((r) => r.status !== 'ok');
  if (dead.length) {
    console.log(`\n[careers] unreachable (${dead.length}):`);
    for (const row of dead) console.log(`  ${row.name.padEnd(34)} ${row.httpStatus ?? '-'} ${row.note}`);
  }
}

void main();

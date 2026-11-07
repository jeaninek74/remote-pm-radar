/**
 * Resolves an employer's own board for every state target.
 *
 * Usage: npx tsx scripts/cover-states.ts
 * Output: `state-coverage.json` plus a printed summary of which states are covered.
 *
 * Two resolution paths, in order:
 *   1. the open ATS APIs, using explicit slug guesses and slug variants of the name
 *   2. the employer's careers URL, following redirects and scanning for Workday
 *
 * Only employers that answer with live postings are reported as verified, so the
 * registry never claims a state it cannot actually search.
 */
import { writeFileSync } from 'node:fs';
import { STATE_TARGETS } from '../server/data/state-employers';
import type { StateTarget } from '../server/data/state-employers';
import { isRoleTitle } from '../server/engine/titles';

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 14;

const OPEN_ATS = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'] as const;
type OpenAts = (typeof OPEN_ATS)[number];

const WORKDAY_URL = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^"'?#\s/]+)/i;

export interface Covered {
  name: string;
  state: string;
  industry: string;
  size: string;
  ats: string;
  slug: string;
  careersUrl: string;
  total: number;
  roleHits: number;
  remoteHits: number;
}

interface Listing { title: string; location: string }

function endpoint(ats: OpenAts, slug: string): { url: string; pick: (d: unknown) => Listing[] } {
  switch (ats) {
    case 'greenhouse':
      return {
        url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        pick: (d) => ((d as { jobs?: { title?: string; location?: { name?: string } }[] }).jobs ?? []).map((j) => ({ title: j.title ?? '', location: j.location?.name ?? '' })),
      };
    case 'lever':
      return {
        url: `https://api.lever.co/v0/postings/${slug}?mode=json`,
        pick: (d) => (Array.isArray(d) ? (d as { text?: string; categories?: { location?: string } }[]) : []).map((j) => ({ title: j.text ?? '', location: j.categories?.location ?? '' })),
      };
    case 'ashby':
      return {
        url: `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        pick: (d) => ((d as { jobs?: { title?: string; location?: string }[] }).jobs ?? []).map((j) => ({ title: j.title ?? '', location: j.location ?? '' })),
      };
    case 'workable':
      return {
        url: `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`,
        pick: (d) => ((d as { jobs?: { title?: string }[] }).jobs ?? []).map((j) => ({ title: j.title ?? '', location: '' })),
      };
    case 'smartrecruiters':
      return {
        url: `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
        pick: (d) => ((d as { content?: { name?: string; location?: { city?: string } }[] }).content ?? []).map((j) => ({ title: j.name ?? '', location: j.location?.city ?? '' })),
      };
  }
}

async function probeOpenAts(slug: string): Promise<{ ats: OpenAts; slug: string; jobs: Listing[] } | null> {
  for (const ats of OPEN_ATS) {
    const { url, pick } = endpoint(ats, slug);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'RemotePMRadar/1.0 (state coverage audit)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const jobs = pick(await res.json());
      if (jobs.length) return { ats, slug, jobs };
    } catch { /* try the next vendor */ }
  }
  return null;
}

async function probeCareers(target: StateTarget): Promise<{ ats: string; slug: string; careersUrl: string; jobs: Listing[] } | null> {
  try {
    const res = await fetch(target.careersUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemotePMRadar/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = (await res.text()).slice(0, 300_000);
    const finalUrl = res.url || target.careersUrl;
    const wd = WORKDAY_URL.exec(finalUrl) ?? WORKDAY_URL.exec(html);
    if (!wd) return null;
    const tenant = wd[1].toLowerCase();
    const pod = wd[2];
    const site = wd[3].replace(/[^A-Za-z0-9_-]+$/, '');
    const careersUrl = `https://${tenant}.${pod}.myworkdayjobs.com/${site}`;
    const search = await fetch(`https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'RemotePMRadar/1.0' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: 'project manager' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!search.ok) return null;
    const data = (await search.json()) as { jobPostings?: { title?: string; locationsText?: string }[] };
    const jobs = (data.jobPostings ?? []).map((j) => ({ title: j.title ?? '', location: j.locationsText ?? '' }));
    if (!jobs.length) return null;
    return { ats: 'workday', slug: `${tenant}/${site}`, careersUrl, jobs };
  } catch {
    return null;
  }
}

async function resolveTarget(target: StateTarget): Promise<Covered | null> {
  // Only explicitly curated slugs are trusted. A derived slug such as "general" or "blue"
  // happily resolves to some unrelated company's board, which would put another employer's
  // jobs under this employer's name.
  const variants = (target.slugs ?? []).filter((v) => v.length >= 3);

  for (const slug of variants) {
    const hit = await probeOpenAts(slug);
    if (hit) return summarise(target, hit.ats, hit.slug, `https://boards.greenhouse.io/${hit.slug}`, hit.jobs);
  }
  const wd = await probeCareers(target);
  if (wd) return summarise(target, wd.ats, wd.slug, wd.careersUrl, wd.jobs);
  return null;
}

function summarise(target: StateTarget, ats: string, slug: string, careersUrl: string, jobs: Listing[]): Covered {
  return {
    name: target.name,
    state: target.state,
    industry: target.industry,
    size: target.size,
    ats,
    slug,
    careersUrl,
    total: jobs.length,
    roleHits: jobs.filter((j) => isRoleTitle(j.title)).length,
    remoteHits: jobs.filter((j) => /remote|anywhere/i.test(j.location)).length,
  };
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
  console.log(`[states] resolving ${STATE_TARGETS.length} employers`);
  let done = 0;
  const results = await pool(STATE_TARGETS, CONCURRENCY, async (target) => {
    const result = await resolveTarget(target);
    done += 1;
    if (done % 15 === 0) console.log(`[states] ${done}/${STATE_TARGETS.length}`);
    return result;
  });

  const covered = results.filter((r): r is Covered => Boolean(r));
  writeFileSync('state-coverage.json', JSON.stringify(covered, null, 2));

  const ALL = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
  const states = new Set(covered.map((c) => c.state));
  const missing = ALL.filter((s) => !states.has(s));

  console.log(`\n[states] verified ${covered.length}/${STATE_TARGETS.length}`);
  for (const row of covered.sort((a, b) => a.state.localeCompare(b.state))) {
    console.log(`  ${row.state}  ${row.name.padEnd(38)} ${row.ats.padEnd(14)} ${row.slug.padEnd(30)} ${String(row.total).padStart(3)} postings / ${String(row.roleHits).padStart(3)} in family`);
  }
  console.log(`\n[states] still without a verified employer: ${missing.join(' ') || 'none'}`);
}

void main();

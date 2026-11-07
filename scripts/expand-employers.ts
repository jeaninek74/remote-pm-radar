/**
 * Probes candidate employers against the public ATS APIs and reports which ones
 * actually publish a machine-readable job board.
 *
 * Usage:
 *   npx tsx scripts/expand-employers.ts            # probe every candidate
 *   npx tsx scripts/expand-employers.ts --limit 50
 *   npx tsx scripts/expand-employers.ts --emit     # print seed rows for verified boards
 *
 * Output is written to `employer-expansion.json` next to the repo root so the
 * verified rows can be reviewed before they are merged into the seed registry.
 * A candidate only counts as verified when its board answers AND returns at
 * least one posting — a 200 with an empty board is not a usable source.
 */
import { writeFileSync } from 'node:fs';
import { CANDIDATES } from '../server/data/employer-candidates';
import type { Candidate } from '../server/data/employer-candidates';
import { isRoleTitle } from '../server/engine/titles';
import type { Ats } from '../server/engine/types';

const PROVIDERS: Ats[] = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'];

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 16;

interface ProbeResult {
  name: string;
  industry: string;
  size: string;
  hq: string;
  ats: Ats;
  slug: string;
  total: number;
  roleHits: number;
  remoteHits: number;
  sample: string[];
}

function endpoint(ats: Ats, slug: string): { url: string; pick: (data: unknown) => { title: string; location: string }[] } {
  switch (ats) {
    case 'greenhouse':
      return {
        url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        pick: (data) => {
          const jobs = (data as { jobs?: { title?: string; location?: { name?: string } }[] }).jobs ?? [];
          return jobs.map((j) => ({ title: j.title ?? '', location: j.location?.name ?? '' }));
        },
      };
    case 'lever':
      return {
        url: `https://api.lever.co/v0/postings/${slug}?mode=json`,
        pick: (data) => {
          const jobs = Array.isArray(data) ? (data as { text?: string; categories?: { location?: string } }[]) : [];
          return jobs.map((j) => ({ title: j.text ?? '', location: j.categories?.location ?? '' }));
        },
      };
    case 'ashby':
      return {
        url: `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        pick: (data) => {
          const jobs = (data as { jobs?: { title?: string; location?: string }[] }).jobs ?? [];
          return jobs.map((j) => ({ title: j.title ?? '', location: j.location ?? '' }));
        },
      };
    case 'workable':
      return {
        url: `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`,
        pick: (data) => {
          const jobs = (data as { jobs?: { title?: string; location?: { city?: string; country?: string } }[] }).jobs ?? [];
          return jobs.map((j) => ({ title: j.title ?? '', location: [j.location?.city, j.location?.country].filter(Boolean).join(', ') }));
        },
      };
    case 'smartrecruiters':
      return {
        url: `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
        pick: (data) => {
          const jobs = (data as { content?: { name?: string; location?: { city?: string; country?: string } }[] }).content ?? [];
          return jobs.map((j) => ({ title: j.name ?? '', location: [j.location?.city, j.location?.country].filter(Boolean).join(', ') }));
        },
      };
    default:
      return { url: '', pick: () => [] };
  }
}

async function probeProvider(ats: Ats, slug: string): Promise<{ title: string; location: string }[] | null> {
  const { url, pick } = endpoint(ats, slug);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RemotePMRadar/1.0 (employer coverage audit)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const jobs = pick(data);
    return jobs.length ? jobs : null;
  } catch {
    return null;
  }
}

async function probeCandidate(candidate: Candidate): Promise<ProbeResult | null> {
  for (const slug of candidate.slugs) {
    for (const ats of PROVIDERS) {
      const jobs = await probeProvider(ats, slug);
      if (!jobs) continue;
      const roleHits = jobs.filter((job) => isRoleTitle(job.title)).length;
      const remoteHits = jobs.filter((job) => /remote|anywhere|distributed/i.test(job.location)).length;
      return {
        name: candidate.name,
        industry: candidate.industry,
        size: candidate.size,
        hq: candidate.hq,
        ats,
        slug,
        total: jobs.length,
        roleHits,
        remoteHits,
        sample: jobs.slice(0, 3).map((job) => `${job.title} — ${job.location}`),
      };
    }
  }
  return null;
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : CANDIDATES.length;
  const targets = CANDIDATES.slice(0, limit);

  console.log(`[probe] ${targets.length} candidates × ${PROVIDERS.length} providers`);
  let done = 0;
  let live = 0;
  const results = await pool(targets, CONCURRENCY, async (candidate) => {
    const result = await probeCandidate(candidate);
    done += 1;
    if (result) live += 1;
    if (done % 20 === 0) console.log(`[probe] ${done}/${targets.length} checked, ${live} live`);
    return result;
  });

  const verified = results.filter((result): result is ProbeResult => Boolean(result));
  const missing = targets.filter((_, i) => !results[i]).map((candidate) => candidate.name);

  verified.sort((a, b) => b.roleHits - a.roleHits || b.total - a.total);
  writeFileSync('employer-expansion.json', JSON.stringify({ verified, missing }, null, 2));

  console.log(`\n[probe] verified ${verified.length}/${targets.length} boards`);
  for (const row of verified) {
    console.log(`  ${row.name.padEnd(38)} ${row.ats.padEnd(14)} ${row.slug.padEnd(26)} ${String(row.total).padStart(4)} postings, ${String(row.roleHits).padStart(3)} in family, ${String(row.remoteHits).padStart(3)} remote`);
  }
  console.log(`\n[probe] no live board: ${missing.length}`);
  console.log(missing.join(', '));

  if (args.includes('--emit')) {
    console.log('\n/* ---- verified rows ---- */');
    for (const row of verified) {
      console.log(`  ['${row.name.replace(/'/g, "\\'")}', '${row.ats}', '${row.slug}', '${row.industry}', '${row.size}', '${row.hq}'],`);
    }
  }
}

void main();

import { migrate, pool, q } from '../server/db';
import { fetchJson, mapLimit } from '../server/engine/http';
import { isPmTitle } from '../server/engine/titles';
import { companyKey, slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

const ATS: Ats[] = ['greenhouse', 'ashby', 'lever', 'workable'];

async function boardHasJobs(ats: Ats, slug: string): Promise<number | null> {
  try {
    if (ats === 'greenhouse') {
      const d = await fetchJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, 12_000);
      return Array.isArray(d.jobs) ? d.jobs.length : null;
    }
    if (ats === 'ashby') {
      const d = await fetchJson<{ jobs?: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, 12_000);
      return Array.isArray(d.jobs) ? d.jobs.length : null;
    }
    if (ats === 'lever') {
      const d = await fetchJson<unknown[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, 12_000);
      return Array.isArray(d) ? d.length : null;
    }
    if (ats === 'workable') {
      const d = await fetchJson<{ jobs?: unknown[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, 12_000);
      return Array.isArray(d.jobs) ? d.jobs.length : null;
    }
  } catch { return null; }
  return null;
}

async function main(): Promise<void> {
  await migrate();
  const limit = Number(process.argv[2] ?? 140);

  // 1. Collect companies that are actively hiring remote project/program managers.
  const names = new Map<string, { name: string; sample: string }>();
  for (let page = 0; page < 8; page++) {
    try {
      const d = await fetchJson<{ jobs?: { title: string; companyName: string }[] }>(
        `https://himalayas.app/jobs/api?limit=100&offset=${page * 100}`, 20_000,
      );
      for (const job of d.jobs ?? []) {
        if (!isPmTitle(job.title ?? '') || !job.companyName) continue;
        names.set(companyKey(job.companyName), { name: job.companyName, sample: job.title });
      }
    } catch { break; }
  }
  try {
    const d = await fetchJson<{ jobs?: { title: string; company_name: string }[] }>(
      'https://remotive.com/api/remote-jobs?limit=800', 25_000,
    );
    for (const job of d.jobs ?? []) {
      if (!isPmTitle(job.title ?? '') || !job.company_name) continue;
      names.set(companyKey(job.company_name), { name: job.company_name, sample: job.title });
    }
  } catch { /* feed unavailable */ }

  const existing = await q<{ name: string }>(`SELECT name FROM employers`);
  const known = new Set(existing.map((row) => companyKey(row.name)));
  const candidates = [...names.values()].filter((item) => !known.has(companyKey(item.name)));
  console.log(`feed companies hiring PMs: ${names.size}; new candidates: ${candidates.length}`);

  // 2. Probe each candidate for a public board.
  let added = 0;
  const batch = candidates.slice(0, limit);
  await mapLimit(batch, 6, async (candidate) => {
    const slug = slugify(candidate.name);
    if (!slug || slug.length < 3) return;
    const variants = [...new Set([slug, slug.replace(/-/g, '')])];
    for (const variant of variants) {
      for (const ats of ATS) {
        const count = await boardHasJobs(ats, variant);
        if (count && count > 0) {
          const inserted = await q<{ id: number }>(
            `INSERT INTO employers (name, ats, slug, discovered_via, active, careers_url, last_status)
             VALUES ($1,$2,$3,'Feed discovery',TRUE,$4,'Discovered from job feed; not yet searched')
             ON CONFLICT (ats, slug) DO NOTHING RETURNING id`,
            [candidate.name, ats, variant, `https://${ats === 'greenhouse' ? 'boards.greenhouse.io' : ats === 'lever' ? 'jobs.lever.co' : ats === 'ashby' ? 'jobs.ashbyhq.com' : 'apply.workable.com'}/${variant}`],
          );
          if (inserted.length) { added += 1; console.log(`  + ${candidate.name} -> ${ats}/${variant} (${count} postings)`); }
          return;
        }
      }
    }
  });

  console.log(`added ${added} employers from feed discovery`);
  await pool.end();
}

void main().catch(async (err) => { console.error(err); await pool.end(); });

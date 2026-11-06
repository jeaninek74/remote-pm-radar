import { one, q, pool } from '../server/db';
import { fetchJson } from '../server/engine/http';
import { isPmTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

/**
 * Bulk probe of the employer discovery queue.
 *
 * Pulls every pending company (fed from the portfolio directory) and probes the employer's own
 * applicant-tracking system. Found boards are inserted into the employers table immediately so the
 * next refresh searches them. Run: tsx scripts/probe-queue.ts [limit]
 */

const ATS_ORDER: Ats[] = ['greenhouse', 'ashby', 'lever', 'workable', 'smartrecruiters'];
const TIMEOUT = 8_000;

async function probe(ats: Ats, slug: string): Promise<{ postings: number; pm: number } | null> {
  try {
    if (ats === 'greenhouse') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, TIMEOUT);
      if (!Array.isArray(d.jobs) || !d.jobs.length) return null;
      return { postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'ashby') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, TIMEOUT);
      if (!Array.isArray(d.jobs) || !d.jobs.length) return null;
      return { postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'lever') {
      const d = await fetchJson<{ text?: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, TIMEOUT);
      if (!Array.isArray(d) || !d.length) return null;
      return { postings: d.length, pm: d.filter((j) => isPmTitle(j.text ?? '')).length };
    }
    if (ats === 'workable') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, TIMEOUT);
      if (!Array.isArray(d.jobs) || !d.jobs.length) return null;
      return { postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    const d = await fetchJson<{ content?: { name?: string }[] }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, TIMEOUT);
    if (!Array.isArray(d.content) || !d.content.length) return null;
    return { postings: d.content.length, pm: d.content.filter((j) => isPmTitle(j.name ?? '')).length };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 3000);
  const rows = await q<{ id: number; name: string; industry: string | null; hq_state: string | null }>(
    `SELECT id, name, industry, hq_state FROM discovery_queue
      WHERE status='pending' AND tries < 3 ORDER BY tries, id LIMIT $1`,
    [limit],
  );
  console.log(`probing ${rows.length} queued employers`);

  let done = 0;
  let found = 0;
  let withPm = 0;
  const queue = [...rows];

  await Promise.all(Array.from({ length: 20 }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const base = slugify(row.name);
      const slugs = [...new Set([base, base.replace(/-/g, '')])].filter((s) => s.length >= 3);
      let hit: { ats: Ats; slug: string; postings: number; pm: number } | null = null;
      outer: for (const slug of slugs) {
        for (const ats of ATS_ORDER) {
          const res = await probe(ats, slug);
          if (res) { hit = { ats, slug, ...res }; break outer; }
        }
      }
      if (hit) {
        found += 1;
        if (hit.pm > 0) withPm += 1;
        await q(
          `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active)
           VALUES ($1,$2,$3,$4,'Midsize',$5,$6,'Portfolio discovery',TRUE)
           ON CONFLICT (ats, slug) DO NOTHING`,
          [row.name, hit.ats, hit.slug, row.industry,
           row.hq_state, `https://${hit.ats === 'greenhouse' ? 'boards.greenhouse.io' : hit.ats === 'lever' ? 'jobs.lever.co' : hit.ats === 'ashby' ? 'jobs.ashbyhq.com' : 'apply.workable.com'}/${hit.slug}`],
        );
        await q(`UPDATE discovery_queue SET status='found', tries=tries+1, found_ats=$2, found_slug=$3, checked_at=now() WHERE id=$1`, [row.id, hit.ats, hit.slug]);
        if (hit.pm > 0) console.log(`${String(hit.pm).padStart(3)} PM  ${hit.ats.padEnd(14)} ${hit.slug.padEnd(26)} ${row.name}`);
      } else {
        await q(`UPDATE discovery_queue SET tries=tries+1, checked_at=now() WHERE id=$1`, [row.id]);
      }
      done += 1;
      if (done % 100 === 0) {
        const boards = await one<{ n: string }>(`SELECT count(*)::text AS n FROM employers WHERE active AND ats <> 'manual'`);
        console.log(`... ${done}/${rows.length} probed · ${found} new boards · ${withPm} with PM roles · ${boards?.n} active boards`);
      }
    }
  }));

  console.log(`done: ${found} new boards, ${withPm} with project/program roles`);
  await pool.end();
}

void main().catch((err) => { console.error(err); process.exit(1); });

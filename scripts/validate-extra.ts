import { readFileSync } from 'node:fs';
import { fetchJson } from '../server/engine/http';
import { SEED_EMPLOYERS } from '../server/data/employers.seed';
import { isPmTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

const ATS_ORDER: Ats[] = ['greenhouse', 'ashby', 'lever', 'workable', 'smartrecruiters', 'recruitee'];

interface Hit { ats: Ats; slug: string; postings: number; pm: number }

async function probe(ats: Ats, slug: string): Promise<Hit | null> {
  try {
    if (ats === 'greenhouse') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, 12_000);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'ashby') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, 12_000);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'lever') {
      const d = await fetchJson<{ text?: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, 12_000);
      if (!Array.isArray(d)) return null;
      return { ats, slug, postings: d.length, pm: d.filter((j) => isPmTitle(j.text ?? '')).length };
    }
    if (ats === 'workable') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, 12_000);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'smartrecruiters') {
      const d = await fetchJson<{ content?: { name?: string }[]; totalFound?: number }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, 12_000);
      if (!Array.isArray(d.content)) return null;
      return { ats, slug, postings: d.totalFound ?? d.content.length, pm: d.content.filter((j) => isPmTitle(j.name ?? '')).length };
    }
    if (ats === 'recruitee') {
      const d = await fetchJson<{ offers?: { title?: string }[] }>(`https://${slug}.recruitee.com/api/offers/`, 12_000);
      if (!Array.isArray(d.offers)) return null;
      return { ats, slug, postings: d.offers.length, pm: d.offers.filter((o) => isPmTitle(o.title ?? '')).length };
    }
  } catch { return null; }
  return null;
}

async function resolve(name: string): Promise<Hit | null> {
  const slugs = [...new Set([slugify(name), slugify(name).replace(/-/g, '')])].filter((s) => s.length >= 3);
  for (const slug of slugs) {
    for (const ats of ATS_ORDER) {
      const hit = await probe(ats, slug);
      if (hit && hit.postings > 0) return hit;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const lines = readFileSync('/tmp/candidates.tsv', 'utf8').split('\n').filter((line) => line.trim());
  const known = new Set(SEED_EMPLOYERS.map((e) => slugify(e.name)));
  const rows = lines.map((line) => {
    const [name, industry, size, hq] = line.split('\t');
    return { name: name?.trim(), industry: industry?.trim(), size: size?.trim(), hq: hq?.trim() };
  }).filter((row) => row.name && !known.has(slugify(row.name)));

  console.log(`validating ${rows.length} new candidates`);
  const out: string[] = [];
  let ok = 0;
  const queue = [...rows];
  const workers = Array.from({ length: 8 }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const hit = await resolve(row.name);
      if (hit && hit.postings > 0) {
        ok += 1;
        out.push(`${row.name}\t${hit.ats}\t${hit.slug}\t${row.industry}\t${row.size}\t${row.hq}\t${hit.postings}\t${hit.pm}`);
        console.log(`${String(hit.pm).padStart(3)} PM  ${hit.ats.padEnd(14)} ${hit.slug.padEnd(26)} ${row.name}`);
      }
    }
  });
  await Promise.all(workers);
  writeFileSync('/tmp/extra-validation.tsv', out.join('\n'));
  console.log(`valid ${ok}/${rows.length}; wrote /tmp/extra-validation.tsv`);
}

import { writeFileSync } from 'node:fs';
void main().catch((err) => { console.error(err); process.exitCode = 1; });

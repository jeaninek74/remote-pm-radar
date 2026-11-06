import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchJson } from '../server/engine/http';
import { isPmTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

const ATS_ORDER: Ats[] = ['greenhouse', 'ashby', 'lever', 'workable'];
const TIMEOUT = 9_000;

async function probe(ats: Ats, slug: string): Promise<{ ats: Ats; slug: string; postings: number; pm: number } | null> {
  try {
    if (ats === 'greenhouse') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, TIMEOUT);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'ashby') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, TIMEOUT);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'lever') {
      const d = await fetchJson<{ text?: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, TIMEOUT);
      if (!Array.isArray(d)) return null;
      return { ats, slug, postings: d.length, pm: d.filter((j) => isPmTitle(j.text ?? '')).length };
    }
    if (ats === 'workable') {
      const d = await fetchJson<{ jobs?: { title?: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, TIMEOUT);
      if (!Array.isArray(d.jobs)) return null;
      return { ats, slug, postings: d.jobs.length, pm: d.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
  } catch { return null; }
  return null;
}

async function main(): Promise<void> {
  const input = process.argv[2] ?? '/tmp/states.tsv';
  const out = process.argv[3] ?? '/tmp/states-validation.tsv';
  const rows = readFileSync(input, 'utf8').split('\n').filter((line) => line.trim()).map((line) => {
    const [name, industry, size, hq] = line.split('\t');
    return { name: name?.trim(), industry: industry?.trim(), size: size?.trim(), hq: hq?.trim() };
  }).filter((row) => row.name);

  writeFileSync(out, '');
  console.log(`probing ${rows.length} candidates across ${new Set(rows.map((r) => r.hq)).size} states`);

  let done = 0;
  let found = 0;
  const queue = [...rows];
  const workers = Array.from({ length: 14 }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const slugs = [...new Set([slugify(row.name), slugify(row.name).replace(/-/g, '')])].filter((s) => s.length >= 3);
      let hit = null as { ats: Ats; slug: string; postings: number; pm: number } | null;
      for (const slug of slugs) {
        for (const ats of ATS_ORDER) {
          hit = await probe(ats, slug);
          if (hit && hit.postings > 0) break;
        }
        if (hit && hit.postings > 0) break;
      }
      done += 1;
      if (hit && hit.postings > 0) {
        found += 1;
        appendFileSync(out, `${row.name}\t${hit.ats}\t${hit.slug}\t${row.industry}\t${row.size}\t${row.hq}\t${hit.postings}\t${hit.pm}\n`);
        console.log(`${String(hit.pm).padStart(3)} PM  ${row.hq}  ${hit.ats.padEnd(11)} ${hit.slug.padEnd(24)} ${row.name}`);
      }
      if (done % 40 === 0) console.log(`... ${done}/${rows.length} probed, ${found} boards found`);
    }
  });
  await Promise.all(workers);
  const states = new Set(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[5]));
  console.log(`done: ${found} boards across ${states.size} states -> ${out}`);
}

void main().catch((err) => { console.error(err); process.exitCode = 1; });

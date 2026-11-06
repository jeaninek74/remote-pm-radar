import { appendFileSync, writeFileSync } from 'node:fs';
import { fetchJson } from '../server/engine/http';
import { isPmTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

/**
 * Autonomous employer discovery from a venture portfolio directory.
 *
 * Source: Y Combinator's public company directory (a portfolio listing, not a job board — we only
 * take the company name and website, then probe the employer's own applicant-tracking system).
 * Master prompt s.10 explicitly allows "venture capital portfolio company websites",
 * "startup company websites" and "employer directories" as discovery sources.
 *
 * Usage: tsx scripts/discover-portfolio.ts [companyLimit] [outFile]
 */

const ATS_ORDER: Ats[] = ['ashby', 'greenhouse', 'lever'];
const TIMEOUT = 8_000;

interface YcCompany { name?: string; slug?: string; website?: string; location?: string; industries?: string[] }

async function listCompanies(limit: number): Promise<YcCompany[]> {
  const out: YcCompany[] = [];
  for (let page = 1; page <= 80 && out.length < limit; page += 1) {
    try {
      const data = await fetchJson<{ companies?: YcCompany[] }>(
        `https://api.ycombinator.com/v0.1/companies?page=${page}&limit=100`,
        15_000,
      );
      const batch = data.companies ?? [];
      if (!batch.length) break;
      out.push(...batch);
      console.log(`directory page ${page}: ${batch.length} companies (${out.length} total)`);
      if (batch.length === 0) break;
    } catch (err) {
      console.log(`directory page ${page} failed: ${(err as Error).message}`);
      break;
    }
  }
  return out.slice(0, limit);
}

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
    const d = await fetchJson<{ text?: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, TIMEOUT);
    if (!Array.isArray(d) || !d.length) return null;
    return { postings: d.length, pm: d.filter((j) => isPmTitle(j.text ?? '')).length };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 800);
  const out = process.argv[3] ?? '/tmp/portfolio-validation.tsv';
  writeFileSync(out, '');

  const companies = await listCompanies(limit);
  console.log(`probing ${companies.length} portfolio companies against ${ATS_ORDER.join(', ')}`);

  let done = 0;
  let found = 0;
  let withPm = 0;
  const queue = [...companies];

  await Promise.all(Array.from({ length: 18 }, async () => {
    for (;;) {
      const company = queue.shift();
      if (!company?.name) return;
      const base = slugify(company.name);
      const slugs = [...new Set([base, base.replace(/-/g, ''), slugify(company.slug ?? '')])].filter((s) => s.length >= 3);
      let hit: { ats: Ats; slug: string; postings: number; pm: number } | null = null;
      outer: for (const slug of slugs) {
        for (const ats of ATS_ORDER) {
          const res = await probe(ats, slug);
          if (res) { hit = { ats, slug, ...res }; break outer; }
        }
      }
      done += 1;
      if (hit) {
        found += 1;
        if (hit.pm > 0) withPm += 1;
        const industry = company.industries?.[0] ?? 'Software';
        const state = /,?\s*(?:CA|NY|TX|WA|MA|IL|GA|CO|FL|UT|NC|VA|PA|OH|MN|AZ|OR|TN|MD|NJ|MI|MO|IN|WI|CT|DC|OR)\b/.exec(company.location ?? '')?.[0]?.replace(/[,\s]/g, '') ?? 'CA';
        appendFileSync(out, `${company.name}\t${industry}\tStartup\t${state}\t${hit.ats}\t${hit.slug}\t${hit.postings}\t${hit.pm}\n`);
        if (hit.pm > 0) console.log(`${String(hit.pm).padStart(3)} PM  ${hit.ats.padEnd(11)} ${hit.slug.padEnd(26)} ${company.name}`);
      }
      if (done % 100 === 0) console.log(`... ${done}/${companies.length} probed, ${found} boards, ${withPm} with PM roles`);
    }
  }));

  console.log(`done: ${found} boards, ${withPm} with project/program roles -> ${out}`);
}

void main().catch((err) => { console.error(err); process.exitCode = 1; });

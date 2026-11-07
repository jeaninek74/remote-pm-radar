/**
 * Bulk employer prober.
 *
 * Usage: npx tsx scripts/probe-companies.ts
 * Output: `company-probe.json` and a printed summary.
 *
 * For each candidate it derives a slug, asks the five open ATS vendors whether that
 * slug exists, and then **confirms the board belongs to the company** by checking the
 * board's public page title. Slug collisions are common — "general", "blue" and
 * "capital" all resolve to real boards that belong to somebody else — and a board
 * attributed to the wrong employer is worse than a smaller registry.
 *
 * Only boards that answer with live postings *and* pass the name check are kept.
 */
import { writeFileSync } from 'node:fs';
import { COMPANY_CANDIDATES } from '../server/data/company-candidates';
import type { Candidate } from '../server/data/company-candidates';
import { isRoleTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 16;

type Vendor = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters';

interface Hit {
  ats: Vendor;
  slug: string;
  titles: string[];
  boardName: string | null;
}

const UA = 'Mozilla/5.0 (compatible; RemotePMRadar/1.0; employer board audit)';

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 20_000);
    const match = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(html);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** True when the board's own name looks like the company we were looking for. */
function nameMatches(boardName: string | null, company: string): boolean {
  if (!boardName) return false;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const board = norm(boardName);
  const target = norm(company);
  if (!board || !target) return false;
  if (board.includes(target) || target.includes(board)) return true;
  // tolerate "Acme Inc Careers" vs "Acme": compare the leading word
  const first = target.slice(0, Math.max(4, Math.min(10, target.length)));
  return board.includes(first);
}

const ENDPOINTS: { ats: Vendor; url: (slug: string) => string; titles: (data: unknown) => string[]; page: (slug: string) => string; name?: (data: unknown) => string | null }[] = [
  {
    ats: 'greenhouse',
    url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    titles: (d) => ((d as { jobs?: { title?: string }[] }).jobs ?? []).map((j) => j.title ?? ''),
    page: (s) => `https://boards.greenhouse.io/${s}`,
  },
  {
    ats: 'lever',
    url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    titles: (d) => (Array.isArray(d) ? (d as { text?: string }[]).map((j) => j.text ?? '') : []),
    page: (s) => `https://jobs.lever.co/${s}`,
  },
  {
    ats: 'ashby',
    url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    titles: (d) => ((d as { jobs?: { title?: string }[] }).jobs ?? []).map((j) => j.title ?? ''),
    page: (s) => `https://jobs.ashbyhq.com/${s}`,
  },
  {
    ats: 'workable',
    url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`,
    titles: (d) => ((d as { jobs?: { title?: string }[] }).jobs ?? []).map((j) => j.title ?? ''),
    page: (s) => `https://apply.workable.com/${s}/`,
  },
  {
    ats: 'smartrecruiters',
    url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`,
    titles: (d) => ((d as { content?: { name?: string }[] }).content ?? []).map((j) => j.name ?? ''),
    page: (s) => `https://careers.smartrecruiters.com/${s}`,
  },
];

async function probeSlug(slug: string, company: string): Promise<Hit | null> {
  for (const endpoint of ENDPOINTS) {
    const data = await getJson<unknown>(endpoint.url(slug));
    if (!data) continue;
    const titles = endpoint.titles(data);
    if (!titles.length) continue;
    const boardName = await getTitle(endpoint.page(slug));
    if (!nameMatches(boardName, company)) continue;
    return { ats: endpoint.ats, slug, titles, boardName };
  }
  return null;
}

async function probeCompany(candidate: Candidate): Promise<(Hit & { candidate: Candidate }) | null> {
  const [name] = candidate;
  const base = slugify(name);
  const slugs = [...new Set([base, base.replace(/-/g, '')])].filter((s) => s.length >= 3);
  for (const slug of slugs) {
    const hit = await probeSlug(slug, name);
    if (hit) return { ...hit, candidate };
  }
  return null;
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
  console.log(`[probe] ${COMPANY_CANDIDATES.length} candidates`);
  let done = 0;
  const hits = await pool(COMPANY_CANDIDATES, CONCURRENCY, async (candidate) => {
    const hit = await probeCompany(candidate);
    done += 1;
    if (done % 40 === 0) console.log(`[probe] ${done}/${COMPANY_CANDIDATES.length}`);
    return hit;
  });

  const verified = hits.filter((h): h is Hit & { candidate: Candidate } => Boolean(h));
  const rows = verified.map((hit) => ({
    name: hit.candidate[0],
    industry: hit.candidate[1],
    size: hit.candidate[2],
    hq: hit.candidate[3],
    ats: hit.ats,
    slug: hit.slug,
    boardName: hit.boardName,
    total: hit.titles.length,
    roleHits: hit.titles.filter((t) => isRoleTitle(t)).length,
  }));
  rows.sort((a, b) => b.roleHits - a.roleHits);
  writeFileSync('company-probe.json', JSON.stringify(rows, null, 2));

  console.log(`\n[probe] verified ${rows.length}/${COMPANY_CANDIDATES.length}`);
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(40)} ${row.ats.padEnd(15)} ${row.slug.padEnd(26)} ${String(row.total).padStart(4)} postings / ${String(row.roleHits).padStart(3)} in family`);
  }
}

void main();

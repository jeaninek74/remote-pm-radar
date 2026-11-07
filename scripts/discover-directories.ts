/**
 * Long-tail employer discovery.
 *
 * Usage: npx tsx scripts/discover-directories.ts [startupLimit] [nonprofitLimit]
 * Output: `directory-discovery.json`
 *
 * Two public directories supply names — neither is a job board:
 *
 *  - Y Combinator's company list. Each startup publishes its own website, so we read
 *    that site (home page, /careers, /jobs) and take the ATS link the company itself
 *    put there. Attribution is correct by construction: the link came from their page.
 *
 *  - ProPublica's Nonprofit Explorer, which mirrors IRS Form 990 filings. We take the
 *    larger filers in every state, including the health-category NTEE codes, and probe
 *    the usual ATS slugs, accepting a board only when its own page name matches.
 *
 * Output rows are ready to merge into the employer registry.
 */
import { writeFileSync } from 'node:fs';

const TIMEOUT = 12_000;
const CONCURRENCY = 24;
const UA = 'Mozilla/5.0 (compatible; RemotePMRadar/1.0; employer board audit)';

type Vendor = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters';

interface Found {
  name: string;
  ats: Vendor;
  slug: string;
  industry: string;
  size: string;
  hq: string;
  via: 'startup-directory' | 'nonprofit-registry';
  postings: number;
  sourceUrl: string;
}

const ATS_PATTERNS: { ats: Vendor; re: RegExp }[] = [
  { ats: 'greenhouse', re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i },
  { ats: 'lever', re: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i },
  { ats: 'workable', re: /apply\.workable\.com\/(?:api\/v1\/widget\/accounts\/)?([a-z0-9_-]+)/i },
  { ats: 'smartrecruiters', re: /(?:careers|jobs)\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
];

const ENDPOINT: Record<Vendor, (s: string) => string> = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  workable: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`,
  smartrecruiters: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`,
};

const PAGE: Record<Vendor, (s: string) => string> = {
  greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
  workable: (s) => `https://apply.workable.com/${s}/`,
  smartrecruiters: (s) => `https://careers.smartrecruiters.com/${s}`,
};

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 120_000);
  } catch {
    return null;
  }
}

async function json(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function countPostings(ats: Vendor, data: unknown): number {
  if (ats === 'lever') return Array.isArray(data) ? data.length : 0;
  const d = data as { jobs?: unknown[]; content?: unknown[] };
  return (d?.jobs?.length ?? d?.content?.length ?? 0) || 0;
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

function nameMatches(boardName: string | null, company: string): boolean {
  if (!boardName) return false;
  const board = norm(boardName);
  const target = norm(company);
  if (!board || !target) return false;
  if (board.includes(target) || target.includes(board)) return true;
  return board.includes(target.slice(0, Math.max(4, Math.min(10, target.length))));
}

/** Read a company's own site and pull whatever ATS link it publishes. */
async function fromWebsite(website: string, name: string): Promise<{ ats: Vendor; slug: string; sourceUrl: string } | null> {
  const base = website.replace(/\/+$/, '');
  for (const path of ['', '/careers', '/jobs', '/careers/']) {
    const html = await text(`${base}${path}`);
    if (!html) continue;
    for (const { ats, re } of ATS_PATTERNS) {
      const match = re.exec(html);
      if (!match) continue;
      const slug = match[1].toLowerCase();
      const data = await json(ENDPOINT[ats](slug));
      if (!data || countPostings(ats, data) === 0) continue;
      // The link sits on the company's own page, so a title check is a sanity test only.
      if (!nameMatches(await text(PAGE[ats](slug)).then((h) => (h ? /<title[^>]*>([^<]{0,200})<\/title>/i.exec(h)?.[1] ?? null : null)), name)) continue;
      return { ats, slug, sourceUrl: `${base}${path}` };
    }
  }
  return null;
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await worker(items[idx]);
      }
    }),
  );
  return out;
}

interface YcCompany { name: string; website?: string; industry?: string; team_size?: number; all_locations?: string; status?: string; }

async function startups(limit: number): Promise<Found[]> {
  const data = (await json('https://yc-oss.github.io/api/companies/all.json')) as YcCompany[] | null;
  if (!data) return [];
  const picks = data
    .filter((c) => c.website && (c.status ?? 'Active') === 'Active' && (c.team_size ?? 0) <= 600 && (c.team_size ?? 0) >= 8)
    .slice(0, limit);
  console.log(`[startups] probing ${picks.length} companies`);
  let done = 0;
  const hits = await pool(picks, CONCURRENCY, async (company) => {
    const found = await fromWebsite(company.website!.startsWith('http') ? company.website! : `https://${company.website}`, company.name);
    done += 1;
    if (done % 100 === 0) console.log(`[startups] ${done}/${picks.length}`);
    if (!found) return null;
    const board = await json(ENDPOINT[found.ats](found.slug));
    return {
      name: company.name,
      ats: found.ats,
      slug: found.slug,
      industry: company.industry ?? 'Technology',
      size: (company.team_size ?? 0) < 50 ? 'Small' : (company.team_size ?? 0) < 250 ? 'Midsize' : 'Large',
      hq: (company.all_locations ?? '').match(/\b([A-Z]{2})\b/)?.[1] ?? 'CA',
      via: 'startup-directory' as const,
      postings: board ? countPostings(found.ats, board) : 0,
      sourceUrl: found.sourceUrl,
    };
  });
  return hits.filter(Boolean) as Found[];
}

interface NpOrg { name: string; city?: string; state?: string; ntee_code?: string; income_amount?: number; }

async function nonprofits(limit: number): Promise<Found[]> {
  const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  const perState = Math.max(4, Math.ceil(limit / states.length));
  const orgs: NpOrg[] = [];
  for (const state of states) {
    for (let page = 0; page < 3 && orgs.length < limit + orgs.filter((o) => o.state === state).length; page += 1) {
      const data = (await json(`https://projects.propublica.org/nonprofits/api/v2/search.json?state%5Bid%5D=${state}&page=${page}`)) as { organizations?: NpOrg[] } | null;
      const rows = (data?.organizations ?? []).filter((o) => (o.income_amount ?? 0) > 2_000_000);
      orgs.push(...rows.slice(0, perState));
      if ((data?.organizations ?? []).length < 25) break;
    }
  }
  const unique = new Map(orgs.map((o) => [o.name, o]));
  const picks = [...unique.values()].slice(0, limit);
  console.log(`[nonprofits] probing ${picks.length} organizations`);
  let done = 0;
  const hits = await pool(picks, CONCURRENCY, async (org) => {
    done += 1;
    if (done % 100 === 0) console.log(`[nonprofits] ${done}/${picks.length}`);
    const base = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slugs = [...new Set([base.replace(/-/g, ''), base])].filter((s) => s.length >= 4 && s.length <= 40).slice(0, 2);
    for (const slug of slugs) {
      for (const ats of Object.keys(ENDPOINT) as Vendor[]) {
        const data = await json(ENDPOINT[ats](slug));
        if (!data) continue;
        const postings = countPostings(ats, data);
        if (!postings) continue;
        const pageHtml = await text(PAGE[ats](slug));
        const title = pageHtml ? /<title[^>]*>([^<]{0,200})<\/title>/i.exec(pageHtml)?.[1] ?? null : null;
        if (!nameMatches(title, org.name)) continue;
        const health = /^(E|F|G|H)/.test(org.ntee_code ?? '');
        return {
          name: org.name.replace(/\s+/g, ' ').trim(),
          ats,
          slug,
          industry: health ? 'Healthcare' : 'Nonprofit',
          size: (org.income_amount ?? 0) > 50_000_000 ? 'Large' : 'Midsize',
          hq: org.state ?? 'DC',
          via: 'nonprofit-registry' as const,
          postings,
          sourceUrl: PAGE[ats](slug),
        };
      }
    }
    return null;
  });
  return hits.filter(Boolean) as Found[];
}

async function main(): Promise<void> {
  const startupLimit = Number(process.argv[2] ?? 1400);
  const nonprofitLimit = Number(process.argv[3] ?? 1600);
  const [a, b] = await Promise.all([startups(startupLimit), nonprofits(nonprofitLimit)]);
  const seen = new Set<string>();
  const rows = [...a, ...b].filter((r) => {
    const key = `${r.ats}:${r.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  rows.sort((x, y) => y.postings - x.postings);
  writeFileSync('directory-discovery.json', JSON.stringify(rows, null, 2));
  const states = new Set(rows.map((r) => r.hq));
  console.log(`\n[discovery] ${rows.length} verified boards (${a.length} startups, ${b.length} nonprofits) across ${states.size} states`);
  for (const row of rows.slice(0, 40)) {
    console.log(`  ${row.name.slice(0, 38).padEnd(40)} ${row.ats.padEnd(15)} ${String(row.postings).padStart(4)}  ${row.hq}`);
  }
}

void main();

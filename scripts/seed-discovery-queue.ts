import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { q, pool } from '../server/db';
import { fetchJson } from '../server/engine/http';

/**
 * Feeds the employer discovery queue from public registries. Each refresh then probes a batch of
 * these companies for a Greenhouse / Ashby / Lever / SmartRecruiters / Workable board and adds the
 * ones it finds to the employers table (RULES.md §2: employers' own sites only, no job boards).
 *
 *   tsx scripts/seed-discovery-queue.ts              startups (YC directory, active, 8–600 staff, US)
 *   tsx scripts/seed-discovery-queue.ts --nonprofits  + IRS Exempt Organizations master file,
 *                                                       organisations with $25M+ annual income
 */

interface Candidate { name: string; industry: string; state: string }

const US_STATE = /\b([A-Z]{2}),?\s+(?:USA|United States)\b/;

async function startups(): Promise<Candidate[]> {
  const companies = await fetchJson<{
    name?: string; status?: string; team_size?: number | null; website?: string;
    regions?: string[]; all_locations?: string; industry?: string;
  }[]>('https://yc-oss.github.io/api/companies/all.json', 60_000);
  const out: Candidate[] = [];
  for (const c of companies) {
    if (!c.name || c.status !== 'Active' || !c.website) continue;
    const size = c.team_size ?? 0;
    if (size < 8 || size > 600) continue;
    if (!(c.regions ?? []).includes('United States of America')) continue;
    out.push({ name: c.name, industry: c.industry || 'Software', state: US_STATE.exec(c.all_locations ?? '')?.[1] ?? 'CA' });
  }
  return out;
}

const MIN_NONPROFIT_INCOME = 25_000_000;

function titleCase(raw: string): string {
  return raw.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bInc\b/, 'Inc.');
}

async function nonprofits(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const region of [1, 2, 3, 4]) {
    const res = await fetch(`https://www.irs.gov/pub/irs-soi/eo${region}.csv`, { signal: AbortSignal.timeout(600_000) });
    if (!res.ok || !res.body) throw new Error(`eo${region}.csv ${res.status}`);
    const lines = createInterface({ input: Readable.fromWeb(res.body as never) });
    let header: string[] | null = null;
    for await (const line of lines) {
      const cols = line.split(',');
      if (!header) { header = cols; continue; }
      const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']));
      const income = Number(row.INCOME_AMT || 0);
      if (income < MIN_NONPROFIT_INCOME) continue;
      if (/^X/.test(row.NTEE_CD ?? '')) continue; // religious congregations
      if (!/^[A-Z]{2}$/.test(row.STATE ?? '')) continue;
      out.push({ name: titleCase(row.NAME), industry: 'Nonprofit', state: row.STATE });
    }
    console.log(`eo${region}.csv: ${out.length} candidates so far`);
  }
  return out;
}

async function enqueue(candidates: Candidate[]): Promise<number> {
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const rows = [...byName.values()];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await q(
      `INSERT INTO discovery_queue (name, industry, hq_state)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [batch.map((c) => c.name), batch.map((c) => c.industry), batch.map((c) => c.state)],
    );
    inserted += res.length;
  }
  return inserted;
}

async function main() {
  const yc = await startups();
  console.log(`YC directory: ${yc.length} active US startups with 8–600 staff`);
  let queued = await enqueue(yc);
  if (process.argv.includes('--nonprofits')) {
    const np = await nonprofits();
    console.log(`IRS exempt organisations with $${MIN_NONPROFIT_INCOME / 1e6}M+ income: ${np.length}`);
    queued += await enqueue(np);
  }
  console.log('queued', queued);
  await pool.end();
}
main().catch((err) => { console.error(err); process.exit(1); });

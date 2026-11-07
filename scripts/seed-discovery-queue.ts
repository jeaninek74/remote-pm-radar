import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { q, pool } from '../server/db';
import { fetchJson } from '../server/engine/http';

/**
 * Feeds the employer discovery queue from public registries. Each refresh then probes a batch of
 * these companies for a Greenhouse / Ashby / Lever / SmartRecruiters / Workable board and adds the
 * ones it finds to the employers table (RULES.md §2: employers' own sites only, no job boards).
 *
 *   tsx scripts/seed-discovery-queue.ts               startups (YC directory, active, 8–600 staff, US)
 *   tsx scripts/seed-discovery-queue.ts --nonprofits   + every Form 990 filer in the IRS Exempt
 *                                                        Organizations master file (no income cut)
 *   tsx scripts/seed-discovery-queue.ts --industries   + US companies in every industry the master prompt
 *                                                        names, from Wikipedia's company categories
 *
 * No numeric caps: each source is taken whole. The queue is probed largest-first within the
 * refresh time budget, so the order of arrival here does not matter.
 */

interface Candidate { name: string; industry: string; state: string; size: string }

/** Master-prompt §8 size bands from headcount. */
function sizeFromHeadcount(n: number): string {
  if (n < 50) return 'Startup';
  if (n < 250) return 'Small';
  if (n < 1000) return 'Midsize';
  if (n < 5000) return 'Large';
  return 'Enterprise';
}

/** YC industry / sub-industry → the industry vocabulary of master prompt §7. */
function ycIndustry(industry: string | undefined, sub: string | undefined): string {
  const text = `${industry ?? ''} ${sub ?? ''}`;
  const rules: [RegExp, string][] = [
    [/energy|climate|carbon/i, 'Energy'], [/insurance/i, 'Insurance'], [/banking|lending|payments|credit/i, 'Banking'],
    [/security/i, 'Cybersecurity'], [/infrastructure|devops|cloud/i, 'Cloud Services'], [/marketing|advertising/i, 'Marketing'],
    [/human resources|recruiting|hr/i, 'Human Resources Services'], [/supply chain|logistics/i, 'Logistics'],
    [/construction/i, 'Construction'], [/real estate|housing|proptech/i, 'Real Estate'], [/education/i, 'Education'],
    [/biotech|drug|therapeutic|diagnostic/i, 'Biotechnology'], [/healthcare|medical|health/i, 'Healthcare'],
    [/retail/i, 'Retail'], [/e-?commerce/i, 'E-Commerce'], [/defense|aerospace|drones/i, 'Defense'], [/government/i, 'Government'],
    [/travel|hospitality|food/i, 'Hospitality'], [/media|entertainment|gaming|content/i, 'Entertainment'], [/legal/i, 'Professional Services'],
    [/analytics|ai|machine learning|data/i, 'AI'], [/manufactur|robotics|hardware|industrial/i, 'Manufacturing'],
    [/consumer/i, 'Consumer Products'], [/fintech|finance/i, 'Financial Services'], [/b2b|saas|software|productivity|engineering/i, 'Software'],
  ];
  for (const [re, label] of rules) if (re.test(text)) return label;
  return industry || 'Software';
}

/** IRS NTEE major group → the industry vocabulary of master prompt §7. */
function nteeIndustry(code: string): string {
  const major = (code ?? '').charAt(0).toUpperCase();
  const minor = (code ?? '').slice(0, 3).toUpperCase();
  if (/^B[45]/.test(minor)) return 'Universities';
  if (/^E2/.test(minor)) return 'Hospitals';
  const map: Record<string, string> = {
    A: 'Entertainment', B: 'Education', E: 'Healthcare', F: 'Medical Services', G: 'Medical Services', H: 'Biotechnology',
    I: 'Professional Services', J: 'Workforce Management', L: 'Real Estate', N: 'Events', O: 'Education', T: 'Foundations',
    U: 'Engineering', W: 'Government', Y: 'Insurance', C: 'Environmental Services', D: 'Environmental Services',
  };
  return map[major] ?? 'Nonprofits';
}

const US_STATE = /\b([A-Z]{2}),?\s+(?:USA|United States)\b/;

async function startups(): Promise<Candidate[]> {
  const companies = await fetchJson<{
    name?: string; status?: string; team_size?: number | null; website?: string;
    regions?: string[]; all_locations?: string; industry?: string; subindustry?: string;
  }[]>('https://yc-oss.github.io/api/companies/all.json', 60_000);
  const out: Candidate[] = [];
  for (const c of companies) {
    if (!c.name || c.status !== 'Active' || !c.website) continue;
    const size = c.team_size ?? 0;
    if (size < 8 || size > 600) continue;
    if (!(c.regions ?? []).includes('United States of America')) continue;
    out.push({ name: c.name, industry: ycIndustry(c.industry, c.subindustry), state: US_STATE.exec(c.all_locations ?? '')?.[1] ?? 'CA', size: sizeFromHeadcount(size) });
  }
  return out;
}

/**
 * Master prompt §7 industries → Wikipedia company categories (US). Each category is read whole.
 * The list is "include", never "only": anything found elsewhere keeps whatever industry it has.
 */
const INDUSTRY_CATEGORIES: [string, string[]][] = [
  ['Healthcare', ['Health_care_companies_of_the_United_States', 'Hospital_networks_in_the_United_States']],
  ['Health Insurance', ['Health_insurance_companies_of_the_United_States']],
  ['Medical Services', ['Medical_and_health_organizations_based_in_the_United_States']],
  ['Pharmaceuticals', ['Pharmaceutical_companies_of_the_United_States']],
  ['Biotechnology', ['Biotechnology_companies_of_the_United_States']],
  ['Federal Contracting', ['Defense_contractors_of_the_United_States', 'Government_services_companies_of_the_United_States']],
  ['Defense', ['Defense_companies_of_the_United_States']],
  ['Management Consulting', ['Management_consulting_firms_of_the_United_States', 'Consulting_firms_of_the_United_States']],
  ['IT Consulting', ['Information_technology_consulting_firms_of_the_United_States']],
  ['Engineering', ['Engineering_consulting_firms_of_the_United_States', 'Engineering_companies_of_the_United_States']],
  ['Architecture', ['Architecture_firms_of_the_United_States']],
  ['Advertising', ['Advertising_agencies_of_the_United_States']],
  ['Public Relations', ['Public_relations_companies_of_the_United_States']],
  ['Marketing', ['Marketing_companies_of_the_United_States']],
  ['Communications', ['Mass_media_companies_of_the_United_States']],
  ['Education', ['Education_companies_of_the_United_States']],
  ['Construction', ['Construction_and_civil_engineering_companies_of_the_United_States']],
  ['Real Estate', ['Real_estate_companies_of_the_United_States']],
  ['Property Management', ['Property_management_companies_of_the_United_States']],
  ['Manufacturing', ['Manufacturing_companies_of_the_United_States']],
  ['Logistics', ['Logistics_companies_of_the_United_States']],
  ['Transportation', ['Transport_companies_of_the_United_States']],
  ['Energy', ['Energy_companies_of_the_United_States']],
  ['Renewable Energy', ['Renewable_energy_companies_of_the_United_States']],
  ['Utilities', ['Electric_power_companies_of_the_United_States', 'Water_companies_of_the_United_States']],
  ['Telecommunications', ['Telecommunications_companies_of_the_United_States']],
  ['Retail', ['Retail_companies_of_the_United_States']],
  ['Consumer Products', ['Consumer_goods_companies_of_the_United_States']],
  ['E-Commerce', ['Online_retailers_of_the_United_States']],
  ['Banking', ['Banks_based_in_the_United_States']],
  ['Financial Services', ['Financial_services_companies_of_the_United_States']],
  ['Insurance', ['Insurance_companies_of_the_United_States']],
  ['Software', ['Software_companies_of_the_United_States']],
  ['AI', ['Artificial_intelligence_companies_of_the_United_States']],
  ['Cybersecurity', ['Computer_security_companies_of_the_United_States']],
  ['Cloud Services', ['Cloud_computing_providers']],
  ['Human Resources Services', ['Human_resource_management_consulting_firms', 'Employment_agencies_of_the_United_States']],
  ['Business Process Outsourcing', ['Outsourcing_companies']],
  ['Events', ['Event_management_companies_of_the_United_States']],
  ['Entertainment', ['Entertainment_companies_of_the_United_States']],
  ['Hospitality', ['Hospitality_companies_of_the_United_States']],
  ['Environmental Services', ['Environmental_services_companies_of_the_United_States', 'Waste_management_companies_of_the_United_States']],
];

type CategoryPage = { continue?: { cmcontinue?: string }; query?: { categorymembers?: { title: string }[] } };

/** Wikipedia asks for one request at a time from bots; 429s are backed off, not fatal. */
async function wikipedia(url: string): Promise<CategoryPage> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RemotePMRadar/1.0 (job radar; https://github.com/jeaninek74/remote-pm-radar)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 && attempt < 6) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2_000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`wikipedia ${res.status} ${url}`);
    const data = (await res.json()) as CategoryPage;
    await new Promise((r) => setTimeout(r, 1_000));
    return data;
  }
}

async function industries(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const [industry, categories] of INDUSTRY_CATEGORIES) {
    let count = 0;
    for (const category of categories) {
      let cont: string | undefined;
      do {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${category}&cmlimit=500&cmtype=page&format=json${cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ''}`;
        const data = await wikipedia(url);
        for (const member of data.query?.categorymembers ?? []) {
          const title = member.title;
          if (/^(?:List of|Template:|Category:|Lists of)/.test(title)) continue;
          const name = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
          if (name.length < 3) continue;
          out.push({ name, industry, state: 'US', size: 'Large' });
          count += 1;
        }
        cont = data.continue?.cmcontinue;
      } while (cont);
    }
    console.log(`${industry}: ${count} companies`);
  }
  return out;
}

/** RFC 4180 split: a quoted field may hold commas and doubled quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

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
      const cols = splitCsv(line);
      if (!header) { header = cols; continue; }
      const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']));
      // Employer-scale organisations are the ones the IRS requires to file a full Form 990
      // (FILING_REQ_CD 01); churches and the smallest filers are not employers of PMs.
      if (row.FILING_REQ_CD !== '01') continue;
      if (/^X/.test(row.NTEE_CD ?? '')) continue; // religious congregations
      const income = Number(row.INCOME_AMT || 0);
      if (!/^[A-Z]{2}$/.test(row.STATE ?? '')) continue;
      out.push({ name: titleCase(row.NAME), industry: nteeIndustry(row.NTEE_CD), state: row.STATE, size: income < 5_000_000 ? 'Small' : income < 50_000_000 ? 'Midsize' : income < 500_000_000 ? 'Large' : 'Enterprise' });
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
      `INSERT INTO discovery_queue (name, industry, hq_state, company_size)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (name) DO UPDATE SET industry = EXCLUDED.industry, company_size = EXCLUDED.company_size
       RETURNING (xmax = 0) AS inserted`,
      [batch.map((c) => c.name), batch.map((c) => c.industry), batch.map((c) => c.state), batch.map((c) => c.size)],
    );
    inserted += (res as { inserted: boolean }[]).filter((r) => r.inserted).length;
  }
  // Employers already found from this queue inherit the corrected industry and size.
  await q(`UPDATE employers e SET industry = d.industry, company_size = coalesce(d.company_size, e.company_size)
             FROM discovery_queue d WHERE d.name = e.name AND e.discovered_via = 'Portfolio discovery'`);
  return inserted;
}

async function main() {
  await q(`ALTER TABLE discovery_queue ADD COLUMN IF NOT EXISTS company_size TEXT`);
  const yc = await startups();
  console.log(`YC directory: ${yc.length} active US startups with 8–600 staff`);
  let queued = await enqueue(yc);
  if (process.argv.includes('--nonprofits')) {
    const np = await nonprofits();
    console.log(`IRS Form 990 filers: ${np.length}`);
    queued += await enqueue(np);
  }
  if (process.argv.includes('--industries')) {
    const co = await industries();
    console.log(`industry categories: ${co.length} companies`);
    queued += await enqueue(co);
  }
  console.log('queued', queued);
  await pool.end();
}
main().catch((err) => { console.error(err); process.exit(1); });

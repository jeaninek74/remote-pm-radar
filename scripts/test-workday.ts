import { q, pool } from '../server/db';

function parseWorkday(url: string): { tenant: string; wd: string; site: string } | null {
  const m = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i.exec(url);
  if (!m) return null;
  return { tenant: m[1].toLowerCase(), wd: m[2], site: m[3] };
}

async function search(tenant: string, wd: string, site: string, text: string) {
  const res = await fetch(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<{ total?: number; jobPostings?: { title: string; externalPath: string; locationsText?: string }[] }>;
}

async function main() {
  const rows = await q<{ name: string; careers_url: string }>(
    `SELECT name, careers_url FROM employers WHERE careers_url ILIKE '%myworkdayjobs%' ORDER BY name LIMIT 40`);
  console.log('workday employers in registry:', rows.length);
  let ok = 0;
  for (const row of rows) {
    const p = parseWorkday(row.careers_url);
    if (!p) { console.log('  unparsed', row.name, row.careers_url); continue; }
    try {
      const d = await search(p.tenant, p.wd, p.site, 'project manager');
      const titles = (d.jobPostings ?? []).slice(0, 2).map((j) => j.title).join(' / ');
      console.log(`ok  ${row.name.padEnd(34)} ${p.tenant}/${p.site} total=${d.total} :: ${titles}`);
      ok += 1;
    } catch (err) {
      console.log(`ERR ${row.name.padEnd(34)} ${p.tenant}/${p.site} ${(err as Error).message}`);
    }
  }
  console.log(`worked: ${ok}/${rows.length}`);
  await pool.end();
}
void main();

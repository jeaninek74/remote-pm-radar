import { q, pool } from '../server/db';
import { fetchJson } from '../server/engine/http';

async function main() {
  const names = new Map<string, { industry: string; state: string }>();
  for (let page = 1; page <= 80; page += 1) {
    const d = await fetchJson<{ companies?: { name?: string; location?: string; industries?: string[] }[] }>(
      `https://api.ycombinator.com/v0.1/companies?page=${page}&limit=100`,
      15000,
    );
    const batch = d.companies ?? [];
    if (!batch.length) break;
    for (const c of batch) {
      if (!c.name) continue;
      const st = /(?:^|,\s*)([A-Z]{2})\b/.exec(c.location ?? '')?.[1] ?? 'CA';
      names.set(c.name, { industry: c.industries?.[0] ?? 'Software', state: st });
    }
  }
  console.log('directory companies:', names.size);
  let inserted = 0;
  for (const [name, meta] of names) {
    const res = await q(`INSERT INTO discovery_queue (name, industry, hq_state) VALUES ($1,$2,$3)
                         ON CONFLICT (name) DO NOTHING RETURNING id`, [name, meta.industry, meta.state]);
    inserted += res.length;
  }
  console.log('queued', inserted);
  await pool.end();
}
main();

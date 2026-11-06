import { appendFileSync, writeFileSync } from 'node:fs';
import { q, pool } from '../server/db';

/**
 * Resolve the real Workday tenant/site for tracked employers.
 *
 * We store the corporate careers landing page. Large employers redirect that page to Workday
 * (or link to it), which exposes a public JSON API at
 *   https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 * This script follows each careers link and extracts the Workday coordinates so the refresh can
 * read those boards instead of only linking to them.
 */

const WORKDAY_URL = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^"'?#\s/]+)/i;

async function resolve(careersUrl: string): Promise<{ tenant: string; wd: string; site: string } | null> {
  try {
    const res = await fetch(careersUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemotePMRadar/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    const finalUrl = res.url ?? careersUrl;
    const direct = WORKDAY_URL.exec(finalUrl);
    if (direct) return { tenant: direct[1].toLowerCase(), wd: direct[2], site: direct[3] };
    const html = (await res.text()).slice(0, 400_000);
    const embedded = WORKDAY_URL.exec(html);
    if (embedded) return { tenant: embedded[1].toLowerCase(), wd: embedded[2], site: embedded[3] };
    return null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const rows = await q<{ id: number; name: string; careers_url: string }>(
    `SELECT id, name, careers_url FROM employers
      WHERE careers_url IS NOT NULL AND ats = 'manual'
      ORDER BY name`,
  );
  console.log(`resolving ${rows.length} tracked careers links`);
  writeFileSync('/tmp/workday-resolved.tsv', '');
  let found = 0;

  const queue = [...rows];
  await Promise.all(Array.from({ length: 14 }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const hit = await resolve(row.careers_url);
      if (hit) {
        found += 1;
        await q(`UPDATE employers SET careers_url = $2 WHERE id = $1`,
          [row.id, `https://${hit.tenant}.${hit.wd}.myworkdayjobs.com/${hit.site}`]);
        appendFileSync('/tmp/workday-resolved.tsv', `${row.name}\t${hit.tenant}\t${hit.wd}\t${hit.site}\n`);
        console.log(`workday  ${row.name.padEnd(34)} ${hit.tenant}/${hit.site}`);
      }
    }
  }));

  console.log(`resolved ${found}/${rows.length} to Workday`);
  await pool.end();
}

void main().catch((err) => { console.error(err); process.exit(1); });

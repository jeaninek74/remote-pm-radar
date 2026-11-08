import { readFileSync, writeFileSync } from 'node:fs';
import { resolveBoard } from '../server/engine/resolve';

interface SeedCandidate {
  name: string;
  website: string;
  ats: 'ukg' | 'taleo' | 'successfactors' | 'neogov';
  board: string;
}

const INPUT = '/home/ubuntu/ats-probe/seed-candidates.json';
const OUTPUT = '/home/ubuntu/ats-probe/resolve-dry-run.jsonl';

function candidateUrl(candidate: SeedCandidate): string {
  if (candidate.ats === 'ukg') {
    const [host, tenant, guid] = candidate.board.split('/');
    return `https://${host}/${tenant}/JobBoard/${guid}`;
  }
  if (candidate.ats === 'taleo') {
    const [host, section] = candidate.board.split('/');
    return `https://${host}/careersection/${section}/jobsearch.ftl?lang=en`;
  }
  if (candidate.ats === 'neogov') {
    const [host, folder] = candidate.board.split('/');
    return `https://${host}/careers/${folder}`;
  }
  const url = new URL(`https://${candidate.board}`);
  url.pathname = '/career';
  url.searchParams.set('career_ns', 'job_listing_summary');
  url.searchParams.set('navBarLevel', 'JOB_SEARCH');
  url.searchParams.set('lang', 'en_US');
  return url.toString();
}

async function resolveOne(candidate: SeedCandidate) {
  try {
    const result = await resolveBoard(candidate.name, candidateUrl(candidate), Date.now() + 30_000);
    return {
      name: candidate.name,
      ats: result.kind === 'board' ? result.ats : candidate.ats,
      slug: result.kind === 'board' ? result.slug : null,
      reason: result.kind === 'board' ? null : result.kind === 'unreadable' ? result.platform : result.reason,
    };
  } catch (error) {
    return { name: candidate.name, ats: candidate.ats, slug: null, reason: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const candidates = JSON.parse(readFileSync(INPUT, 'utf8')) as SeedCandidate[];
  const rows: Awaited<ReturnType<typeof resolveOne>>[] = new Array(candidates.length);
  let next = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (next < candidates.length) {
      const index = next++;
      rows[index] = await resolveOne(candidates[index]);
    }
  });
  await Promise.all(workers);
  writeFileSync(OUTPUT, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.ats] = (result[row.ats] ?? 0) + 1;
    if (row.slug) result.resolved = (result.resolved ?? 0) + 1;
    else result.unresolved = (result.unresolved ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ output: OUTPUT, total: rows.length, ...counts }, null, 2));
}

void main();

import { fetchJson } from '../server/engine/http';
import { stripHtml } from '../server/engine/text';
import { parseSalaryFromText, classifySalary } from '../server/engine/salary';
import { evaluateLocation } from '../server/engine/location';

async function main(): Promise<void> {
  const board = await fetchJson<{ jobs: { id: number; title: string }[] }>(
    'https://boards-api.greenhouse.io/v1/boards/reddit/jobs?content=false',
  );
  const targets = board.jobs.filter((j) => /program manager/i.test(j.title)).slice(0, 4);
  for (const target of targets) {
    const detail = await fetchJson<{ content?: string; title: string }>(
      `https://boards-api.greenhouse.io/v1/boards/reddit/jobs/${target.id}`,
    );
    const text = stripHtml(detail.content ?? '');
    const parsed = parseSalaryFromText(text, 'Greenhouse detail');
    const idx = text.toLowerCase().indexOf('base salary range');
    console.log('\n===', target.title);
    console.log('content chars:', (detail.content ?? '').length, '| stripped chars:', text.length);
    console.log('pay section:', JSON.stringify(text.slice(Math.max(0, idx - 40), idx + 200)));
    console.log('parsed:', JSON.stringify(parsed));
    if (parsed?.min) console.log('classify:', classifySalary(parsed.min, parsed.max, parsed.interval));
    console.log('location verdict:', evaluateLocation({ locations: ['Remote - United States'], description: text }));
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

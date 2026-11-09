import { REFRESH } from '../server/config';
import {
  haleyPostingLink,
  haleyRoleLinks,
  haleySitemapJobs,
  normalizeHaleySitemapUrl,
  parseHaleySitemapXml,
} from '../server/engine/haley';
import { resolveBoard, detect } from '../server/engine/resolve';
import { fetchBoard } from '../server/engine/sources';
import { parseZenopleJson } from '../server/engine/zenople';
import type { Ats, EmployerRow } from '../server/engine/types';

let failures = 0;

function check(label: string, passed: boolean): void {
  if (passed) console.log(`PASS ${label}`);
  else {
    console.error(`FAIL ${label}`);
    failures += 1;
  }
}

function employer(ats: Ats, slug: string, name: string, careersUrl: string | null = null): EmployerRow {
  return {
    id: -1,
    ats,
    slug,
    name,
    industry: null,
    company_size: null,
    hq_state: null,
    careers_url: careersUrl,
    black_owned: false,
    ownership_status: 'Not researched',
    ownership_source: null,
    last_searched_at: null,
    last_resolve_at: null,
    active: true,
  };
}

async function main(): Promise<void> {
  const sampleUrl = 'https://jobs.example.com/jb/Molding-Operator-2nd-Shift-Jobs-in-Dallas-North-Carolina/14174583';
  const sample = haleyPostingLink(sampleUrl);
  check('Haley URL slug yields title and numeric id', sample?.title === 'Molding Operator 2nd Shift' && sample.id === '14174583');

  const sitemapIndex = parseHaleySitemapXml(
    '<sitemapindex><sitemap><loc>http://jobs.example.com/jobs-a.xml</loc></sitemap><sitemap><loc>https://jobs.example.com/jobs-b.xml</loc></sitemap></sitemapindex>',
  );
  check('Haley sitemap index exposes child maps', sitemapIndex.kind === 'sitemapindex'
    && sitemapIndex.locations.length === 2
    && sitemapIndex.locations[0] === 'http://jobs.example.com/jobs-a.xml');
  const unsafeSitemapIndex = parseHaleySitemapXml(
    '<sitemapindex><sitemap><loc>http://169.254.169.254/latest/meta-data/</loc></sitemap></sitemapindex>',
  );
  check('Haley drops an IP-literal sitemap child',
    normalizeHaleySitemapUrl(unsafeSitemapIndex.locations[0], 'https://jobs.atwork.com/sitemap.xml', 'jobs.atwork.com') === null);
  const unsafePostingSitemap = parseHaleySitemapXml(
    '<urlset><url><loc>https://evil.example.org/jb/Manager-Jobs-in-Town-State/123</loc></url></urlset>',
  );
  check('Haley drops a posting URL on an unrelated domain',
    normalizeHaleySitemapUrl(unsafePostingSitemap.locations[0], 'https://jobs.atwork.com/jobs.xml', 'jobs.atwork.com') === null);
  const atworkPostingSitemap = parseHaleySitemapXml(
    '<urlset><url><loc>http://sacramento-jobs.atwork.com/jb/Manager-Jobs-in-Sacramento-California/123</loc></url></urlset>',
  );
  check('Haley keeps an AtWork city-subdomain posting',
    normalizeHaleySitemapUrl(atworkPostingSitemap.locations[0], 'https://jobs.atwork.com/jobs.xml', 'jobs.atwork.com')
      === 'https://sacramento-jobs.atwork.com/jb/Manager-Jobs-in-Sacramento-California/123');

  const doubleEncoded = JSON.stringify(JSON.stringify({ TotalCount: 31, Data: [{ jobId: 782971 }] }));
  const zenopleParsed = parseZenopleJson(doubleEncoded) as { TotalCount?: number; Data?: { jobId?: number }[] };
  check('Zenople double-encoded JSON parses twice', zenopleParsed.TotalCount === 31 && zenopleParsed.Data?.[0]?.jobId === 782971);

  const haleyDetection = detect(
    '<script src="https://cdn.haleymarketing.com/assets/board.js"></script><a href="https://jobs.penmac.com/">Jobs</a>',
    'https://www.penmac.com/',
  );
  check('Haley CDN signature identifies linked job-board host',
    haleyDetection.kind === 'board' && haleyDetection.ats === 'haley' && haleyDetection.slug === 'jobs.penmac.com');
  const zenopleDetection = detect('', 'https://laborworks.zenople.com/job-portal/LBW');
  check('Zenople portal URL yields tenant and organization',
    zenopleDetection.kind === 'board' && zenopleDetection.ats === 'zenople' && zenopleDetection.slug === 'laborworks/LBW');
  check('Zenople ESG Azure variant is ignored',
    detect('', 'https://laborworks.zenople.esgazure.com/job-portal/LBW').kind !== 'board');
  const leverDetection = detect(
    '<a href="https://jobs.lever.co/acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Lever link keeps existing ATS detection priority',
    leverDetection.kind === 'board' && leverDetection.ats === 'lever');
  const ashbyDetection = detect(
    '<a href="https://jobs.ashbyhq.com/acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Ashby link keeps existing ATS detection priority',
    ashbyDetection.kind === 'board' && ashbyDetection.ats === 'ashby');
  const smartRecruitersDetection = detect(
    '<a href="https://careers.smartrecruiters.com/Acme">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('SmartRecruiters link keeps existing ATS detection priority',
    smartRecruitersDetection.kind === 'board' && smartRecruitersDetection.ats === 'smartrecruiters');
  const unrelatedJobHost = detect(
    '<a href="https://jobs.example.org/">Jobs</a>',
    'https://www.acme.com/careers',
  );
  check('Haley fallback ignores an unrelated jobs host',
    unrelatedJobHost.kind !== 'board' || unrelatedJobHost.ats !== 'haley');
  const penmacLink = detect(
    '<a href="https://jobs.penmac.com/">Jobs</a>',
    'https://www.penmac.com/',
  );
  check('Haley fallback accepts a job host on the same registrable domain',
    penmacLink.kind === 'board' && penmacLink.ats === 'haley' && penmacLink.slug === 'jobs.penmac.com');

  const haleyBoards = [
    { host: 'jobs.penmac.com', name: 'Penmac' },
    { host: 'jobs.doherty.com', name: 'Doherty' },
    { host: 'jobs.atwork.com', name: 'AtWork' },
  ];
  for (const board of haleyBoards) {
    const company = employer('haley', board.host, board.name, `https://${board.host}/`);
    const [sitemap, result] = await Promise.all([
      haleySitemapJobs(board.host, Date.now() + REFRESH.employerBudgetMs),
      fetchBoard(company),
    ]);
    const titleMatched = haleyRoleLinks(sitemap.urls, company).length;
    check(`Haley ${board.host} read succeeds`, result.ok);
    check(`Haley ${board.host} lists sitemap URLs`, result.ok && result.totalListed === sitemap.urls.length && result.totalListed > 0);
    check(`Haley ${board.host} has title matches`, titleMatched > 0);
    const rawJob = result.jobs.find((job) => job.postedAt && job.locations.length);
    check(`Haley ${board.host} sample has postedAt and location`, !!rawJob);
    console.log(`LIVE haley ${board.host} totalListed=${result.totalListed} titleMatched=${titleMatched} detailRead=${result.jobs.length} truncated=${result.truncated === true}`);
    if (rawJob) {
      console.log(`SAMPLE haley ${board.host} ${JSON.stringify({
        source: rawJob.source,
        ats: rawJob.ats,
        board: rawJob.board,
        externalId: rawJob.externalId,
        company: rawJob.company,
        title: rawJob.title,
        locations: rawJob.locations,
        postedAt: rawJob.postedAt,
        applyUrl: rawJob.applyUrl,
        salary: rawJob.salary,
      })}`);
    }
  }

  const zenopleBoards = [
    { tenant: 'laborworks', organization: 'LBW', name: 'LaborWorks' },
    { tenant: 'beginright', organization: 'BR', name: 'Begin Right' },
    { tenant: 'gillmann', organization: 'GL', name: 'Gillmann Services' },
  ];
  for (const board of zenopleBoards) {
    const slug = `${board.tenant}/${board.organization}`;
    const result = await fetchBoard(employer('zenople', slug, board.name, `https://${board.tenant}.zenople.com/job-portal/${board.organization}`));
    check(`Zenople ${slug} read succeeds`, result.ok);
    check(`Zenople ${slug} reads TotalCount`, result.ok && result.uniqueRead === result.totalListed && !result.truncated);
    console.log(`LIVE zenople ${slug} totalListed=${result.totalListed} totalRead=${result.uniqueRead ?? 0} titleMatched=${result.jobs.length} truncated=${result.truncated === true}`);
  }

  const resolverChecks = [
    { name: 'Penmac', url: 'https://www.penmac.com/', ats: 'haley' as const, slug: 'jobs.penmac.com' },
    { name: 'Doherty', url: 'https://www.doherty.com/', ats: 'haley' as const, slug: 'jobs.doherty.com' },
    { name: 'LaborWorks', url: 'https://laborworks.com/', ats: 'zenople' as const, slug: 'laborworks/LBW' },
    { name: 'Begin Right', url: 'https://beginright.com/', ats: 'zenople' as const, slug: 'beginright/BR' },
  ];
  for (const expected of resolverChecks) {
    const result = await resolveBoard(expected.name, expected.url, Date.now() + 45_000);
    const passed = result.kind === 'board' && result.ats === expected.ats && result.slug === expected.slug;
    check(`Resolver ${expected.url} -> ${expected.ats}:${expected.slug}`, passed);
    console.log(`LIVE resolver ${expected.url} ${JSON.stringify(result)}`);
  }

  if (failures) {
    console.error(`FAILED ${failures} staffing-board check(s)`);
    process.exitCode = 1;
  } else {
    console.log('All staffing-board checks passed.');
  }
}

void main();

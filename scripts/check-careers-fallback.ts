import {
  candidatePostingLinks,
  looksLikePostingPage,
  postingPathFromUrl,
  sameCareersPostingSet,
} from '../server/engine/careers';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

const links = candidatePostingLinks(
  '<a href="/jobs/req-123456">Registered Nurse</a><a href="/about">About us</a>',
  'https://example.com/careers',
);
check('fallback considers non-target job links', links.some((link) => link.text === 'Registered Nurse'));
check('fallback ignores unrelated links', !links.some((link) => link.url.endsWith('/about')));
check(
  'posting-page heuristic recognizes a requisition with a role title',
  looksLikePostingPage('https://example.com/job/req-123456', 'Nurse Manager'),
);
check(
  'posting-page heuristic rejects a category page',
  !looksLikePostingPage('https://example.com/jobs/req-123456', 'Project Management Jobs'),
);
check(
  'posting-page heuristic rejects a student-employment guide',
  !looksLikePostingPage('https://example.com/Article/709/Supervisor-Guide-to-Student-Employment', 'Supervisor Guide'),
);
check(
  'posting-page heuristic rejects a downloadable job description',
  !looksLikePostingPage('https://example.com/job/req-123456.pdf', 'Project Manager'),
);

const sharedPostingSets = [
  ['https://uvmhealth.org/job/12625/patient-service-specialist?location=VT'],
  ['https://cvmc.org/job/12625/patient-service-specialist?location=VT'],
  ['https://portermedical.org/job/12625/patient-service-specialist?location=VT'],
].map((urls) => urls.map(postingPathFromUrl).sort());
check(
  'posting path strips the host and keeps the query',
  sharedPostingSets[0][0] === '/job/12625/patient-service-specialist?location=VT',
);
const claimedSharedPostingSets: string[][] = [];
for (const postingPaths of sharedPostingSets) {
  if (!claimedSharedPostingSets.some((claimed) => sameCareersPostingSet(claimed, postingPaths))) {
    claimedSharedPostingSets.push(postingPaths);
  }
}
check('three hosts with the same posting path deduplicate to one insert', claimedSharedPostingSets.length === 1);

const distinctPostingSets = [
  ['https://employer-a.example/job/12625/project-manager'],
  ['https://employer-b.example/job/88201/program-director'],
].map((urls) => urls.map(postingPathFromUrl).sort());
const claimedDistinctPostingSets: string[][] = [];
for (const postingPaths of distinctPostingSets) {
  if (!claimedDistinctPostingSets.some((claimed) => sameCareersPostingSet(claimed, postingPaths))) {
    claimedDistinctPostingSets.push(postingPaths);
  }
}
check('two hosts with different postings remain eligible for inserts', claimedDistinctPostingSets.length === 2);
check(
  'posting sets match at half overlap with the same first path',
  sameCareersPostingSet(['/a', '/b', '/c'], ['/a', '/b', '/d', '/e']),
);
check(
  'posting sets below half overlap remain distinct',
  !sameCareersPostingSet(['/a', '/b', '/c'], ['/a', '/d', '/e']),
);

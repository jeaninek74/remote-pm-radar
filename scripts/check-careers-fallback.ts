import { candidatePostingLinks, looksLikePostingPage } from '../server/engine/careers';

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

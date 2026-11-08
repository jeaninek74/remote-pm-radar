import { createHash } from 'node:crypto';
import {
  candidatePostingLinks,
  looksLikePostingPage,
  postingPathFromUrl,
  sameCareersPostingSet,
  sweepCareersPostingLinks,
} from '../server/engine/careers';
import { careersSlug, normalizedCareersUrl } from './expansion-urls';

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
check('careers URL keys preserve and sort query parameters',
  normalizedCareersUrl('https://employment.unl.edu/postings/search?campus=B&query=x')
    === normalizedCareersUrl('https://employment.unl.edu/postings/search?query=x&campus=B')
    && normalizedCareersUrl('https://employment.unl.edu/postings/search?campus=A')
      !== normalizedCareersUrl('https://employment.unl.edu/postings/search?campus=B'));
check('query-specific careers slugs remain distinct',
  careersSlug('https://employment.unl.edu/postings/search?campus=A')
    !== careersSlug('https://employment.unl.edu/postings/search?campus=B'));
const longSortedQuery = `campus=${'a'.repeat(130)}&query=x`;
const longQueryUrl = `https://employment.unl.edu/postings/search?query=x&campus=${'a'.repeat(130)}`;
const expectedLongSlug = `employment.unl.edu/postings/search?q=${createHash('sha1').update(longSortedQuery).digest('hex').slice(0, 10)}`;
check('long careers slugs hash the sorted query',
  careersSlug(longQueryUrl) === expectedLongSlug && careersSlug(longQueryUrl).length <= 120);
const sweepLinks = sweepCareersPostingLinks(
  '<a href="/jobs/req-123456">View job</a><a href="/jobs/req-123457">Apply now</a><a href="/jobs/req-123458"></a><a href="/about">Details</a><a href="/jobs/req-123459">Unrelated page</a>',
  'https://example.com/careers',
);
check('sweep reader accepts generic-label posting links', sweepLinks.length === 3
  && sweepLinks.some((link) => link.text === 'View job')
  && sweepLinks.some((link) => link.text === 'Apply now')
  && sweepLinks.some((link) => link.text === ''));
check('sweep reader rejects generic non-job links and non-role titles', !sweepLinks.some((link) => link.url.endsWith('/about') || link.url.endsWith('123459')));
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
  [
    'https://uvmhealth.org/job/12625/patient-service-specialist?location=VT',
    'https://uvmhealth.org/job/12626/nurse-manager?location=VT',
    'https://uvmhealth.org/job/12627/clinic-coordinator?location=VT',
  ],
  [
    'https://cvmc.org/job/12625/patient-service-specialist?location=VT',
    'https://cvmc.org/job/12626/nurse-manager?location=VT',
    'https://cvmc.org/job/12627/clinic-coordinator?location=VT',
  ],
  [
    'https://portermedical.org/job/12625/patient-service-specialist?location=VT',
    'https://portermedical.org/job/12626/nurse-manager?location=VT',
    'https://portermedical.org/job/12627/clinic-coordinator?location=VT',
  ],
].map((urls) => urls.map(postingPathFromUrl).sort());
const postingIdentitiesForPaths = (paths: string[], title?: string) => paths.map((path) => ({
  path,
  title: title ?? path.split('?')[0].split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') ?? '',
}));
check(
  'posting path strips the host and keeps the query',
  sharedPostingSets[0][0] === '/job/12625/patient-service-specialist?location=VT',
);
const claimedSharedPostingSets: { paths: string[]; identities: ReturnType<typeof postingIdentitiesForPaths> }[] = [];
for (const postingPaths of sharedPostingSets) {
  const identities = postingIdentitiesForPaths(postingPaths);
  if (!claimedSharedPostingSets.some((claimed) =>
    sameCareersPostingSet(claimed.paths, postingPaths, claimed.identities, identities))) {
    claimedSharedPostingSets.push({ paths: postingPaths, identities });
  }
}
check('three hosts with the same posting path deduplicate to one insert', claimedSharedPostingSets.length === 1);

const singlePostingMirrors = [
  ['/job/12625/patient-service-specialist'],
  ['/job/12625/patient-service-specialist'],
];
const claimedSinglePostingMirrors: { paths: string[]; identities: ReturnType<typeof postingIdentitiesForPaths> }[] = [];
for (const [index, postingPaths] of singlePostingMirrors.entries()) {
  const identities = postingIdentitiesForPaths(postingPaths, index === 0
    ? 'Patient Service Specialist'
    : ' patient service specialist ');
  if (!claimedSinglePostingMirrors.some((claimed) =>
    sameCareersPostingSet(claimed.paths, postingPaths, claimed.identities, identities))) {
    claimedSinglePostingMirrors.push({ paths: postingPaths, identities });
  }
}
check('two mirrors with the same single posting deduplicate to one insert', claimedSinglePostingMirrors.length === 1);

const sharedPathsDifferentTitleIdentities = [
  [
    { path: '/jobs/1', title: 'Project Manager' },
    { path: '/jobs/2', title: 'Data Analyst' },
  ],
  [
    { path: '/jobs/1', title: 'Nurse Manager' },
    { path: '/jobs/2', title: 'Recruiter' },
  ],
];
const claimedSharedPathsDifferentTitles: { paths: string[]; identities: typeof sharedPathsDifferentTitleIdentities[number] }[] = [];
for (const identities of sharedPathsDifferentTitleIdentities) {
  const paths = identities.map((identity) => identity.path);
  if (!claimedSharedPathsDifferentTitles.some((claimed) =>
    sameCareersPostingSet(claimed.paths, paths, claimed.identities, identities))) {
    claimedSharedPathsDifferentTitles.push({ paths, identities });
  }
}
check('two hosts sharing two paths with different titles both insert', claimedSharedPathsDifferentTitles.length === 2);

const singlePathDifferentTitleIdentities = [
  postingIdentitiesForPaths(['/jobs/1'], 'Project Manager'),
  postingIdentitiesForPaths(['/jobs/1'], 'Nurse Manager'),
];
const claimedSinglePathDifferentTitles: { paths: string[]; identities: ReturnType<typeof postingIdentitiesForPaths> }[] = [];
for (const identities of singlePathDifferentTitleIdentities) {
  const paths = identities.map((identity) => identity.path);
  if (!claimedSinglePathDifferentTitles.some((claimed) =>
    sameCareersPostingSet(claimed.paths, paths, claimed.identities, identities))) {
    claimedSinglePathDifferentTitles.push({ paths, identities });
  }
}
check('two hosts with the same posting path and different titles both insert',
  claimedSinglePathDifferentTitles.length === 2);

const untitledSingleMirrors = [
  postingIdentitiesForPaths(['/jobs/1'], ''),
  postingIdentitiesForPaths(['/jobs/1'], ''),
];
const claimedUntitledSingleMirrors: { paths: string[]; identities: ReturnType<typeof postingIdentitiesForPaths> }[] = [];
for (const identities of untitledSingleMirrors) {
  const paths = identities.map((identity) => identity.path);
  if (!claimedUntitledSingleMirrors.some((claimed) =>
    sameCareersPostingSet(claimed.paths, paths, claimed.identities, identities))) {
    claimedUntitledSingleMirrors.push({ paths, identities });
  }
}
check('untitled single-posting mirrors with the same path deduplicate to one insert',
  claimedUntitledSingleMirrors.length === 1);

const sharedNotFirstSets = [
  ['/job/001/project-manager', '/job/200/nurse-manager', '/job/300/analyst'],
  ['/job/002/project-coordinator', '/job/200/nurse-manager', '/job/300/analyst'],
];
check('shared paths deduplicate even when not alphabetically first',
  sameCareersPostingSet(sharedNotFirstSets[0], sharedNotFirstSets[1]));

const oneAgainstManySets = [
  ['/job/12625/project-manager'],
  ['/job/12625/project-manager', '/job/12626/nurse-manager', '/job/12627/analyst'],
];
const claimedOneAgainstMany: string[][] = [];
for (const postingPaths of oneAgainstManySets) {
  if (!claimedOneAgainstMany.some((claimed) => sameCareersPostingSet(claimed, postingPaths))) {
    claimedOneAgainstMany.push(postingPaths);
  }
}
check('a one-posting site and a larger site sharing it both insert', claimedOneAgainstMany.length === 2);

const distinctPostingSets = [
  ['/job/100/project-manager', '/job/101/analyst'],
  ['/job/88201/program-director', '/job/88202/coordinator'],
];
const claimedDistinctPostingSets: string[][] = [];
for (const postingPaths of distinctPostingSets) {
  if (!claimedDistinctPostingSets.some((claimed) => sameCareersPostingSet(claimed, postingPaths))) {
    claimedDistinctPostingSets.push(postingPaths);
  }
}
check('two hosts with different postings remain eligible for inserts', claimedDistinctPostingSets.length === 2);

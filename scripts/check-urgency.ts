import assert from 'node:assert/strict';
import { compareJobsByPostedDate } from '../client/src/job-sort';
import { evaluateRaw } from '../server/engine/ingest';
import { detectUrgency } from '../server/engine/urgency';

const positiveCases = [
  ['Ryder immediately hiring', 'We are immediately hiring a Warehouse Operations Manager'],
  ['Dentsu ASAP deadline', '**TEMP W2 ... **ASAP – 5/31/2027**. This contract role is for an experienced program manager.'],
  ['hiring now', 'The company is hiring now for a senior project manager to lead a major program.'],
  ['now hiring', 'Now hiring a program manager to coordinate delivery across the operations team.'],
  ['immediate hire', 'This is an immediate hire for an experienced program manager on a growing team.'],
  ['immediate hiring', 'We have immediate hiring needs for a senior project manager in our operations group.'],
  ['immediate availability', 'Immediate availability is needed for this senior program manager position.'],
  ['immediate openings', 'Immediate openings are available for project managers supporting a new rollout.'],
  ['urgent need', 'The team has an urgent need for a program manager to support an active project.'],
  ['urgently needed', 'A project manager is urgently needed to support the upcoming system rollout.'],
  ['urgent requirement', 'There is an urgent requirement for a senior program manager on this team.'],
  ['urgent hire', 'This is an urgent hire for a project manager with experience leading implementations.'],
  ['urgent opening', 'The company has an urgent opening for a program manager to lead project delivery.'],
  ['urgent role', 'This urgent role is for a project manager supporting a high-priority client program.'],
  ['urgent position', 'The organization has an urgent position for a senior program manager on its team.'],
  ['start date ASAP', 'Start date: ASAP for this senior program manager role supporting a new initiative.'],
  ['start immediately', 'Start: Immediately for this project manager position on the delivery team.'],
  ['starting ASAP', 'The starting date should be ASAP for this experienced program manager position.'],
  ['begin ASAP', 'Begin within 10 days ASAP for this project manager role supporting the rollout.'],
  ['ASAP through date', 'The temporary program manager contract runs ASAP through 5/31/2027.'],
  ['ASAP until date', 'This project manager contract is open ASAP until May 31, 2027.'],
].map(([label, text]) => ({ label, text }));

for (const { label, text } of positiveCases) {
  assert.equal(detectUrgency(text).level, 'High', `${label} should be High`);
}

const negativeCases = [
  'The urgent care program supports physicians and patients across the region.',
  'The immediate supervisor provides coaching to project team members.',
  'Immediate family benefits are available to full-time employees after enrollment.',
  'Please report immediately to the office when the emergency alarm is activated.',
  'Creating an immediate opportunity to mentor emerging managers is part of this role.',
];

for (const text of negativeCases) {
  assert.notEqual(detectUrgency(text).level, 'High', `${text} should not be High`);
}

const titleUrgency = evaluateRaw({
  source: 'urgency-check',
  externalId: 'immediate-hire-title',
  company: 'Urgency Check Employer',
  title: 'Program Manager - Immediate Hire',
  locations: ['Remote, US'],
  descriptionText: 'This program manager will coordinate a long-term project delivery effort across teams.',
  applyUrl: 'https://example.com/jobs/program-manager',
  linkType: 'employer',
  postedAt: new Date().toISOString().slice(0, 10),
  postedConfidence: 'confirmed',
});
assert.equal(titleUrgency?.urgency, 'High', 'urgency wording in the title should be detected');

const ordered = [
  { id: 'old-post', postedAt: '2026-01-01', firstSeenAt: '2026-08-01' },
  { id: 'no-post-recently-seen', postedAt: null, firstSeenAt: '2026-09-01' },
  { id: 'same-post-old-seen', postedAt: '2026-03-01', firstSeenAt: '2026-02-01' },
  { id: 'new-post', postedAt: '2026-04-01', firstSeenAt: '2026-01-01' },
  { id: 'same-post-new-seen', postedAt: '2026-03-01', firstSeenAt: '2026-04-01' },
  { id: 'no-post-no-seen', postedAt: null, firstSeenAt: null },
].sort(compareJobsByPostedDate);

assert.deepEqual(ordered.map((job) => job.id), [
  'new-post',
  'same-post-new-seen',
  'same-post-old-seen',
  'old-post',
  'no-post-recently-seen',
  'no-post-no-seen',
]);

console.log(`Passed ${positiveCases.length} positive urgency cases, ${negativeCases.length} negative cases, title detection, and posted-date ordering.`);

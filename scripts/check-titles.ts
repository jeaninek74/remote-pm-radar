import { isPmTitle } from '../server/engine/titles';
import { MASTER_PROMPT_NONTECHNICAL_TITLES, MASTER_PROMPT_TECHNICAL_TITLES } from '../server/engine/roles/families/project-management';

/** The master-prompt title lists live in the role family so they are also searched verbatim. */
const NONTECH = MASTER_PROMPT_NONTECHNICAL_TITLES;

const TECHNICAL = MASTER_PROMPT_TECHNICAL_TITLES;

const misses = NONTECH.filter((title) => !isPmTitle(title));
const techMisses = TECHNICAL.filter((title) => !isPmTitle(title));

console.log(`nontechnical recognised: ${NONTECH.length - misses.length}/${NONTECH.length}`);
if (misses.length) console.log('  MISSED:', misses.join(' | '));
console.log(`technical recognised: ${TECHNICAL.length - techMisses.length}/${TECHNICAL.length}`);
if (techMisses.length) console.log('  MISSED:', techMisses.join(' | '));

// Non-PM roles must stay out.
const mustReject = [
  'Software Engineer', 'Registered Nurse', 'Account Executive', 'Data Scientist',
  'Product Manager', 'Office Manager', 'Account Manager', 'Sales Manager', 'Engineering Manager',
];
const wrong = mustReject.filter((title) => isPmTitle(title));
console.log(`correctly rejected: ${mustReject.length - wrong.length}/${mustReject.length}`);
if (wrong.length) console.log('  WRONGLY ACCEPTED:', wrong.join(' | '));

const mustAcceptOperations = [
  'Operations Manager', 'Senior Operations Manager', 'Business Operations Manager',
  'Director of Operations', 'Operations Director', 'Director, Business Operations',
  'Head of Operations', 'Operations Lead', 'Senior Manager, Operations',
  'Manager, Business Operations', 'Business Operations Lead', 'Strategy and Operations Manager',
  'Strategy & Operations Lead', 'Revenue Operations Manager', 'Sales Operations Manager',
  'Marketing Operations Manager', 'Clinical Operations Manager', 'People Operations Manager',
  'VP of Operations', 'VP, Strategy & Operations', 'Chief Operating Officer', 'COO', 'Customer Operations Manager',
  'Field Operations Manager', 'Supply Chain Operations Manager', 'Healthcare Operations Manager',
  'Manager, Strategy & Operations', 'Remote Operations Manager', 'IT Operations Program Manager',
];
const missedOperations = mustAcceptOperations.filter((title) => !isPmTitle(title));
console.log(`operations titles recognised: ${mustAcceptOperations.length - missedOperations.length}/${mustAcceptOperations.length}`);
if (missedOperations.length) console.log('  MISSED:', missedOperations.join(' | '));

const mustRejectOperations = [
  'IT Operations Manager', 'Network Operations Manager', 'Security Operations Lead',
  'Cloud Operations Manager', 'Data Center Operations Manager', 'NOC Operations Manager',
  'Technical Operations Director', 'Operations Analyst', 'Operations Specialist',
  'Operations Coordinator', 'Operations Associate', 'Operations Engineer', 'DevOps Manager',
];
const wrongOperations = mustRejectOperations.filter((title) => isPmTitle(title));
console.log(`technical and junior operations titles rejected: ${mustRejectOperations.length - wrongOperations.length}/${mustRejectOperations.length}`);
if (wrongOperations.length) console.log('  WRONGLY ACCEPTED:', wrongOperations.join(' | '));

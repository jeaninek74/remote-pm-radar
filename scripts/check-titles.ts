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

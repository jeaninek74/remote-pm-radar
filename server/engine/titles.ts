/**
 * Title taxonomy for project / program management roles.
 *
 * Deliberately broad (employers invent titles constantly) but rejects roles that
 * only mention projects incidentally, e.g. "Software Engineer, Project Atlas".
 */

const LEADS = String.raw`(?:project|program|programme|portfolio|pmo|delivery|implementation|transformation|integration|deployment|onboarding|migration|pmo operations)`;
const RANKS = String.raw`(?:manager|management|director|lead|leader|head|officer|principal|consultant|specialist|coordinator|administrator|supervisor)`;

const PATTERNS: RegExp[] = [
  // "Project Manager", "Senior Program Manager", "Technical Project Management"
  new RegExp(String.raw`\b${LEADS}\b[\s,\-/]+(?:[a-z&,\- ]{0,28}?)\b${RANKS}\b`, 'i'),
  // "Manager, Project Management", "Director of Program Management", "Head of PMO"
  new RegExp(String.raw`\b${RANKS}\b[\s,\-]*(?:of\s+)?(?:[a-z&,\- ]{0,20}?)\b${LEADS}\b`, 'i'),
  // "PMO" on its own in a leadership context
  /\bpmo\b/i,
  /\bprogram management office\b/i,
  /\bproject management office\b/i,
  // Common senior equivalents
  /\bchief of staff\b/i,
  /\btransformation (?:lead|manager|director)\b/i,
  /\bchange management (?:lead|manager|director)\b/i,
  /\boperational excellence (?:manager|lead|director)\b/i,
  /\bstrategic initiatives (?:manager|lead|director)\b/i,
  /\bcontinuous improvement (?:manager|lead|director)\b/i,
];

/** Roles that should never be classified as PM even when the JD mentions projects. */
const DISQUALIFIERS: RegExp[] = [
  /\b(software|backend|frontend|full[- ]stack|data|machine learning|ml|platform|infrastructure|network|security|cloud|devops|qa|test|systems|hardware|electrical|mechanical|civil|project|field|site|construction) engineer\b/i,
  /\b(developer|programmer|architect|scientist|researcher|designer|accountant|bookkeeper|attorney|lawyer|paralegal|nurse|physician|therapist|pharmacist|electrician|plumber|welder|carpenter|estimator|superintendent|technician|recruiter|sourcer|account executive|sales representative|sales manager|business development representative|customer support representative|service desk|help desk)\b/i,
  /\b(assistant|intern|apprentice)\b/i,
];

/** Very junior PM titles are out of scope for a 15+ year executive. */
const JUNIOR = /\b(associate|junior|jr\.?|assistant|coordinator i\b|entry[- ]level|intern)\b/i;

export function isPmTitle(rawTitle: string): boolean {
  const title = (rawTitle ?? '').trim();
  if (!title || title.length > 160) return false;
  if (!PATTERNS.some((re) => re.test(title))) return false;
  // A disqualified engineering/IC title only passes when it also names a PM rank word.
  if (DISQUALIFIERS.some((re) => re.test(title))) {
    const beat = /\b(project manager|program manager|programme manager|project director|program director|pmo (?:manager|director|lead)|portfolio manager|project management)\b/i.test(title);
    if (!beat) return false;
  }
  return true;
}

export function isJuniorTitle(title: string): boolean {
  return JUNIOR.test(title ?? '');
}

/** Normalised title family used for filtering and duplicate detection. */
export function titleFamily(rawTitle: string): string {
  const t = (rawTitle ?? '').toLowerCase();
  if (/pmo|project management office|program management office/.test(t)) return 'PMO';
  if (/portfolio/.test(t)) return 'Portfolio';
  if (/program|programme/.test(t)) return 'Program';
  if (/project/.test(t)) return 'Project';
  if (/transformation|change management/.test(t)) return 'Transformation';
  if (/implementation|deployment|integration|migration|onboarding|delivery/.test(t)) return 'Implementation / Delivery';
  return 'Project';
}

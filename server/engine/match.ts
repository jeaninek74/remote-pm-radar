import { norm } from './text';
import { isJuniorTitle } from './titles';
import type { JobCategory } from './category';

export type Lane = 'exec' | 'construction' | 'both';

interface CompetencyGroup {
  label: string;
  weight: number;
  lane: Lane;
  keywords: string[];
}

/**
 * Candidate profile distilled from BOTH resumes:
 *  - Jeanine_Kendricks_Resume2026.pdf (enterprise PMO / healthcare / SaaS / AI)
 *  - Jeanine_Kendricks_Resume_Construction_PM.pdf (GSA construction / energy / utilities)
 *
 * Weights reflect how central the competency is to her documented experience, not
 * how desirable the job is. The score is a fit signal, never an auto-rejection.
 */
const GROUPS: CompetencyGroup[] = [
  {
    label: 'Program & portfolio leadership', weight: 10, lane: 'both',
    keywords: ['program management', 'program manager', 'portfolio management', 'portfolio of projects', 'multi-project', 'program governance', 'program delivery', 'enterprise program', 'strategic initiatives'],
  },
  {
    label: 'PMO, governance & delivery controls', weight: 9, lane: 'exec',
    keywords: ['pmo', 'project management office', 'program management office', 'governance', 'steering committee', 'stage gate', 'project controls', 'delivery methodology', 'raid log', 'delivery assurance'],
  },
  {
    label: 'Budget & financial oversight', weight: 9, lane: 'both',
    keywords: ['budget', 'budgeting', 'p&l', 'financial oversight', 'forecast', 'cost control', 'capital expenditure', 'capex', 'opex', 'financial management', 'cost savings', 'million dollar'],
  },
  {
    label: 'Vendor, procurement & contract management', weight: 9, lane: 'both',
    keywords: ['vendor management', 'procurement', 'contract management', 'contracts', 'strategic sourcing', 'rfp', 'rfi', 'supplier', 'third-party', 'statement of work', 'sow', 'negotiation'],
  },
  {
    label: 'Executive & cross-functional stakeholder leadership', weight: 8, lane: 'both',
    keywords: ['stakeholder', 'cross-functional', 'executive', 'steering', 'board of directors', 'business partner', 'senior leadership', 'collaborate across'],
  },
  {
    label: 'Risk, compliance & regulatory programs', weight: 7, lane: 'both',
    keywords: ['risk management', 'risk register', 'compliance', 'regulatory', 'hipaa', 'sox', 'audit', 'issue management', 'mitigation'],
  },
  {
    label: 'Enterprise systems & SaaS implementation', weight: 8, lane: 'exec',
    keywords: ['workday', 'peoplesoft', 'salesforce', 'servicenow', 'erp', 'sap', 'oracle', 'saas implementation', 'crm', 'systems integration', 'implementation', 'configuration', 'data migration'],
  },
  {
    label: 'Healthcare & clinical systems', weight: 8, lane: 'exec',
    keywords: ['healthcare', 'health system', 'hospital', 'epic', 'ehr', 'electronic health record', 'medicare', 'medicaid', 'clinical', 'payer', 'provider', 'health plan', 'patient'],
  },
  {
    label: 'Technology delivery & digital transformation', weight: 7, lane: 'exec',
    keywords: ['digital transformation', 'it project', 'technology', 'software', 'cloud', 'data', 'cybersecurity', 'infrastructure', 'platform', 'agile', 'scrum', 'product'],
  },
  {
    label: 'AI & workflow automation', weight: 5, lane: 'exec',
    keywords: ['artificial intelligence', 'machine learning', 'automation', 'genai', 'llm', 'workflow automation', 'prompt engineering'],
  },
  {
    label: 'Construction, facilities & infrastructure', weight: 8, lane: 'construction',
    keywords: ['construction', 'general contractor', 'subcontractor', 'courthouse', 'facilities', 'infrastructure', 'build-out', 'capital projects', 'real estate', 'renovation', 'design-build'],
  },
  {
    label: 'Energy, utilities & sustainability', weight: 6, lane: 'construction',
    keywords: ['solar', 'renewable', 'utility', 'utilities', 'energy', 'grid', 'decarbon', 'sustainability', 'clean energy', 'wind', 'battery'],
  },
  {
    label: 'Marketing, creative & agency operations', weight: 7, lane: 'exec',
    keywords: ['marketing', 'campaign', 'creative', 'agency', 'brand', 'advertising', 'content', 'media', 'communications', 'public relations'],
  },
  {
    label: 'Process improvement & operational excellence', weight: 7, lane: 'both',
    keywords: ['process improvement', 'lean', 'six sigma', 'operational excellence', 'continuous improvement', 'efficiency', 'standard operating', 'workflow', 'streamline'],
  },
  {
    label: 'Organizational change & transformation', weight: 6, lane: 'both',
    keywords: ['change management', 'transformation', 'organizational change', 'adoption', 'enablement', 'training', 'readiness'],
  },
  {
    label: 'HR, people & workforce transformation', weight: 5, lane: 'both',
    keywords: ['human resources', 'people operations', 'workforce', 'talent', 'hr transformation', 'headcount', 'resource planning', 'resourcing'],
  },
  {
    label: 'Supply chain, manufacturing & logistics', weight: 5, lane: 'both',
    keywords: ['supply chain', 'manufacturing', 'logistics', 'inventory', 'production', 'fulfillment', 'warehouse', 'distribution'],
  },
  {
    label: 'Federal, public sector & government contracting', weight: 7, lane: 'both',
    keywords: ['federal', 'government', 'gsa', 'public sector', 'far ', 'contract vehicle', 'dod', 'agency', 'state government', 'municipal', 'public health'],
  },
  {
    label: 'Consulting & professional services delivery', weight: 6, lane: 'both',
    keywords: ['consulting', 'professional services', 'client delivery', 'client services', 'billable', 'engagement', 'advisory', 'client-facing'],
  },
  {
    label: 'Nonprofit, education & grants', weight: 4, lane: 'both',
    keywords: ['nonprofit', 'foundation', 'grant', 'university', 'higher education', 'education', 'mission-driven', 'philanthropy'],
  },
  {
    label: 'Data, KPIs & executive reporting', weight: 5, lane: 'both',
    keywords: ['kpi', 'dashboard', 'reporting', 'metrics', 'analytics', 'smartsheet', 'tableau', 'power bi', 'executive reporting'],
  },
  {
    label: 'Agile delivery & PM tooling', weight: 5, lane: 'exec',
    keywords: ['jira', 'asana', 'ms project', 'microsoft project', 'smartsheet', 'confluence', 'agile', 'waterfall', 'scrum', 'kanban', 'pmp', 'project plan'],
  },
];

export const RESUME_EXEC = 'Jeanine_Kendricks_Resume2026.pdf';
export const RESUME_CONSTRUCTION = 'Jeanine_Kendricks_Resume_Construction_PM.pdf';

const HIGH_FIT_INDUSTRIES = /\b(health|hospital|medical|insurance|government|federal|public sector|construction|engineering|energy|utilit|renewable|marketing|advertis|consult|nonprofit|education|universit|software|technology|financial|banking|manufactur|logistics|real estate|telecom|retail)\b/i;

const GAP_RULES: { label: string; re: RegExp }[] = [
  { label: 'Requires an active security clearance (TS/SCI, Secret, Public Trust)', re: /\b(active|current)\s+(?:top secret|ts\/sci|secret|public trust)\b|security clearance|\bts\/sci\b|\bsecret clearance\b/i },
  { label: 'Requires a clinical licence (RN / NP / MD)', re: /\bregistered nurse\b|\brn\b(?![a-z])|nursing licence|nursing license|nurse practitioner|physician|medical doctor|\bmd\b required/i },
  { label: 'Requires a CPA / public accounting credential', re: /\bcpa\b|chartered accountant|certified public accountant/i },
  { label: 'Requires a law degree / bar admission', re: /\bjuris doctor\b|\bjd\b|bar admission|licensed attorney|law degree/i },
  { label: 'Requires a PE (professional engineer) licence', re: /\bpe\b licence|\bpe\b license|professional engineer(?:ing)? (?:licence|license|stamp)/i },
  { label: 'Requires a doctorate / PhD', re: /\bph\.?d\.?\b.{0,20}(required|preferred)|\bdoctorate\b.{0,15}required/i },
  { label: 'Requires Spanish fluency', re: /bilingual|fluent in spanish|spanish fluency|habla espa\u00f1ol/i },
  { label: 'Quota-carrying sales role', re: /quota[- ]carrying|sales quota|carry a quota|commission plan/i },
  { label: 'Requires hands-on coding as the primary duty', re: /(write|writing|ship|develop)\s+(production\s+)?code|hands-on (?:coding|development) (?:required|expected)|proficient in (?:python|java|golang|typescript)\b/i },
];

function hitsFor(text: string, keywords: string[]): string[] {
  const found: string[] = [];
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (needle.length <= 3) {
      if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) found.push(keyword.trim());
    } else if (text.includes(needle)) {
      found.push(keyword.trim());
    }
  }
  return found;
}

function laneFactor(lane: Lane, target: 'exec' | 'construction'): number {
  if (lane === 'both') return 1;
  return lane === target ? 1 : 0.35;
}

export interface MatchResult {
  score: number;
  coverage: number;
  bestResume: string;
  bestLane: 'exec' | 'construction';
  reasons: string[];
  gaps: string[];
  matchedGroups: string[];
}

/**
 * Deterministic, explainable 0-100 fit score.
 *
 * The score measures how much of her documented competency base a posting
 * actually exercises. It is deliberately not inflated: a generic "Project
 * Manager" posting that only mentions scheduling and Jira lands in the 40s,
 * while a program role covering governance, budget, vendors, healthcare and
 * federal delivery lands in the 80s.
 */
export function scoreJob(input: {
  title: string;
  description: string;
  category: JobCategory;
  industry?: string | null;
}): MatchResult {
  const text = ` ${norm(`${input.title}\n${input.description}`).slice(0, 30_000)} `;

  const matched: { group: CompetencyGroup; hits: string[] }[] = [];
  for (const group of GROUPS) {
    const hits = hitsFor(text, group.keywords);
    if (hits.length) matched.push({ group, hits });
  }

  const laneScore = (target: 'exec' | 'construction') => {
    let numerator = 0;
    let denominator = 0;
    for (const group of GROUPS) {
      const factor = laneFactor(group.lane, target);
      denominator += group.weight * factor;
      const hits = hitsFor(text, group.keywords).length;
      if (hits > 0) numerator += Math.min(hits, 3) / 3 * group.weight * factor;
    }
    return denominator ? numerator / denominator : 0;
  };

  const execCoverage = laneScore('exec');
  const constructionCoverage = laneScore('construction');
  const coverage = Math.max(execCoverage, constructionCoverage);
  const bestLane: 'exec' | 'construction' = constructionCoverage > execCoverage + 0.02 ? 'construction' : 'exec';

  let score = 35 + 60 * Math.min(1, coverage / 0.55);

  const title = input.title;
  if (/\b(senior|sr\.?|director|head|lead|principal|staff|vice president|vp|chief)\b/i.test(title)) score += 4;
  if (isJuniorTitle(title)) score -= 8;
  if (input.industry && HIGH_FIT_INDUSTRIES.test(input.industry)) score += 3;

  const gaps: string[] = [];
  for (const rule of GAP_RULES) {
    if (rule.re.test(input.description)) gaps.push(rule.label);
  }
  score -= Math.min(gaps.length * 4, 12);

  // Technical depth is neither rewarded nor punished; it is simply reported.
  score = Math.round(Math.max(22, Math.min(96, score)));

  const reasons = matched
    .sort((a, b) => b.group.weight * b.hits.length - a.group.weight * a.hits.length)
    .slice(0, 5)
    .map((m) => `${m.group.label} \u2014 ${m.hits.slice(0, 4).join(', ')}`);

  return {
    score,
    coverage: Math.round(coverage * 100),
    bestResume: bestLane === 'construction' ? RESUME_CONSTRUCTION : RESUME_EXEC,
    bestLane,
    reasons: reasons.length ? reasons : ['General project-management leadership (limited overlap with the posting text)'],
    gaps,
    matchedGroups: matched.map((m) => m.group.label),
  };
}

export function matchLabel(score: number): string {
  if (score >= 80) return 'Strong fit';
  if (score >= 65) return 'Good fit';
  if (score >= 50) return 'Possible fit';
  return 'Stretch';
}

import { norm } from './text';

export type JobCategory = 'Technical' | 'Nontechnical' | 'Hybrid';

const TECHNICAL = [
  'software', 'engineering', 'engineer', 'it ', 'information technology', 'cloud', 'data platform',
  'api', 'platform', 'saas', 'cybersecurity', 'cyber security', 'infrastructure', 'erp', 'workday',
  'salesforce', 'servicenow', 'peoplesoft', 'oracle', 'sap', 'epic', 'ehr', 'electronic health record',
  'artificial intelligence', 'ai ', 'machine learning', 'automation', 'devops', 'systems integration',
  'technical program', 'technical project', 'architecture', 'database', 'network', 'telecom',
  'digital transformation', 'product development', 'scrum', 'agile', 'sprint', 'jira', 'qa',
];

const NON_TECHNICAL = [
  'marketing', 'campaign', 'creative', 'brand', 'advertising', 'agency', 'communications',
  'public relations', 'operations', 'procurement', 'vendor', 'contract', 'sourcing', 'human resources',
  'people operations', 'talent', 'workforce', 'finance', 'accounting', 'compliance', 'regulatory',
  'grants', 'nonprofit', 'foundation', 'clinical operations', 'patient', 'construction', 'facilities',
  'supply chain', 'logistics', 'manufacturing', 'events', 'customer success', 'professional services',
  'client services', 'change management', 'process improvement', 'lean', 'six sigma', 'governance',
  'budget', 'stakeholder', 'administrative', 'scheduling', 'training', 'onboarding', 'community',
];

function score(text: string, words: string[]): number {
  let total = 0;
  for (const word of words) {
    const needle = word.trim();
    if (!needle) continue;
    if (needle.length <= 3) {
      if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) total += 1;
    } else if (text.includes(needle)) {
      total += 1;
    }
  }
  return total;
}

/**
 * Classifies a role as technical, nontechnical or hybrid.
 *
 * Technical experience is never treated as a negative for business roles: this
 * only decides which filter chip a job appears under, and the two categories
 * receive identical ranking treatment.
 */
export function classifyCategory(title: string, description: string): JobCategory {
  const titleText = ` ${norm(title)} `;
  const body = ` ${norm(description).slice(0, 12_000)} `;

  const techTitle = score(titleText, TECHNICAL) * 3;
  const nonTitle = score(titleText, NON_TECHNICAL) * 3;
  const tech = techTitle + score(body, TECHNICAL);
  const nonTech = nonTitle + score(body, NON_TECHNICAL);

  const technicalRole = /\b(technical|it|engineering|platform|software|data|cloud|cyber|systems|infrastructure|digital|ai|erp|implementation)\b/i.test(title);

  if (technicalRole && nonTech >= 3) {
    const ratio = tech / Math.max(nonTech, 1);
    if (ratio < 1.4) return 'Hybrid';
    return 'Technical';
  }
  if (tech >= 4 && nonTech >= 4) {
    const ratio = tech / nonTech;
    if (ratio > 1.6) return 'Technical';
    if (ratio < 0.62) return 'Nontechnical';
    return 'Hybrid';
  }
  if (tech > nonTech) return 'Technical';
  if (nonTech > 0) return 'Nontechnical';
  return technicalRole ? 'Technical' : 'Nontechnical';
}

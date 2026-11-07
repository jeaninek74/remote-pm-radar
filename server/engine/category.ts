import { norm } from './text';
import { ACTIVE_ROLE_FAMILY } from './roles/active';
import type { RoleFamily } from './roles/types';

export type JobCategory = 'Technical' | 'Nontechnical' | 'Hybrid';

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
 * The vocabulary comes from the role family, so a data board weighs SQL and
 * pipelines while an engineering board weighs languages and infrastructure. A
 * PM board still splits marketing PMs from technical PMs.
 *
 * Technical experience is never treated as a negative for business roles: this
 * only decides which filter chip a job appears under, and the two categories
 * receive identical ranking treatment.
 */
export function classifyCategory(
  title: string,
  description: string,
  family: RoleFamily = ACTIVE_ROLE_FAMILY,
): JobCategory {
  const { technical, nontechnical, technicalTitle } = family.category;
  const titleText = ` ${norm(title)} `;
  const body = ` ${norm(description).slice(0, 12_000)} `;

  const techTitle = score(titleText, technical) * 3;
  const nonTitle = score(titleText, nontechnical) * 3;
  const tech = techTitle + score(body, technical);
  const nonTech = nonTitle + score(body, nontechnical);

  const technicalRole = technicalTitle.test(title);

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

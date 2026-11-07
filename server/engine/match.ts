import { norm } from './text';
import { isJuniorTitle } from './titles';
import { ACTIVE_ROLE_FAMILY } from './roles/active';
import { BOTH } from './roles/types';
import type { CompetencyGroup, RoleFamily } from './roles/types';
import type { JobCategory } from './category';

/**
 * Deterministic, explainable 0-100 fit score.
 *
 * The engine owns no candidate knowledge: competency groups, weights, lanes,
 * resumes, gap rules and the seniority vocabulary all come from a `RoleFamily`.
 * That is what lets one codebase score a project manager, a data analyst and a
 * software engineer without any of them being the "default" the code assumes.
 *
 * The score measures how much of the candidate's documented competency base a
 * posting actually exercises. It is deliberately not inflated and is a fit
 * signal, never an auto-rejection.
 */

export interface MatchInput {
  title: string;
  description: string;
  category: JobCategory;
  industry?: string | null;
  /** Defaults to the family selected by the active profile. */
  family?: RoleFamily;
}

export interface MatchResult {
  score: number;
  coverage: number;
  bestResume: string;
  bestLane: string;
  /** Human label for the winning lane, e.g. "Construction / Infrastructure". */
  bestLaneLabel: string;
  reasons: string[];
  gaps: string[];
  matchedGroups: string[];
  roleFamilyId: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hitsFor(text: string, keywords: string[]): string[] {
  const found: string[] = [];
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (!needle) continue;
    if (needle.length <= 3) {
      if (new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(text)) found.push(keyword.trim());
    } else if (text.includes(needle)) {
      found.push(keyword.trim());
    }
  }
  return found;
}

/** A competency counts in full for its own lane and for `all`-lane scoring. */
function laneFactor(group: CompetencyGroup, lane: string): number {
  if (group.lane === BOTH) return 1;
  return group.lane === lane ? 1 : 0.35;
}

/**
 * Scores a posting against the candidate profile behind `family`.
 *
 * A generic posting that only mentions scheduling and Jira lands in the 40s for
 * a program manager, while a role covering governance, budget, vendors and
 * federal delivery lands in the 80s. The same shape holds for other families.
 */
export function scoreJob(input: MatchInput): MatchResult {
  const family = input.family ?? ACTIVE_ROLE_FAMILY;
  const text = ` ${norm(`${input.title}\n${input.description}`).slice(0, 30_000)} `;
  const scoring = family.scoring;

  // Keyword hits are computed once and reused by every lane.
  const hitsByGroup = new Map<CompetencyGroup, string[]>();
  for (const group of family.competencies) {
    const hits = hitsFor(text, group.keywords);
    if (hits.length) hitsByGroup.set(group, hits);
  }

  const laneScore = (lane: string) => {
    let numerator = 0;
    let denominator = 0;
    for (const group of family.competencies) {
      const factor = laneFactor(group, lane);
      denominator += group.weight * factor;
      const hits = hitsByGroup.get(group)?.length ?? 0;
      if (hits > 0) numerator += (Math.min(hits, 3) / 3) * group.weight * factor;
    }
    return denominator ? numerator / denominator : 0;
  };

  const laneScores = family.lanes.map((lane) => ({ lane, coverage: laneScore(lane.id) }));
  const best = laneScores.reduce((a, b) => (b.coverage > a.coverage ? b : a), laneScores[0]);
  // Ties break toward the family's default lane so output is stable run to run.
  const winner = laneScores.every((entry) => entry.coverage <= best.coverage + 0.02)
    ? laneScores.find((entry) => entry.lane.id === family.defaultLane) ?? best
    : best;

  const coverage = winner.coverage;
  let score = scoring.base + scoring.span * Math.min(1, coverage / scoring.coverageTarget);

  const title = input.title;
  if (/\b(senior|sr\.?|director|head|lead|principal|staff|vice president|vp|chief|manager)\b/i.test(title)) {
    score += scoring.seniorityBonus;
  }
  if (isJuniorTitle(title, family)) score -= scoring.juniorPenalty;
  if (input.industry && family.highFitIndustries.test(input.industry)) score += scoring.industryBonus;

  const gaps: string[] = [];
  for (const rule of family.gapRules) {
    if (rule.re.test(input.description)) gaps.push(rule.label);
  }
  score -= Math.min(gaps.length * scoring.gapPenalty, scoring.gapPenaltyCap);

  // Technical depth is neither rewarded nor punished; it is simply reported.
  score = Math.round(Math.max(scoring.floor, Math.min(scoring.ceiling, score)));

  const matched = [...hitsByGroup.entries()].map(([group, hits]) => ({ group, hits }));
  const reasons = matched
    .sort((a, b) => b.group.weight * b.hits.length - a.group.weight * a.hits.length)
    .slice(0, 5)
    .map((m) => `${m.group.label} \u2014 ${m.hits.slice(0, 4).join(', ')}`);

  const winningLane = family.lanes.find((lane) => lane.id === winner.lane.id) ?? family.lanes[0];

  return {
    score,
    coverage: Math.round(coverage * 100),
    bestResume: winningLane.resume,
    bestLane: winningLane.id,
    bestLaneLabel: winningLane.label,
    reasons: reasons.length ? reasons : [`Limited overlap with the ${family.label.toLowerCase()} profile`],
    gaps,
    matchedGroups: matched.map((m) => m.group.label),
    roleFamilyId: family.id,
  };
}

/** Band label for a score. Thresholds are shared across families. */
export function matchLabel(score: number): string {
  if (score >= 80) return 'Strong fit';
  if (score >= 65) return 'Good fit';
  if (score >= 50) return 'Possible fit';
  return 'Stretch';
}

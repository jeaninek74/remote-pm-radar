/**
 * Role-family contracts.
 *
 * A role family is the complete, data-shaped description of *one kind of job*:
 * which titles count, how a fit score is built, which resumes back it, and which
 * vocabulary decides the technical / non-technical chip. Nothing in the engine
 * knows about project management, data or engineering specifically — the engine
 * only knows how to read a `RoleFamily`.
 *
 * Adding a new board for a different profession means adding one file under
 * `roles/families/` and pointing a profile at its `id`. No engine edits.
 */

/** One weighted competency the candidate can demonstrate. */
export interface CompetencyGroup {
  label: string;
  weight: number;
  /**
   * Which emphasis (resume / lane) this competency belongs to. `'all'` counts for
   * every lane; a specific lane id only counts toward that lane's coverage.
   */
  lane: string;
  keywords: string[];
}

/** A hard requirement the candidate probably cannot satisfy. */
export interface GapRule {
  label: string;
  re: RegExp;
}

/** Ordered mapping from a qualifying title to a display family. */
export interface TitleFamilyRule {
  /** Label shown in filters and used for duplicate grouping. */
  label: string;
  /** Any match puts the title in this family. Rules are evaluated in order. */
  patterns: RegExp[];
}

/** One emphasis within a family, each backed by its own resume. */
export interface Lane {
  id: string;
  label: string;
  /** File name of the resume that best represents this emphasis. */
  resume: string;
}

/** Tunable constants for the 0-100 fit score. */
export interface ScoringProfile {
  /** Score a posting with zero overlap receives before adjustments. */
  base: number;
  /** Points available on top of `base` at full competency coverage. */
  span: number;
  /** Coverage (0-1) that counts as "everything this candidate can show". */
  coverageTarget: number;
  /** Bonus for a senior/director-level title. */
  seniorityBonus: number;
  /** Penalty for an associate/junior title. */
  juniorPenalty: number;
  /** Bonus when the employer sits in a core industry for the family. */
  industryBonus: number;
  /** Penalty per unsatisfiable requirement. */
  gapPenalty: number;
  /** Maximum total gap penalty. */
  gapPenaltyCap: number;
  floor: number;
  ceiling: number;
}

/** Vocabulary used to place a posting in the technical / non-technical chip. */
export interface CategoryVocabulary {
  technical: string[];
  nontechnical: string[];
  /** Title-level signal that a role leans technical. */
  technicalTitle: RegExp;
}

export interface RoleFamily {
  /** Stable key used by profiles and the employer registry. */
  id: string;
  /** Full human label, e.g. "Project & Program Management". */
  label: string;
  /** Compact label for tight spaces, e.g. "PM". */
  shortLabel: string;
  /** Plural noun used in counters and logs, e.g. "PM roles". */
  jobNoun: string;
  /** Default one-line description of the board's scope. */
  defaultRoleFamily: string;
  /** Default board name when a profile does not set one. */
  defaultBoardName: string;
  /** Keyword-search terms for ATS feeds that require a query string. */
  searchTerms: string[];
  /** Any match qualifies a posting for this family. */
  titlePatterns: RegExp[];
  /** Titles that must never qualify unless `disqualifiedAllow` also matches. */
  disqualifiers: RegExp[];
  /** Rescue pattern for a disqualified title that still names the target role. */
  disqualifiedAllow: RegExp | null;
  /** Very junior titles are out of scope and score lower. */
  juniorPattern: RegExp;
  /** Ordered display-family rules. */
  titleFamilies: TitleFamilyRule[];
  /** Family label used when no rule matches. */
  defaultTitleFamily: string;
  competencies: CompetencyGroup[];
  lanes: Lane[];
  /** Lane used when two lanes score within noise of each other. */
  defaultLane: string;
  highFitIndustries: RegExp;
  gapRules: GapRule[];
  scoring: ScoringProfile;
  category: CategoryVocabulary;
  /** Employer industries this family recruits from, used by the registry. */
  employerIndustries: string[];
}

/** Shorthand used by every family module. */
export const BOTH = 'all';

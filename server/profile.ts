import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_ROLE_FAMILY_ID, getRoleFamily } from './engine/roles';
import type { RoleFamily } from './engine/roles';

/**
 * A search profile describes *who* the board is for and *what* counts as a match.
 *
 * Everything personal is data: the role family, the salary bands, the posting
 * window, the states a candidate may work from, and the labels on the board.
 * The engine itself is generic, so the same codebase can run a board for a data
 * analyst or an engineer by pointing PROFILE_FILE at another JSON file.
 */

export interface SalaryBand {
  /** Inclusive lower bound of the published annual base rate. */
  min: number;
  /** Inclusive upper bound; null means no upper cap. */
  max: number | null;
  /** Human label shown on the tab. */
  label: string;
}

export interface SearchProfile {
  boardName: string;
  owner: string;
  /**
   * Which role family this board searches for. Matches a `RoleFamily.id` from
   * `server/engine/roles` — e.g. `project-management`, `data-analytics`,
   * `engineering`. Unknown values fall back to the default family with a warning.
   */
  roleFamilyId: string;
  /** What the board is looking for, in one line — shown in the interface. */
  roleFamily: string;
  /** Plural noun for counters and logs, e.g. "PM roles". */
  jobNoun: string;
  /** Compact label for tight UI spaces, e.g. "PM". */
  shortLabel: string;
  /** Only postings whose original date falls inside this many days qualify. */
  windowDays: number;
  bands: {
    /** Entry band (added 7 Nov 2026 at Jeanine's direction): $90K up to, not including, the Tab 1 floor. */
    tab0: SalaryBand;
    /** Narrow band, e.g. the first salary tab. */
    tab1: SalaryBand;
    /** Open-ended band, e.g. the second salary tab. */
    tab2: SalaryBand;
  };
  /** States the candidate can legally work from; roles restricted elsewhere are queued, not shown. */
  eligibleStates: string[];
  /** Set false when the candidate will relocate: state restrictions stop being disqualifying. */
  requireEligibleState: boolean;
}

const BASE_FAMILY = getRoleFamily(DEFAULT_ROLE_FAMILY_ID);

/** Defaults are derived from the role family so nothing here names a profession. */
export const DEFAULT_PROFILE: SearchProfile = {
  boardName: BASE_FAMILY.defaultBoardName,
  owner: 'Jeanine Kendricks',
  roleFamilyId: BASE_FAMILY.id,
  roleFamily: BASE_FAMILY.defaultRoleFamily,
  jobNoun: BASE_FAMILY.jobNoun,
  shortLabel: BASE_FAMILY.shortLabel,
  windowDays: 14,
  bands: {
    tab0: { min: 90_000, max: 109_999, label: '$90K–$110K' },
    tab1: { min: 110_000, max: 130_000, label: '$110K–$130K' },
    tab2: { min: 150_000, max: null, label: '$150K+' },
  },
  eligibleStates: ['CA'],
  requireEligibleState: true,
};

/**
 * Fills in every family-derived field from `roleFamilyId`, so a profile file only
 * has to state the family and the numbers. Explicit values in the file still win,
 * which lets one board re-label itself without forking a family.
 */
function withFamilyDefaults(profile: SearchProfile, family: RoleFamily): SearchProfile {
  return {
    ...profile,
    roleFamilyId: family.id,
    jobNoun: profile.jobNoun || family.jobNoun,
    shortLabel: profile.shortLabel || family.shortLabel,
    boardName: profile.boardName || family.defaultBoardName,
    roleFamily: profile.roleFamily || family.defaultRoleFamily,
  };
}

function merge(base: SearchProfile, override: Partial<SearchProfile>): SearchProfile {
  const family = getRoleFamily(override.roleFamilyId ?? base.roleFamilyId);
  const merged: SearchProfile = {
    ...base,
    ...override,
    bands: {
      tab0: { ...base.bands.tab0, ...(override.bands?.tab0 ?? {}) },
      tab1: { ...base.bands.tab1, ...(override.bands?.tab1 ?? {}) },
      tab2: { ...base.bands.tab2, ...(override.bands?.tab2 ?? {}) },
    },
    eligibleStates: override.eligibleStates?.length ? override.eligibleStates : base.eligibleStates,
  };
  // Clear inherited labels when the family changed, so the new family's wording is used.
  if (override.roleFamilyId && override.roleFamilyId !== base.roleFamilyId) {
    if (!override.jobNoun) merged.jobNoun = '';
    if (!override.shortLabel) merged.shortLabel = '';
    if (!override.roleFamily) merged.roleFamily = '';
    if (!override.boardName) merged.boardName = '';
  }
  return withFamilyDefaults(merged, family);
}

/** Reads the profile named by PROFILE_FILE, falling back to profiles/default.json, then to defaults. */
export function loadProfile(): SearchProfile {
  const explicit = process.env.PROFILE_FILE;
  const fallback = resolve(process.cwd(), 'profiles/default.json');
  const path = explicit ? resolve(process.cwd(), explicit) : fallback;

  let profile = DEFAULT_PROFILE;
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SearchProfile>;
      profile = merge(DEFAULT_PROFILE, parsed);
    } catch (err) {
      console.error(`[profile] could not read ${path}: ${(err as Error).message} — using defaults`);
    }
  } else if (explicit) {
    console.error(`[profile] PROFILE_FILE ${path} not found — using defaults`);
  }

  // Environment overrides win over the file, so a deployment can adjust one value without a fork.
  const windowFromEnv = Number(process.env.JOB_WINDOW_DAYS);
  if (Number.isFinite(windowFromEnv) && windowFromEnv > 0) profile.windowDays = windowFromEnv;

  return profile;
}

export const PROFILE = loadProfile();

/** Short summary used by the API and the interface. */
export function describeProfile(profile: SearchProfile = PROFILE) {
  const family = getRoleFamily(profile.roleFamilyId);
  return {
    boardName: profile.boardName,
    owner: profile.owner,
    roleFamilyId: family.id,
    roleFamily: profile.roleFamily,
    roleFamilyLabel: family.label,
    shortLabel: profile.shortLabel,
    jobNoun: profile.jobNoun,
    windowDays: profile.windowDays,
    bands: profile.bands,
    eligibleStates: profile.eligibleStates,
    requireEligibleState: profile.requireEligibleState,
    lanes: family.lanes.map((lane) => ({ id: lane.id, label: lane.label })),
    source: process.env.PROFILE_FILE ?? 'profiles/default.json',
  };
}

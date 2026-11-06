import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A search profile describes *who* the board is for and *what* counts as a match.
 *
 * Everything personal is data: the salary bands, the posting window, the states a candidate may
 * work from, and the labels on the board. The engine itself is generic, so the same codebase can
 * run a different board for a different person by pointing PROFILE_FILE at another JSON file.
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
  /** What the board is looking for, in one line — shown in the interface. */
  roleFamily: string;
  /** Only postings whose original date falls inside this many days qualify. */
  windowDays: number;
  bands: {
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

export const DEFAULT_PROFILE: SearchProfile = {
  boardName: 'Remote PM Radar',
  owner: 'Jeanine Kendricks',
  roleFamily: 'Remote project, program and delivery roles in the United States',
  windowDays: 14,
  bands: {
    tab1: { min: 110_000, max: 130_000, label: '$110K–$130K' },
    tab2: { min: 150_000, max: null, label: '$150K+' },
  },
  eligibleStates: ['CA'],
  requireEligibleState: true,
};

function merge(base: SearchProfile, override: Partial<SearchProfile>): SearchProfile {
  return {
    ...base,
    ...override,
    bands: {
      tab1: { ...base.bands.tab1, ...(override.bands?.tab1 ?? {}) },
      tab2: { ...base.bands.tab2, ...(override.bands?.tab2 ?? {}) },
    },
    eligibleStates: override.eligibleStates?.length ? override.eligibleStates : base.eligibleStates,
  };
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
  return {
    boardName: profile.boardName,
    owner: profile.owner,
    roleFamily: profile.roleFamily,
    windowDays: profile.windowDays,
    bands: profile.bands,
    eligibleStates: profile.eligibleStates,
    requireEligibleState: profile.requireEligibleState,
    source: process.env.PROFILE_FILE ?? 'profiles/default.json',
  };
}

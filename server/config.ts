/**
 * Central configuration for the radar.
 *
 * Every rule that the product depends on (salary bands, the posting window,
 * how many employers one refresh cycle may touch) lives here so the behaviour
 * is auditable in one place.
 */

import { PROFILE } from './profile';

export const APP = {
  name: PROFILE.boardName,
  owner: PROFILE.owner,
  version: '1.0.0',
};
/** Active search profile — the per-candidate data the engine runs on. */
export { PROFILE };

export const RULES = {
  /**
   * Only jobs whose ORIGINAL posting date falls inside this many calendar days qualify.
   * The master prompt specifies seven days; Jeanine explicitly extended it to 14 on
   * 6 Nov 2026 because seven days produced three roles against 638 PM postings. Override
   * with JOB_WINDOW_DAYS (7 restores the original rule).
   */
  windowDays: PROFILE.windowDays,
  /** Tab 1: verified minimum annual base salary inside this inclusive range. */
  tab1Min: PROFILE.bands.tab1.min,
  tab1Max: PROFILE.bands.tab1.max ?? PROFILE.bands.tab1.min,
  tab1Label: PROFILE.bands.tab1.label,
  /** Tab 2: verified minimum annual base salary at or above this. No upper cap. */
  tab2Min: PROFILE.bands.tab2.min,
  tab2Label: PROFILE.bands.tab2.label,
  /** Day range a job is heard about: window plus a grace period for the archive. */
  archiveDays: PROFILE.windowDays + 14,
  /** Hours used to annualise hourly contract rates (never presented as guaranteed salary). */
  hoursPerYear: 2080,
};

export const REFRESH = {
  /** Employers touched per cycle (least-recently-searched first). */
  employersPerRun: Number(process.env.EMPLOYERS_PER_RUN ?? 600),
  /** Feed pages fetched per cycle. */
  feedPages: Number(process.env.FEED_PAGES ?? 4),
  /** Parallel network requests. */
  concurrency: Number(process.env.FETCH_CONCURRENCY ?? 7),
  /** Per-request timeout. */
  timeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 20_000),
  /** Cron cadence: every 4 hours, on the hour (UTC). */
  cron: process.env.REFRESH_CRON ?? '0 */4 * * *',
  /** Max new employers discovered (ATS slug probing) per cycle. */
  discoverPerRun: Number(process.env.DISCOVER_PER_RUN ?? 40),
  /** How many brand-new tab listings get a live link check per cycle. */
  linkChecksPerRun: Number(process.env.LINK_CHECKS_PER_RUN ?? 35),
};

export const USER_AGENT =
  `${APP.name.replace(/[^A-Za-z0-9]/g, '')}/1.0 (personal job-search aggregator; contact: ${process.env.CONTACT_EMAIL ?? 'Jeaninek74@gmail.com'})`;

export const APP_STATUSES = [
  'Not Applied',
  'Interested',
  'Applied',
  'Recruiter Contacted',
  'Interview Scheduled',
  'Interview Completed',
  'Offer Received',
  'Rejected',
  'No Longer Interested',
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

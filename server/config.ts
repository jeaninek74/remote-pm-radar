/**
 * Central configuration for the radar.
 *
 * Every rule that the product depends on (salary bands, the seven-day window,
 * how many employers one refresh cycle may touch) lives here so the behaviour
 * is auditable in one place.
 */

export const APP = {
  name: 'Remote PM Radar',
  owner: 'Jeanine Kendricks',
  version: '1.0.0',
};

export const RULES = {
  /** Only jobs whose ORIGINAL posting date falls inside this many calendar days qualify. */
  windowDays: 7,
  /** Tab 1: verified minimum annual base salary inside this inclusive range. */
  tab1Min: 110_000,
  tab1Max: 130_000,
  /** Tab 2: verified minimum annual base salary at or above this. No upper cap. */
  tab2Min: 150_000,
  /** Hours used to annualise hourly contract rates (never presented as guaranteed salary). */
  hoursPerYear: 2080,
};

export const REFRESH = {
  /** Employers touched per cycle (least-recently-searched first). */
  employersPerRun: Number(process.env.EMPLOYERS_PER_RUN ?? 150),
  /** Feed pages fetched per cycle. */
  feedPages: Number(process.env.FEED_PAGES ?? 4),
  /** Parallel network requests. */
  concurrency: Number(process.env.FETCH_CONCURRENCY ?? 7),
  /** Per-request timeout. */
  timeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 20_000),
  /** Cron cadence: every 4 hours, on the hour (UTC). */
  cron: process.env.REFRESH_CRON ?? '0 */4 * * *',
  /** Max new employers discovered (ATS slug probing) per cycle. */
  discoverPerRun: Number(process.env.DISCOVER_PER_RUN ?? 24),
  /** How many brand-new tab listings get a live link check per cycle. */
  linkChecksPerRun: Number(process.env.LINK_CHECKS_PER_RUN ?? 35),
};

export const USER_AGENT =
  'RemotePMRadar/1.0 (personal job-search aggregator; contact: Jeaninek74@gmail.com)';

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

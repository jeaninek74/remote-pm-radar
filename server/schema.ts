/**
 * Idempotent schema for the radar. Safe to run on every boot and on every
 * deploy: only CREATE ... IF NOT EXISTS and additive ALTERs are used so that
 * user-entered application tracking data is never dropped.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS employers (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  ats TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  company_size TEXT,
  hq_state TEXT,
  careers_url TEXT,
  black_owned BOOLEAN NOT NULL DEFAULT FALSE,
  ownership_status TEXT NOT NULL DEFAULT 'Not researched',
  ownership_source TEXT,
  discovered_via TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_searched_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  jobs_seen INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats, slug)
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  employer_id INTEGER REFERENCES employers(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Nontechnical',
  industry TEXT,
  company_size TEXT,
  hq_state TEXT,
  remote_status TEXT,
  ca_eligibility TEXT,
  ca_eligibility_note TEXT,
  employment_type TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_interval TEXT,
  hourly_rate NUMERIC(9,2),
  salary_source TEXT,
  salary_note TEXT,
  match_score INTEGER NOT NULL DEFAULT 0,
  best_resume TEXT,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  urgency TEXT NOT NULL DEFAULT 'Unknown',
  urgency_evidence TEXT,
  black_owned_verification TEXT NOT NULL DEFAULT 'Not researched',
  ownership_source TEXT,
  apply_url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'employer',
  link_verified_at TIMESTAMPTZ,
  link_status TEXT,
  requisition_id TEXT,
  posted_at DATE,
  posted_source TEXT,
  posted_confidence TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  bucket TEXT NOT NULL DEFAULT 'queue',
  bucket_reason TEXT,
  description_excerpt TEXT,
  source TEXT,
  app_status TEXT NOT NULL DEFAULT 'Not Applied',
  notes TEXT,
  interview_at DATE,
  recruiter_notes TEXT,
  applied_at DATE,
  follow_up_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_bucket_idx ON jobs (bucket);
CREATE INDEX IF NOT EXISTS jobs_posted_idx ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs (company);
CREATE INDEX IF NOT EXISTS jobs_employer_idx ON jobs (employer_id);

CREATE TABLE IF NOT EXISTS refresh_runs (
  id SERIAL PRIMARY KEY,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  employers_searched INTEGER NOT NULL DEFAULT 0,
  sources_checked INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  jobs_fetched INTEGER NOT NULL DEFAULT 0,
  jobs_matched INTEGER NOT NULL DEFAULT 0,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  added_tab1 INTEGER NOT NULL DEFAULT 0,
  added_tab2 INTEGER NOT NULL DEFAULT 0,
  queued INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  new_employers INTEGER NOT NULL DEFAULT 0,
  links_checked INTEGER NOT NULL DEFAULT 0,
  links_valid INTEGER NOT NULL DEFAULT 0,
  progress TEXT,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  message TEXT
);

CREATE TABLE IF NOT EXISTS source_health (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL UNIQUE,
  label TEXT,
  last_attempt TIMESTAMPTZ,
  last_ok TIMESTAMPTZ,
  last_jobs INTEGER,
  ok BOOLEAN,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

-- Additive migrations for databases created by earlier versions.
ALTER TABLE employers ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_status TEXT;
CREATE INDEX IF NOT EXISTS jobs_bucket_idx ON jobs (bucket, match_score DESC);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs (company);
CREATE INDEX IF NOT EXISTS jobs_posted_idx ON jobs (posted_at DESC);
`;

import { one, q } from './db';
import { APP_STATUSES, RULES } from './config';
import type { AppStatus } from './config';

export interface JobRow {
  id: number;
  jobKey: string;
  company: string;
  title: string;
  category: string;
  industry: string | null;
  companySize: string | null;
  hqState: string | null;
  remoteStatus: string;
  caEligibility: string;
  caNote: string;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: string | null;
  hourlyRate: number | null;
  salarySource: string | null;
  salaryNote: string | null;
  matchScore: number;
  bestResume: string;
  matchReasons: string[];
  gaps: string[];
  urgency: string;
  urgencyEvidence: string | null;
  blackOwned: string;
  ownershipSource: string | null;
  applyUrl: string;
  linkType: string;
  linkStatus: string | null;
  linkVerifiedAt: string | null;
  requisitionId: string | null;
  postedAt: string | null;
  postedConfidence: string;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  bucket: string;
  bucketReason: string | null;
  descriptionExcerpt: string;
  source: string;
  appStatus: string;
  notes: string | null;
  interviewAt: string | null;
  recruiterNotes: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
}

interface JobRecord {
  id: number; job_key: string; company: string; title: string; category: string;
  industry: string | null; company_size: string | null; hq_state: string | null;
  remote_status: string | null; ca_eligibility: string | null; ca_eligibility_note: string | null;
  employment_type: string | null; salary_min: number | null; salary_max: number | null;
  salary_interval: string | null; hourly_rate: string | null; salary_source: string | null;
  salary_note: string | null; match_score: number; best_resume: string | null;
  match_reasons: string[] | null; gaps: string[] | null; urgency: string;
  urgency_evidence: string | null; black_owned_verification: string; ownership_source: string | null;
  apply_url: string; link_type: string; link_status: string | null; link_verified_at: string | null;
  requisition_id: string | null; posted_at: string | null; posted_confidence: string | null;
  first_seen_at: string; last_verified_at: string | null; bucket: string; bucket_reason: string | null;
  description_excerpt: string | null; source: string | null; app_status: string;
  notes: string | null; interview_at: string | null; recruiter_notes: string | null;
  applied_at: string | null; follow_up_at: string | null;
}

function mapJob(row: JobRecord): JobRow {
  return {
    id: row.id,
    jobKey: row.job_key,
    company: row.company,
    title: row.title,
    category: row.category,
    industry: row.industry,
    companySize: row.company_size,
    hqState: row.hq_state,
    remoteStatus: row.remote_status ?? 'Remote',
    caEligibility: row.ca_eligibility ?? 'unknown',
    caNote: row.ca_eligibility_note ?? '',
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryInterval: row.salary_interval,
    hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
    salarySource: row.salary_source,
    salaryNote: row.salary_note,
    matchScore: row.match_score,
    bestResume: row.best_resume ?? '',
    matchReasons: row.match_reasons ?? [],
    gaps: row.gaps ?? [],
    urgency: row.urgency,
    urgencyEvidence: row.urgency_evidence,
    blackOwned: row.black_owned_verification,
    ownershipSource: row.ownership_source,
    applyUrl: row.apply_url,
    linkType: row.link_type,
    linkStatus: row.link_status,
    linkVerifiedAt: row.link_verified_at,
    requisitionId: row.requisition_id,
    postedAt: row.posted_at,
    postedConfidence: row.posted_confidence ?? 'unknown',
    firstSeenAt: row.first_seen_at,
    lastVerifiedAt: row.last_verified_at,
    bucket: row.bucket,
    bucketReason: row.bucket_reason,
    descriptionExcerpt: row.description_excerpt ?? '',
    source: row.source ?? '',
    appStatus: row.app_status,
    notes: row.notes,
    interviewAt: row.interview_at,
    recruiterNotes: row.recruiter_notes,
    appliedAt: row.applied_at,
    followUpAt: row.follow_up_at,
  };
}

const JOB_COLUMNS = `
  id, job_key, company, title, category, industry, company_size, hq_state, remote_status,
  ca_eligibility, ca_eligibility_note, employment_type, salary_min, salary_max, salary_interval,
  hourly_rate, salary_source, salary_note, match_score, best_resume, match_reasons, gaps,
  urgency, urgency_evidence, black_owned_verification, ownership_source, apply_url, link_type,
  link_status, link_verified_at::text, requisition_id, posted_at::text, posted_confidence,
  to_char(first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS first_seen_at,
  last_verified_at::text, bucket, bucket_reason, description_excerpt, source,
  app_status, notes, interview_at::text, recruiter_notes, applied_at::text, follow_up_at::text
`;

const LIST_JOB_COLUMNS = JOB_COLUMNS.replace(
  'bucket, bucket_reason',
  "CASE WHEN duplicate_of IS NOT NULL THEN 'excluded' ELSE bucket END AS bucket, bucket_reason",
);

export async function listJobs(): Promise<JobRow[]> {
  const rows = await q<JobRecord>(
    `SELECT ${LIST_JOB_COLUMNS}
       FROM jobs
      WHERE (duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2','unsalaried','queue','archived'))
         OR app_status <> 'Not Applied'
      ORDER BY (jobs.bucket = 'tab0') DESC, (jobs.bucket = 'tab1') DESC, (jobs.bucket = 'tab2') DESC, (jobs.bucket = 'unsalaried') DESC,
               posted_at DESC NULLS LAST, first_seen_at DESC NULLS LAST`,
  );
  return rows.map(mapJob);
}

export interface Stats {
  activeJobs: number;
  tab0: number;
  tab1: number;
  tab2: number;
  unsalaried: number;
  newToday: number;
  new24h: number;
  nontechnical: number;
  technical: number;
  hybrid: number;
  urgent: number;
  blackOwnedEmployers: number;
  blackOwnedJobs: number;
  employersTracked: number;
  employersSearched: number;
  statesSearched: number;
  queue: number;
  archived: number;
  lastRefresh: string | null;
  lastRefreshMessage: string | null;
  lastRunStatus: string | null;
  sourcesOk: number;
  sourcesFailed: number;
  windowDays: number;
  tab0Min: number;
  tab0Max: number;
  tab1Min: number;
  tab1Max: number;
  tab2Min: number;
  appStatuses: readonly string[];
}

export async function getStats(): Promise<Stats> {
  const row = await one<{
    active: string; tab0: string; tab1: string; tab2: string; new_today: string; new_24h: string;
    nontechnical: string; technical: string; hybrid: string; urgent: string;
    black_owned_jobs: string; black_owned_employers: string; unsalaried: string;
    queue: string; archived: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2'))::text AS active,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='tab0')::text AS tab0,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='tab1')::text AS tab1,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='tab2')::text AS tab2,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND first_seen_at >= CURRENT_DATE)::text AS new_today,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND first_seen_at > now() - INTERVAL '24 hours')::text AS new_24h,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND category='Nontechnical')::text AS nontechnical,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND category='Technical')::text AS technical,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND category='Hybrid')::text AS hybrid,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2','unsalaried') AND urgency='High')::text AS urgent,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND black_owned_verification='Verified Black-owned')::text AS black_owned_jobs,
       count(DISTINCT company) FILTER (WHERE duplicate_of IS NULL AND bucket IN ('tab0','tab1','tab2') AND black_owned_verification='Verified Black-owned')::text AS black_owned_employers,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='unsalaried')::text AS unsalaried,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='queue')::text AS queue,
       count(*) FILTER (WHERE duplicate_of IS NULL AND bucket='archived')::text AS archived
     FROM jobs`,
  );

  const employers = await one<{ tracked: string; searched: string; states: string }>(
    `SELECT
        count(*) FILTER (WHERE ats <> 'manual')::text AS tracked,
        count(*) FILTER (WHERE last_searched_at IS NOT NULL)::text AS searched,
        count(DISTINCT hq_state) FILTER (WHERE hq_state IS NOT NULL)::text AS states
      FROM employers`,
  );

  const lastRun = await one<{
    finished_at: string | null; message: string | null; status: string;
  }>(
    `SELECT finished_at::text, message, status FROM refresh_runs ORDER BY id DESC LIMIT 1`,
  );

  const sources = await one<{ ok: string; failed: string }>(
    `SELECT count(*) FILTER (WHERE ok)::text AS ok, count(*) FILTER (WHERE NOT ok)::text AS failed FROM source_health`,
  );

  return {
    activeJobs: Number(row?.active ?? 0),
    tab0: Number(row?.tab0 ?? 0),
    tab1: Number(row?.tab1 ?? 0),
    tab2: Number(row?.tab2 ?? 0),
    unsalaried: Number(row?.unsalaried ?? 0),
    newToday: Number(row?.new_today ?? 0),
    new24h: Number(row?.new_24h ?? 0),
    nontechnical: Number(row?.nontechnical ?? 0),
    technical: Number(row?.technical ?? 0),
    hybrid: Number(row?.hybrid ?? 0),
    urgent: Number(row?.urgent ?? 0),
    blackOwnedEmployers: Number(row?.black_owned_employers ?? 0),
    blackOwnedJobs: Number(row?.black_owned_jobs ?? 0),
    employersTracked: Number(employers?.tracked ?? 0),
    employersSearched: Number(employers?.searched ?? 0),
    statesSearched: Number(employers?.states ?? 0),
    queue: Number(row?.queue ?? 0),
    archived: Number(row?.archived ?? 0),
    lastRefresh: lastRun?.finished_at ?? null,
    lastRefreshMessage: lastRun?.message ?? null,
    lastRunStatus: lastRun?.status ?? null,
    sourcesOk: Number(sources?.ok ?? 0),
    sourcesFailed: Number(sources?.failed ?? 0),
    windowDays: RULES.windowDays,
    tab0Min: RULES.tab0Min,
    tab0Max: RULES.tab0Max,
    tab1Min: RULES.tab1Min,
    tab1Max: RULES.tab1Max,
    tab2Min: RULES.tab2Min,
    appStatuses: APP_STATUSES,
  };
}

export interface EmployerRowOut {
  id: number;
  name: string;
  ats: string;
  slug: string;
  industry: string | null;
  companySize: string | null;
  hqState: string | null;
  careersUrl: string | null;
  blackOwned: boolean;
  ownershipStatus: string;
  ownershipSource: string | null;
  discoveredVia: string | null;
  lastSearchedAt: string | null;
  lastStatus: string | null;
  jobsSeen: number;
  active: boolean;
  openRoles: number;
}

export async function listEmployers(): Promise<EmployerRowOut[]> {
  const rows = await q<{
    id: number; name: string; ats: string; slug: string; industry: string | null;
    company_size: string | null; hq_state: string | null; careers_url: string | null;
    black_owned: boolean; ownership_status: string; ownership_source: string | null;
    discovered_via: string | null; last_searched_at: string | null; last_status: string | null;
    jobs_seen: number; active: boolean; open_roles: string;
  }>(
    `SELECT e.id, e.name, e.ats, e.slug, e.industry, e.company_size, e.hq_state, e.careers_url,
            e.black_owned, e.ownership_status, e.ownership_source, e.discovered_via,
            e.last_searched_at::text, e.last_status, e.jobs_seen, e.active,
            count(j.id) FILTER (WHERE j.duplicate_of IS NULL AND j.bucket IN ('tab0','tab1','tab2'))::text AS open_roles
       FROM employers e
       LEFT JOIN jobs j ON j.employer_id = e.id
      GROUP BY e.id
      ORDER BY (e.black_owned) DESC, (e.last_searched_at IS NULL) DESC, e.last_searched_at DESC NULLS LAST, e.name ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ats: r.ats,
    slug: r.slug,
    industry: r.industry,
    companySize: r.company_size,
    hqState: r.hq_state,
    careersUrl: r.careers_url,
    blackOwned: r.black_owned,
    ownershipStatus: r.ownership_status,
    ownershipSource: r.ownership_source,
    discoveredVia: r.discovered_via,
    lastSearchedAt: r.last_searched_at,
    lastStatus: r.last_status,
    jobsSeen: r.jobs_seen,
    active: r.active,
    openRoles: Number(r.open_roles),
  }));
}

export interface RunRow {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  employersSearched: number;
  sourcesChecked: number;
  sourcesFailed: number;
  jobsFetched: number;
  jobsMatched: number;
  newJobs: number;
  addedTab1: number;
  addedTab2: number;
  queued: number;
  duplicates: number;
  archived: number;
  closed: number;
  newEmployers: number;
  linksChecked: number;
  linksValid: number;
  progress: string | null;
  errors: { source: string; message: string }[];
  message: string | null;
}

export async function listRuns(limit = 25): Promise<RunRow[]> {
  const rows = await q<{
    id: number; trigger: string; status: string; started_at: string; finished_at: string | null;
    employers_searched: number; sources_checked: number; sources_failed: number; jobs_fetched: number;
    jobs_matched: number; new_jobs: number; added_tab1: number; added_tab2: number; queued: number;
    duplicates: number; archived: number; closed: number; new_employers: number; links_checked: number;
    links_valid: number; progress: string | null; errors: { source: string; message: string }[]; message: string | null;
  }>(
    `SELECT id, trigger, status, started_at::text, finished_at::text, employers_searched, sources_checked,
            sources_failed, jobs_fetched, jobs_matched, new_jobs, added_tab1, added_tab2, queued,
            duplicates, archived, closed, new_employers, links_checked, links_valid, progress, errors, message
       FROM refresh_runs ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    employersSearched: r.employers_searched,
    sourcesChecked: r.sources_checked,
    sourcesFailed: r.sources_failed,
    jobsFetched: r.jobs_fetched,
    jobsMatched: r.jobs_matched,
    newJobs: r.new_jobs,
    addedTab1: r.added_tab1,
    addedTab2: r.added_tab2,
    queued: r.queued,
    duplicates: r.duplicates,
    archived: r.archived,
    closed: r.closed,
    newEmployers: r.new_employers,
    linksChecked: r.links_checked,
    linksValid: r.links_valid,
    progress: r.progress,
    errors: r.errors ?? [],
    message: r.message,
  }));
}

export async function listSources(): Promise<{
  source: string; label: string; ok: boolean | null; lastAttempt: string | null;
  lastOk: string | null; lastJobs: number | null; error: string | null; attempts: number; failures: number;
}[]> {
  const rows = await q<{
    source: string; label: string | null; ok: boolean | null; last_attempt: string | null;
    last_ok: string | null; last_jobs: number | null; error: string | null; attempts: number; failures: number;
  }>(
    `SELECT source, label, ok, last_attempt::text, last_ok::text, last_jobs, error, attempts, failures
       FROM source_health
      ORDER BY failures DESC, last_attempt DESC NULLS LAST`,
  );
  return rows.map((r) => ({
    source: r.source,
    label: r.label ?? r.source,
    ok: r.ok,
    lastAttempt: r.last_attempt,
    lastOk: r.last_ok,
    lastJobs: r.last_jobs,
    error: r.error,
    attempts: r.attempts,
    failures: r.failures,
  }));
}

const TRACKING_FIELDS = ['appStatus', 'notes', 'interviewAt', 'recruiterNotes', 'appliedAt', 'followUpAt'] as const;
type TrackingField = (typeof TRACKING_FIELDS)[number];

const COLUMN_MAP: Record<TrackingField, string> = {
  appStatus: 'app_status',
  notes: 'notes',
  interviewAt: 'interview_at',
  recruiterNotes: 'recruiter_notes',
  appliedAt: 'applied_at',
  followUpAt: 'follow_up_at',
};

export async function updateTracking(id: number, patch: Record<string, unknown>): Promise<JobRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const field of TRACKING_FIELDS) {
    if (!(field in patch)) continue;
    let value = patch[field];
    if (field === 'appStatus') {
      if (typeof value !== 'string' || !APP_STATUSES.includes(value as AppStatus)) continue;
    } else if (value !== null && typeof value === 'string' && /At$/.test(field)) {
      value = value === '' ? null : value;
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) continue;
    } else if (value !== null && typeof value !== 'string') {
      continue;
    }
    if (value === '') value = null;
    sets.push(`${COLUMN_MAP[field]} = $${index}`);
    values.push(value);
    index += 1;
  }

  if (!sets.length) return null;
  values.push(id);
  const rows = await q<JobRecord>(
    `UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $${index} RETURNING ${JOB_COLUMNS}`,
    values,
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

/** Jobs that still need a human decision, with their blocker explained. */
export async function queueSummary(): Promise<{ reason: string; count: number }[]> {
  const rows = await q<{ reason: string; count: string }>(
    `SELECT COALESCE(bucket_reason,'Unspecified') AS reason, count(*)::text AS count
       FROM jobs WHERE duplicate_of IS NULL AND bucket='queue' GROUP BY 1 ORDER BY count(*) DESC LIMIT 12`,
  );
  return rows.map((r) => ({ reason: r.reason, count: Number(r.count) }));
}

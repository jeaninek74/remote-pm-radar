import { acquireRefreshLock, migrate, one, q, type RefreshLock } from '../db';
import { REFRESH, RULES } from '../config';
import { WATCHLIST, employersForRoleFamily } from '../data/employers.seed';
import { OWNERSHIP_RECORDS } from '../data/ownership';
import { MANUAL_EMPLOYERS } from '../data/manual-employers';
import { TRACKED_STATE_EMPLOYERS } from '../data/state-employers';
import { fetchBoard } from './sources';
import { evaluateLocation } from './location';
import { classifyCategory } from './category';
import { classifySalary } from './salary';
import { scoreJob } from './match';
import { detectUrgency } from './urgency';
import { isRoleTitle } from './titles';
import { ACTIVE_ROLE_FAMILY } from './roles/active';
import { companyKey, daysBetween, norm, slugify, titleKey, truncate } from './text';
import { checkLink, fetchJson, mapLimit } from './http';
import type { Ats, EmployerRow, RawJob } from './types';
import type { EvaluatedJob } from './types';

let running = false;

export function isRefreshing(): boolean {
  return running;
}

/* ------------------------------------------------------------------ seeding */

export async function seedEmployers(): Promise<number> {
  let inserted = 0;
  // Only the employers whose industries this role family actually recruits from.
  for (const seed of employersForRoleFamily(ACTIVE_ROLE_FAMILY.id)) {
    const res = await q<{ id: number }>(
      `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Seed inventory',TRUE)
       ON CONFLICT (ats, slug) DO NOTHING
       RETURNING id`,
      [seed.name, seed.ats, seed.slug, seed.industry, seed.size, seed.hq, seed.careersUrl ?? careersUrlFor(seed.ats, seed.slug)],
    );
    inserted += res.length;
  }
  for (const manual of MANUAL_EMPLOYERS) {
    const res = await q<{ id: number }>(
      `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active, last_status)
       VALUES ($1,'manual',$2,$3,$4,$5,$6,'50-state careers sweep',FALSE,$7)
       ON CONFLICT (ats, slug) DO NOTHING
       RETURNING id`,
      [manual.name, slugify(manual.name), manual.industry, manual.size, manual.hq, manual.careersUrl,
       'Careers page tracked \u2014 postings sit behind Workday/iCIMS; open the link to search this employer'],
    );
    inserted += res.length;
  }
  // States where no public board could be resolved: tracked with their own careers link so
  // every state is represented. Skipped when the employer is already in the registry under
  // a different ATS, so nothing is listed twice.
  for (const tracked of TRACKED_STATE_EMPLOYERS) {
    const res = await q<{ id: number }>(
      `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active, last_status)
       SELECT $1,'manual',$2,$3,$4,$5,$6,'State coverage sweep',FALSE,$7
        WHERE NOT EXISTS (
          SELECT 1 FROM employers
           WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))
               = lower(regexp_replace($1, '[^a-zA-Z0-9]', '', 'g'))
        )
       ON CONFLICT (ats, slug) DO NOTHING
       RETURNING id`,
      [tracked.name, slugify(tracked.name), tracked.industry, tracked.size, tracked.state, tracked.careersUrl,
       'Careers page tracked — no public job feed; open the link to search this employer'],
    );
    inserted += res.length;
  }
  for (const watch of WATCHLIST.filter((entry) => entry.roleFamilies.includes(ACTIVE_ROLE_FAMILY.id))) {
    const res = await q<{ id: number }>(
      `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active, last_status)
       VALUES ($1,'manual',$2,$3,$4,$5,$6,'Ownership watchlist',FALSE,$7)
       ON CONFLICT (ats, slug) DO NOTHING
       RETURNING id`,
      [watch.name, slugify(watch.name), watch.industry, watch.size, watch.hq, watch.careersUrl, watch.note],
    );
    inserted += res.length;
  }
  await applyOwnership();
  return inserted;
}

export function careersUrlFor(ats: string, slug: string): string {
  switch (ats) {
    // Workday slugs carry their own tenant/site pair, e.g. "accenture/AccentureCareers".
    case 'workday': return slug.includes('/') ? `https://${slug.split('/')[0]}.wd1.myworkdayjobs.com/${slug.split('/')[1]}` : '';
    case 'greenhouse': return `https://boards.greenhouse.io/${slug}`;
    case 'lever': return `https://jobs.lever.co/${slug}`;
    case 'ashby': return `https://jobs.ashbyhq.com/${slug}`;
    case 'workable': return `https://apply.workable.com/${slug}/`;
    case 'recruitee': return `https://${slug}.recruitee.com/`;
    case 'smartrecruiters': return `https://jobs.smartrecruiters.com/${slug}`;
    default: return '';
  }
}

async function applyOwnership(): Promise<void> {
  for (const record of OWNERSHIP_RECORDS) {
    await q(
      `UPDATE employers
          SET black_owned = $2,
              ownership_status = $3,
              ownership_source = $4
        WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace($1, '[^a-zA-Z0-9]', '', 'g'))`,
      [record.name, record.blackOwned, record.status, record.source],
    );
  }
}

/* --------------------------------------------------------------- evaluation */

function ownershipLabel(employer: EmployerRow | null | undefined): { label: string; source: string | null } {
  if (!employer?.black_owned) return { label: 'Not verified', source: null };
  return {
    label: employer.ownership_status === 'Verified' ? 'Verified Black-owned' : standardiseOwnership(employer.ownership_status),
    source: employer.ownership_source,
  };
}

function standardiseOwnership(status: string): string {
  if (status === 'Verified') return 'Verified Black-owned';
  if (status === 'Self-reported') return 'Self-reported';
  if (status === 'Not verified') return 'Not verified';
  return 'Not researched';
}

/**
 * Applies every placement rule. Returns null when a job should not be stored at
 * all (not remote, non-US, state-restricted). Placement failures that a human
 * could still act on land in the verification queue instead of the tabs.
 */
export function evaluateRaw(raw: RawJob, employer?: EmployerRow | null): EvaluatedJob | null {
  const description = (raw.descriptionText ?? '').replace(/\s+/g, ' ').trim();
  const postedAt = raw.postedAt ?? null;
  const age = daysBetween(postedAt);

  if (age !== null && age > RULES.archiveDays) return null;

  const loc = evaluateLocation({
    locations: raw.locations,
    workplaceType: raw.workplaceType,
    isRemote: raw.isRemote,
    restrictions: raw.restrictions,
    description,
  });

  // Nothing is discarded silently: a role that fails a location rule is still stored, in the
  // verification queue, with the exact reason. The salary tabs stay untouched, but Jeanine can
  // see every posting that was found and why it did not qualify.
  let forced: { bucket: 'queue'; reason: string } | null = null;
  // A posting outside the United States can never be applied to from California, so it is the one
  // case that is dropped rather than queued.
  if (loc.ca === 'not_us') return null;
  if (loc.remote !== 'remote') {
    forced = { bucket: 'queue', reason: `Posting reads as ${loc.remote === 'hybrid' ? 'hybrid' : loc.remote === 'onsite' ? 'on-site' : 'not confirmed remote'} — ${loc.note || loc.remoteLabel}.` };
  } else if (loc.travelHeavy) {
    forced = { bucket: 'queue', reason: 'Requires routine travel, which is incompatible with genuine remote work.' };
  } else if (loc.ca === 'state_restricted') {
    forced = { bucket: 'queue', reason: `Residency restricted to ${(loc.states ?? []).join(', ') || 'another state'}; California applicants cannot be considered.` };
  }

  const category = classifyCategory(raw.title, description, ACTIVE_ROLE_FAMILY);
  const match = scoreJob({
    title: raw.title,
    description,
    category,
    industry: raw.industry ?? employer?.industry ?? null,
    family: ACTIVE_ROLE_FAMILY,
  });
  const urgency = detectUrgency(description);
  const salary = raw.salary ?? null;
  const ownership = ownershipLabel(employer);

  let bucket: EvaluatedJob['bucket'] = 'queue';
  let reason = '';

  if (forced) {
    bucket = forced.bucket;
    reason = forced.reason;
  } else if (!postedAt) {
    reason = `Original posting date is not published \u2014 the ${RULES.windowDays}-day rule cannot be verified.`;
  } else if (age !== null && age > RULES.windowDays - 1) {
    bucket = 'archived';
    reason = `Posted ${age} days ago \u2014 outside the ${RULES.windowDays}-day window.`;
  } else if (raw.postedConfidence !== 'confirmed') {
    reason = 'Board publishes only a last-updated date, so the original posting date is unverified.';
  } else if (!salary) {
    // Live, not rejected: the role passes every other rule but the employer publishes no pay.
    bucket = 'unsalaried';
    reason = 'No salary published on the employer posting \u2014 listed in the "Pay not published" tab.';
  } else if (salary.isOTE) {
    bucket = 'unsalaried';
    reason = 'Only OTE / total-compensation figures are published; base salary is not stated.';
  } else {
    const cls = classifySalary(salary.min, salary.max, salary.interval, salary.hourlyRate);
    if (cls.bucket === 'none') {
      reason = cls.reason;
    } else if (raw.linkType !== 'employer') {
      reason = 'Direct employer application link not located yet \u2014 only a job-board listing is available.';
    } else {
      bucket = cls.bucket;
      reason = cls.reason;
    }
  }

  const jobKey = `${raw.source}:${raw.externalId}`.slice(0, 190);

  return {
    jobKey,
    employerId: employer?.id ?? null,
    company: raw.company,
    title: raw.title,
    category,
    industry: raw.industry ?? employer?.industry ?? null,
    companySize: raw.companySize ?? employer?.company_size ?? null,
    hqState: raw.hqState ?? employer?.hq_state ?? null,
    remoteStatus: loc.remoteLabel || 'Remote',
    caEligibility: loc.ca,
    caNote: loc.note,
    employmentType: raw.employmentType ?? null,
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryInterval: salary?.interval ?? null,
    hourlyRate: salary?.hourlyRate ?? null,
    salarySource: raw.salarySource ?? (salary ? 'Employer posting' : null),
    salaryNote: salary?.evidence ?? null,
    matchScore: match.score,
    bestResume: match.bestResume,
    matchReasons: match.reasons,
    gaps: match.gaps,
    urgency: urgency.level,
    urgencyEvidence: urgency.evidence,
    blackOwnedVerification: ownership.label,
    ownershipSource: ownership.source,
    applyUrl: raw.applyUrl,
    linkType: raw.linkType,
    requisitionId: raw.requisitionId ?? null,
    postedAt,
    postedSource: raw.source,
    postedConfidence: raw.postedConfidence ?? 'unknown',
    bucket,
    bucketReason: reason,
    descriptionExcerpt: truncate(description, 900),
    source: raw.source,
    remoteLabel: loc.remoteLabel,
  };
}

/* -------------------------------------------------------------------- upsert */

interface UpsertOutcome {
  id: number;
  inserted: boolean;
  bucket: string;
}

async function upsertJob(ev: EvaluatedJob): Promise<UpsertOutcome> {
  const rows = await q<{ id: number; inserted: boolean; bucket: string }>(
    `INSERT INTO jobs (
        job_key, employer_id, company, title, category, industry, company_size, hq_state,
        remote_status, ca_eligibility, ca_eligibility_note, employment_type,
        salary_min, salary_max, salary_interval, hourly_rate, salary_source, salary_note,
        match_score, best_resume, match_reasons, gaps, urgency, urgency_evidence,
        black_owned_verification, ownership_source, apply_url, link_type, requisition_id,
        posted_at, posted_source, posted_confidence, last_verified_at,
        bucket, bucket_reason, description_excerpt, source
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21::jsonb,$22::jsonb,$23,$24,$25,$26,$27,$28,$29,$30::date,$31,$32,now(),$33,$34,$35,$36
     )
     ON CONFLICT (job_key) DO UPDATE SET
        company = EXCLUDED.company,
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        industry = COALESCE(EXCLUDED.industry, jobs.industry),
        company_size = COALESCE(EXCLUDED.company_size, jobs.company_size),
        hq_state = COALESCE(EXCLUDED.hq_state, jobs.hq_state),
        remote_status = EXCLUDED.remote_status,
        ca_eligibility = EXCLUDED.ca_eligibility,
        ca_eligibility_note = EXCLUDED.ca_eligibility_note,
        employment_type = COALESCE(EXCLUDED.employment_type, jobs.employment_type),
        salary_min = EXCLUDED.salary_min,
        salary_max = EXCLUDED.salary_max,
        salary_interval = EXCLUDED.salary_interval,
        hourly_rate = EXCLUDED.hourly_rate,
        salary_source = EXCLUDED.salary_source,
        salary_note = EXCLUDED.salary_note,
        match_score = EXCLUDED.match_score,
        best_resume = EXCLUDED.best_resume,
        match_reasons = EXCLUDED.match_reasons,
        gaps = EXCLUDED.gaps,
        urgency = CASE WHEN jobs.urgency = 'High' THEN jobs.urgency ELSE EXCLUDED.urgency END,
        urgency_evidence = COALESCE(jobs.urgency_evidence, EXCLUDED.urgency_evidence),
        black_owned_verification = EXCLUDED.black_owned_verification,
        ownership_source = EXCLUDED.ownership_source,
        apply_url = EXCLUDED.apply_url,
        link_type = EXCLUDED.link_type,
        requisition_id = COALESCE(EXCLUDED.requisition_id, jobs.requisition_id),
        posted_at = COALESCE(EXCLUDED.posted_at, jobs.posted_at),
        posted_source = EXCLUDED.posted_source,
        posted_confidence = EXCLUDED.posted_confidence,
        last_seen_at = now(),
        last_verified_at = now(),
        bucket = EXCLUDED.bucket,
        bucket_reason = EXCLUDED.bucket_reason,
        description_excerpt = EXCLUDED.description_excerpt,
        employer_id = COALESCE(EXCLUDED.employer_id, jobs.employer_id),
        updated_at = now()
     RETURNING id, (xmax = 0) AS inserted, bucket`,
    [
      ev.jobKey, ev.employerId, ev.company, ev.title, ev.category, ev.industry, ev.companySize, ev.hqState,
      ev.remoteStatus, ev.caEligibility, ev.caNote, ev.employmentType,
      ev.salaryMin, ev.salaryMax, ev.salaryInterval, ev.hourlyRate, ev.salarySource, ev.salaryNote,
      ev.matchScore, ev.bestResume, JSON.stringify(ev.matchReasons), JSON.stringify(ev.gaps), ev.urgency, ev.urgencyEvidence,
      ev.blackOwnedVerification, ev.ownershipSource, ev.applyUrl, ev.linkType, ev.requisitionId,
      ev.postedAt, ev.postedSource, ev.postedConfidence,
      ev.bucket, ev.bucketReason, ev.descriptionExcerpt, ev.source,
    ],
  );
  return rows[0];
}

/* ---------------------------------------------------------------- discovery */

async function probeAts(name: string): Promise<{ ats: Ats; slug: string } | null> {
  const base = slugify(name);
  if (!base || base.length < 3) return null;
  const variants = [...new Set([base, base.replace(/-/g, ''), base.split('-')[0]])].filter((v) => v.length >= 3);
  for (const slug of variants) {
    try {
      const gh = await fetchJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, 12_000);
      if (Array.isArray(gh.jobs)) return { ats: 'greenhouse', slug };
    } catch { /* not this one */ }
    try {
      const ab = await fetchJson<{ jobs?: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, 12_000);
      if (Array.isArray(ab.jobs)) return { ats: 'ashby', slug };
    } catch { /* not this one */ }
    try {
      const lv = await fetchJson<unknown[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, 12_000);
      if (Array.isArray(lv) && lv.length) return { ats: 'lever', slug };
    } catch { /* not this one */ }
  }
  return null;
}

/* -------------------------------------------------------------- run summary */

export interface RunCounters {
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
  errors: { source: string; message: string }[];
}

function emptyCounters(): RunCounters {
  return {
    employersSearched: 0, sourcesChecked: 0, sourcesFailed: 0, jobsFetched: 0, jobsMatched: 0,
    newJobs: 0, addedTab1: 0, addedTab2: 0, queued: 0, duplicates: 0, archived: 0, closed: 0,
    newEmployers: 0, linksChecked: 0, linksValid: 0, errors: [],
  };
}

async function recordSource(source: string, label: string, ok: boolean, jobs: number, error?: string): Promise<void> {
  await q(
    `INSERT INTO source_health (source, label, last_attempt, last_ok, last_jobs, ok, error, attempts, failures)
     VALUES ($1,$2,now(),CASE WHEN $3 THEN now() ELSE NULL END,$4,$3,$5,1,CASE WHEN $3 THEN 0 ELSE 1 END)
     ON CONFLICT (source) DO UPDATE SET
        label = EXCLUDED.label,
        last_attempt = now(),
        last_ok = CASE WHEN $3 THEN now() ELSE source_health.last_ok END,
        last_jobs = $4,
        ok = $3,
        error = $5,
        attempts = source_health.attempts + 1,
        failures = source_health.failures + CASE WHEN $3 THEN 0 ELSE 1 END`,
    [source, label, ok, jobs, error ?? null],
  );
}

/* ---------------------------------------------------------------- main cycle */

async function createRunRow(trigger: string): Promise<number> {
  const run = await one<{ id: number }>(
    `INSERT INTO refresh_runs (trigger, status, progress) VALUES ($1,'running','Starting') RETURNING id`,
    [trigger],
  );
  return run!.id;
}

async function currentRunningRun(): Promise<number | null> {
  const existing = await one<{ id: number }>(
    `SELECT id FROM refresh_runs WHERE status='running' ORDER BY id DESC LIMIT 1`,
  );
  return existing?.id ?? null;
}

/**
 * Blocking refresh used by the CLI and the schedule. Only one sweep may run per database,
 * whichever process asks: a second caller gets the id of the run already in flight.
 */
export async function runRefresh(trigger: string): Promise<number> {
  await migrate();
  const lock = await acquireRefreshLock();
  if (!lock) {
    const existing = await currentRunningRun();
    if (existing) return existing;
    throw new Error('A refresh is already running in another process');
  }
  return executeRun(await claimRun(trigger, lock), lock);
}

/** Creates the run row; if that fails the lock is given back rather than held until exit. */
async function claimRun(trigger: string, lock: RefreshLock): Promise<number> {
  try {
    return await createRunRow(trigger);
  } catch (err) {
    await lock.release();
    throw err;
  }
}

/**
 * Fire-and-forget refresh used by the REFRESH JOBS NOW button: the run id comes
 * back immediately so the dashboard can poll live progress.
 */
export async function startRefresh(trigger: string): Promise<{ runId: number; alreadyRunning: boolean }> {
  await migrate();
  const lock = await acquireRefreshLock();
  if (!lock) {
    const existing = await currentRunningRun();
    return { runId: existing ?? 0, alreadyRunning: true };
  }
  const runId = await claimRun(trigger, lock);
  void executeRun(runId, lock).catch((err) => console.error('[refresh] run failed', err));
  return { runId, alreadyRunning: false };
}

/** Counter columns written on every progress update, on completion and on failure. */
const COUNTER_COLUMNS = `
  employers_searched=$3, sources_checked=$4, sources_failed=$5,
  jobs_fetched=$6, jobs_matched=$7, new_jobs=$8, added_tab1=$9, added_tab2=$10,
  queued=$11, duplicates=$12, archived=$13, closed=$14, new_employers=$15,
  links_checked=$16, links_valid=$17, errors=$18::jsonb`;

function counterValues(c: RunCounters): unknown[] {
  return [
    c.employersSearched, c.sourcesChecked, c.sourcesFailed, c.jobsFetched, c.jobsMatched, c.newJobs,
    c.addedTab1, c.addedTab2, c.queued, c.duplicates, c.archived, c.closed, c.newEmployers,
    c.linksChecked, c.linksValid, JSON.stringify(c.errors.slice(0, 25)),
  ];
}

async function executeRun(runId: number, lock: RefreshLock): Promise<number> {
  running = true;
  const counters = emptyCounters();

  // Progress writes carry the live counters too, so a run that dies mid-sweep still shows
  // how many employers it searched and how many postings it read, instead of zeros.
  const progress = async (message: string) => {
    // The lock lives on its own connection. If Neon dropped that connection the lock went
    // with it and another process may already be sweeping; stop rather than run two at once.
    if (!lock.held) throw new Error('Refresh lock connection lost; stopping so a second sweep cannot overlap');
    await q(
      `UPDATE refresh_runs SET progress=$2, ${COUNTER_COLUMNS} WHERE id=$1`,
      [runId, message.slice(0, 300), ...counterValues(counters)],
    );
  };

  try {
    const employerCount = await one<{ count: string }>(`SELECT count(*)::text AS count FROM employers`);
    if (!employerCount || employerCount.count === '0') {
      await progress('Seeding employer inventory');
      await seedEmployers();
    } else {
      await applyOwnership();
    }

    const employers = await q<EmployerRow>(
      `SELECT id, slug, ats, name, industry, company_size, hq_state, careers_url,
              black_owned, ownership_status, ownership_source, last_searched_at::text, active
         FROM employers
        WHERE active = TRUE
          AND (ats <> 'manual' OR careers_url ILIKE '%myworkdayjobs%')
        ORDER BY last_searched_at ASC NULLS FIRST
        LIMIT $1`,
      [REFRESH.employersPerRun],
    );

    const byCompany = new Map<string, EmployerRow>();
    for (const employer of employers) byCompany.set(companyKey(employer.name), employer);

    const linkCandidates: number[] = [];
    let processed = 0;

    // One employer's failure — a board timing out, or a statement lost to a dropped
    // connection that outlived its retries — is recorded against that employer and the
    // sweep moves on. It must never abort the run: that is how runs 12-20 died with zero
    // employers searched while the boards themselves were fine.
    await mapLimit(employers, REFRESH.concurrency, async (employer) => {
      processed += 1;
      try {
        if (processed % 12 === 0) await progress(`Searching employer boards (${processed}/${employers.length})`);
        await sweepEmployer(employer);
      } catch (err) {
        counters.sourcesFailed += 1;
        counters.errors.push({ source: `${employer.ats}:${employer.slug}`, message: (err as Error).message.slice(0, 160) });
        console.error(`[refresh] ${employer.ats}:${employer.slug} failed`, (err as Error).message);
      }
    });

    async function sweepEmployer(employer: EmployerRow): Promise<void> {
      const result = await fetchBoard(employer);
      counters.sourcesChecked += 1;

      if (!result.ok) {
        counters.sourcesFailed += 1;
        counters.errors.push({ source: `${employer.ats}:${employer.slug}`, message: result.error ?? 'Unknown error' });
        // A board is retired after three failures that say the board is gone (404, wrong
        // slug, unsupported ATS). Timeouts, 5xx and Workday's maintenance window are the
        // moment's fault, not the board's: they are recorded but never move fail_count, so a
        // maintenance window cannot retire every Workday employer in one sweep.
        await q(
          result.retryable
            ? `UPDATE employers
                  SET last_searched_at = now(),
                      last_status = 'Board temporarily unavailable — will retry next run',
                      last_error = $2
                WHERE id = $1`
            : `UPDATE employers
                  SET last_searched_at = now(),
                      last_status = CASE WHEN fail_count + 1 >= 3
                                         THEN 'No public feed (retired after 3 failed checks)'
                                         ELSE 'Unreachable board' END,
                      last_error = $2,
                      fail_count = fail_count + 1,
                      active = CASE WHEN fail_count + 1 >= 3 THEN FALSE ELSE active END
                WHERE id = $1`,
          [employer.id, (result.error ?? '').slice(0, 200)],
        );
        await recordSource(`${employer.ats}:${employer.slug}`, employer.name, false, 0, result.error);
        return;
      }

      counters.employersSearched += 1;
      counters.jobsFetched += result.totalListed;

      const seenKeys = new Set<string>();
      let matched = 0;

      for (const raw of result.jobs) {
        const ev = evaluateRaw(raw, employer);
        if (!ev) continue;
        matched += 1;
        seenKeys.add(ev.jobKey);
        const outcome = await upsertJob(ev);
        if (outcome.inserted) {
          counters.newJobs += 1;
          if (outcome.bucket === 'tab1') counters.addedTab1 += 1;
          if (outcome.bucket === 'tab2') counters.addedTab2 += 1;
          if (outcome.bucket === 'unsalaried') counters.queued += 0;
          if (outcome.bucket === 'queue') counters.queued += 1;
          if ((outcome.bucket === 'tab1' || outcome.bucket === 'tab2') && linkCandidates.length < REFRESH.linkChecksPerRun) {
            linkCandidates.push(outcome.id);
          }
        }
      }
      counters.jobsMatched += matched;

      // Anything previously live for this employer but no longer listed has closed.
      if (seenKeys.size || matched === 0) {
        const closed = await q<{ id: number }>(
          `UPDATE jobs
              SET bucket='archived',
                  bucket_reason='No longer listed on the employer''s job board (closed or filled).',
                  updated_at=now()
            WHERE employer_id = $1
              AND bucket IN ('tab1','tab2')
              AND last_seen_at < now() - INTERVAL '10 minutes'
            RETURNING id`,
          [employer.id],
        );
        counters.closed += closed.length;
      }

      await q(
        `UPDATE employers
            SET last_searched_at = now(), last_status = $2, last_error = NULL,
                jobs_seen = $3, fail_count = 0
          WHERE id = $1`,
        [employer.id, `${result.totalListed} postings, ${matched} ${ACTIVE_ROLE_FAMILY.jobNoun}`, result.totalListed],
      );
      await recordSource(`${employer.ats}:${employer.slug}`, employer.name, true, result.totalListed);
    }

    // Employer job boards only. Aggregator feeds are deliberately not ingested:
    // every role must come from the employer's own career site so the link and
    // the posting date are first-party.

    // --- Employer discovery -------------------------------------------------
    // Master prompt s.14: a refresh must discover additional employers, not only re-check known
    // ones. We take a small batch from the discovery queue (fed by the portfolio sweep) and probe
    // each company's own applicant-tracking system.
    await progress('Discovering new employers');
    try {
      const pending = await q<{ id: number; name: string; industry: string | null; hq_state: string | null }>(
        `SELECT id, name, industry, hq_state FROM discovery_queue
          WHERE status='pending' AND tries < 3
          ORDER BY tries ASC, id ASC
          LIMIT $1`,
        [REFRESH.discoverPerRun ?? 12],
      );
      for (const row of pending) {
        const found = await probeAts(row.name);
        if (found) {
          const inserted = await q<{ id: number }>(
            `INSERT INTO employers (name, ats, slug, industry, company_size, hq_state, careers_url, discovered_via, active)
             VALUES ($1,$2,$3,$4,'Midsize',$5,$6,'Portfolio discovery',TRUE)
             ON CONFLICT (ats, slug) DO NOTHING
             RETURNING id`,
            [row.name, found.ats, found.slug, row.industry, row.hq_state, careersUrlFor(found.ats, found.slug)],
          );
          if (inserted.length) counters.newEmployers += 1;
          await q(
            `UPDATE discovery_queue SET status='found', tries=tries+1, found_ats=$2, found_slug=$3, checked_at=now() WHERE id=$1`,
            [row.id, found.ats, found.slug],
          );
        } else {
          await q(`UPDATE discovery_queue SET tries=tries+1, checked_at=now() WHERE id=$1`, [row.id]);
        }
      }
      if (pending.length) await progress(`Probed ${pending.length} new employers`);
    } catch (err) {
      counters.errors.push({ source: 'discovery', message: (err as Error).message.slice(0, 160) });
    }

    // --- Post-processing ---------------------------------------------------
    await progress('Removing duplicates');
    counters.duplicates += await dedupeJobs();

    await progress('Flagging employers hiring several similar roles');
    await flagMultiRoleUrgency();

    await progress(`Applying the ${RULES.windowDays}-day window`);
    counters.archived += await archiveByAge();

    await progress(`Verifying ${linkCandidates.length} application links`);
    for (const id of linkCandidates) {
      const job = await one<{ id: number; apply_url: string; bucket: string }>(
        `SELECT id, apply_url, bucket FROM jobs WHERE id=$1`,
        [id],
      );
      if (!job) continue;
      const check = await checkLink(job.apply_url);
      counters.linksChecked += 1;
      if (check.ok) {
        counters.linksValid += 1;
        await q(
          `UPDATE jobs SET link_verified_at=now(), link_status=$2 WHERE id=$1`,
          [job.id, `HTTP ${check.status}`],
        );
      } else {
        await q(
          `UPDATE jobs
              SET link_status=$2, bucket='queue',
                  bucket_reason='Application link did not respond during verification \u2014 re-check before applying.',
                  updated_at=now()
            WHERE id=$1`,
          [job.id, check.error ?? `HTTP ${check.status}`],
        );
      }
    }

    await progress('Finalising');
    await q(
      `UPDATE refresh_runs SET
          status='completed', finished_at=now(), progress='Complete', ${COUNTER_COLUMNS},
          message=$2
        WHERE id=$1`,
      [
        runId,
        `${counters.newJobs} new leads, ${counters.addedTab1 + counters.addedTab2} added to salary tabs.`,
        ...counterValues(counters),
      ],
    );
    return runId;
  } catch (err) {
    const message = (err as Error).message;
    counters.errors.unshift({ source: 'engine', message });
    try {
      await q(
        `UPDATE refresh_runs SET status='failed', finished_at=now(), message=$2, ${COUNTER_COLUMNS} WHERE id=$1`,
        [runId, message.slice(0, 300), ...counterValues(counters)],
      );
    } catch (writeErr) {
      // The failure itself was probably a lost connection; if the record cannot be written
      // the row stays 'running' and markInterruptedRuns() closes it on the next boot.
      console.error('[refresh] could not record failure', (writeErr as Error).message);
    }
    throw err;
  } finally {
    running = false;
    await lock.release();
  }
}

/* ------------------------------------------------------------ post-processors */

async function dedupeJobs(): Promise<number> {
  const rows = await q<{
    id: number; company: string; title: string; link_type: string; posted_at: string | null; bucket: string;
  }>(
    `SELECT id, company, title, link_type, posted_at::text, bucket
       FROM jobs
      WHERE bucket IN ('tab1','tab2','queue')
      ORDER BY (link_type = 'employer') DESC, posted_at ASC NULLS LAST, id ASC`,
  );
  const winners = new Map<string, { id: number; company: string; title: string }>();
  const losers: { id: number; of: number; company: string; title: string }[] = [];
  for (const row of rows) {
    const key = `${companyKey(row.company)}::${titleKey(row.title)}`;
    const winner = winners.get(key);
    if (winner) {
      if (row.link_type === 'employer' && winner.id > row.id) {
        // the employer-linked record should win; swap
        losers.push({ id: winner.id, of: row.id, company: winner.company, title: winner.title });
        winners.set(key, { id: row.id, company: row.company, title: row.title });
      } else {
        losers.push({ id: row.id, of: winner.id, company: row.company, title: row.title });
      }
    } else {
      winners.set(key, { id: row.id, company: row.company, title: row.title });
    }
  }
  for (const loser of losers) {
    await q(
      `UPDATE jobs SET bucket='excluded',
              bucket_reason=$2,
              updated_at=now()
        WHERE id=$1`,
      [loser.id, `Duplicate of record #${loser.of} (same role at ${loser.company}).`],
    );
  }
  return losers.length;
}

async function flagMultiRoleUrgency(): Promise<void> {
  const rows = await q<{ company: string; open_roles: string }>(
    `SELECT company, count(*)::text AS open_roles
       FROM jobs
      WHERE bucket IN ('tab1','tab2')
      GROUP BY company
     HAVING count(*) >= 2`,
  );
  for (const row of rows) {
    await q(
      `UPDATE jobs
          SET urgency='Medium',
              urgency_evidence=COALESCE(urgency_evidence, $2)
        WHERE company=$1 AND bucket IN ('tab1','tab2') AND urgency='Low'`,
      [row.company, `Employer is recruiting ${row.open_roles} project/program roles at the same time (inferred, not stated in the posting).`],
    );
  }
}

async function archiveByAge(): Promise<number> {
  const closed = await q<{ id: number }>(
    `UPDATE jobs
        SET bucket='archived',
            bucket_reason='Exceeded the ' || $1 || '-day posting window (posted ' ||
              to_char(posted_at,'Mon DD') || ').',
            updated_at=now()
      WHERE bucket IN ('tab1','tab2')
        AND posted_at IS NOT NULL
        AND posted_at < (CURRENT_DATE - ($1::int - 1))
      RETURNING id`,
    [RULES.windowDays],
  );
  return closed.length;
}

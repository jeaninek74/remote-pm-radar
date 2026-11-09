import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cron from 'node-cron';
import { healthCheck, migrate, q, refreshLockHeldElsewhere, one } from './db';
import { APP, REFRESH, RULES } from './config';
import {
  browserPullAllowsClosure,
  discoveryStatus,
  emptyCounters,
  ingestBoardResult,
  isRefreshing,
  runRefresh,
  seedEmployers,
  startDiscovery,
  startRefresh,
} from './engine/ingest';
import {
  browserJobsFromPages,
  isBrowserIngestAuthorized,
  isBrowserIngestPayload,
} from './engine/browser-pull';
import { verifyGithubOidcToken } from './engine/github-oidc';
import {
  getStats, listEmployers, listJobs, listRuns, listSources, queueSummary, updateTracking,
} from './queries';
import { buildCsv, buildWorkbook } from './export';
import { PROFILE, describeProfile } from './profile';
import { buildIdFromHtml } from '../client/src/buildVersion';
import type { EmployerRow } from './engine/types';

/** Filename stem for exports, derived from the board name so nothing is branded by hand. */
function exportSlug(): string {
  return PROFILE.boardName.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'job-radar';
}

const PORT = Number(process.env.PORT ?? 3000);
// Opt-in, not opt-out. Two processes sweeping one Neon database produce
// "Authentication timed out" and corrupt each other's run bookkeeping, so a copy of
// this app only schedules work when it is explicitly told to. The production service
// sets ENABLE_CRON=1; every other copy (previews, scratch containers) stays quiet.
const CRON_ENABLED = process.env.ENABLE_CRON === '1';
const CRON_EXPRESSION = process.env.REFRESH_CRON ?? '*/30 * * * *';
/** Works whether the server runs from dist/ (production) or server/ (tsx dev). */
const PUBLIC_DIR = [
  path.join(__dirname, 'client'),
  path.join(process.cwd(), 'dist', 'client'),
  path.join(__dirname, '..', 'dist', 'client'),
].find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? path.join(process.cwd(), 'dist', 'client');

function readBuildId(): string {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  try {
    const html = fs.readFileSync(indexPath, 'utf8');
    const buildId = buildIdFromHtml(html);
    if (buildId) return buildId;
  } catch {
    // Fall through to the file timestamp when the asset name is unavailable.
  }
  try {
    return `mtime-${fs.statSync(indexPath).mtimeMs}`;
  } catch {
    return 'unavailable';
  }
}

const BUILD_ID = readBuildId();

const app = express();
app.disable('x-powered-by');
const apiJsonParser = express.json({ limit: '256kb' });
app.use((req, res, next) => {
  if (req.path === '/api/browser-ingest') return next();
  return apiJsonParser(req, res, next);
});

function requireBrowserIngestToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  return (async () => {
    try {
      const authorization = req.get('Authorization');
      if (!await isBrowserIngestAuthorized(
        authorization,
        process.env.BROWSER_INGEST_TOKEN,
        verifyGithubOidcToken,
      )) {
        res.sendStatus(401);
        return;
      }
      next();
    } catch {
      res.sendStatus(401);
    }
  })();
}

function nextScheduledRefresh(from = new Date()): string | null {
  // The schedule is every thirty minutes, so the next run is the next :00 or :30 in
  // UTC. A custom cron expression cannot be predicted this cheaply, so it reports
  // nothing rather than guessing a time the scheduler will not honour.
  if (!CRON_ENABLED || CRON_EXPRESSION !== '*/30 * * * *') return null;
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  const minutes = next.getUTCMinutes();
  next.setUTCMinutes(minutes + (minutes < 30 ? 30 - minutes : 60 - minutes));
  return next.toISOString();
}

/* ------------------------------------------------------------------- health */

app.get('/api/health', async (_req, res) => {
  const db = await healthCheck();
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    app: APP.name,
    version: APP.version,
    buildId: BUILD_ID,
    database: db.ok ? 'connected' : db.error,
    refreshing: isRefreshing(),
    time: new Date().toISOString(),
  });
});

/* ---------------------------------------------------------------- dashboard */

app.get('/api/bootstrap', async (_req, res, next) => {
  try {
    const [stats, runs, sources, reasons] = await Promise.all([
      getStats(),
      listRuns(8),
      listSources(),
      queueSummary(),
    ]);
    res.json({
      stats,
      runs,
      sources,
      queueReasons: reasons,
      nextRefresh: nextScheduledRefresh(),
      cronEnabled: CRON_ENABLED,
      cronExpression: CRON_EXPRESSION,
      windowDays: RULES.windowDays,
      profile: describeProfile(),
      buildId: BUILD_ID,
      refreshing: isRefreshing(),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/profile', (_req, res) => {
  res.json(describeProfile());
});

app.get('/api/jobs', async (_req, res, next) => {
  try {
    res.json({ jobs: await listJobs() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/employers', async (_req, res, next) => {
  try {
    res.json({ employers: await listEmployers() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/browser-employers', requireBrowserIngestToken, async (_req, res, next) => {
  try {
    const employers = await q<{
      id: number;
      name: string;
      slug: string;
      careers_url: string;
      job_keys: string[];
    }>(
      `SELECT e.id, e.name, e.slug, e.careers_url,
              COALESCE(array_agg(j.job_key) FILTER (WHERE j.job_key IS NOT NULL), ARRAY[]::text[]) AS job_keys
         FROM employers e
         LEFT JOIN jobs j ON j.employer_id = e.id
        WHERE e.active = TRUE AND e.ats = 'browser' AND e.careers_url IS NOT NULL
        GROUP BY e.id
        ORDER BY e.id`,
    );
    res.json({ employers });
  } catch (err) {
    next(err);
  }
});

app.post(
  '/api/browser-ingest',
  requireBrowserIngestToken,
  express.json({ limit: '8mb' }),
  async (req, res, next) => {
    try {
      if (!isBrowserIngestPayload(req.body)) {
        res.status(400).json({ error: 'Invalid browser ingest payload' });
        return;
      }
      if (isRefreshing()) {
        res.status(409).json({ error: 'A refresh is running; retry the browser ingest later' });
        return;
      }
      const runningRun = await one<{ id: number }>(
        `SELECT id FROM refresh_runs WHERE status='running' ORDER BY id DESC LIMIT 1`,
      );
      if (runningRun) {
        res.status(409).json({ error: 'A refresh is running; retry the browser ingest later' });
        return;
      }

      const employerRows = await q<EmployerRow>(
        `SELECT id, slug, ats, name, industry, company_size, hq_state, careers_url,
                black_owned, ownership_status, ownership_source, last_searched_at::text,
                last_resolve_at::text, active
           FROM employers
          WHERE id = $1 AND active = TRUE AND ats = 'browser'`,
        [req.body.employerId],
      );
      const employer = employerRows[0];
      if (!employer) {
        res.status(404).json({ error: 'Active browser employer not found' });
        return;
      }
      const knownRows = await q<{ job_key: string }>(
        `SELECT job_key FROM jobs WHERE employer_id = $1`,
        [employer.id],
      );
      const listedUrls = [...new Set(req.body.listedUrls)];
      const jobs = browserJobsFromPages(
        employer,
        new Set(knownRows.map((row) => row.job_key)),
        listedUrls,
        req.body.pages,
      );
      const result = {
        jobs,
        ok: true,
        totalListed: listedUrls.length,
        truncated: !req.body.complete || req.body.timedOut,
      };
      const counts = await ingestBoardResult(
        employer,
        result,
        emptyCounters(),
        [],
        browserPullAllowsClosure(req.body.complete, req.body.timedOut, listedUrls.length),
      );
      res.json(counts);
    } catch (err) {
      next(err);
    }
  },
);

app.get('/api/runs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 40), 100);
    res.json({ runs: await listRuns(limit), sources: await listSources() });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/jobs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid job id' });
      return;
    }
    const updated = await updateTracking(id, req.body ?? {});
    if (!updated) {
      res.status(400).json({ error: 'No valid tracking fields supplied' });
      return;
    }
    res.json({ job: updated });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ refresh */

app.post('/api/discover', async (req, res, next) => {
  try {
    const budget = Number(req.body?.budgetMs) > 0 ? Number(req.body.budgetMs) : REFRESH.discoverPassBudgetMs;
    const result = await startDiscovery(budget);
    res.status(result.started ? 202 : 409).json({ ...result, ...discoveryStatus() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/refresh', async (req, res, next) => {
  try {
    const { runId, alreadyRunning } = await startRefresh(req.body?.trigger === 'schedule' ? 'schedule' : 'manual');
    res.status(alreadyRunning ? 409 : 202).json({
      runId,
      alreadyRunning,
      message: alreadyRunning
        ? 'A refresh is already running; attach to its progress.'
        : 'Refresh started. Live progress is available on this run.',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/refresh/status', async (_req, res, next) => {
  try {
    const rows = await q<{
      id: number; status: string; progress: string | null; started_at: string; finished_at: string | null;
      new_jobs: number; added_tab1: number; added_tab2: number; queued: number; employers_searched: number;
      sources_checked: number; sources_failed: number; duplicates: number; archived: number;
      new_employers: number; links_checked: number; links_valid: number; message: string | null;
      errors: { source: string; message: string }[];
    }>(
      `SELECT id, status, progress, started_at::text, finished_at::text, new_jobs, added_tab1, added_tab2,
              queued, employers_searched, sources_checked, sources_failed, duplicates, archived,
              new_employers, links_checked, links_valid, message, errors
         FROM refresh_runs ORDER BY id DESC LIMIT 1`,
    );
    res.json({ run: rows[0] ?? null, refreshing: isRefreshing(), buildId: BUILD_ID });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------- export */

app.get('/api/export.xlsx', async (_req, res, next) => {
  try {
    const [jobs, employers, runs, stats] = await Promise.all([
      listJobs(), listEmployers(), listRuns(40), getStats(),
    ]);
    const buffer = await buildWorkbook({
      jobs,
      employers,
      runs,
      stats: {
        'Report generated': new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        'Active jobs in $90K–$110K tab': stats.tab0,
        'Active jobs in $110K–$130K tab': stats.tab1,
        'Active jobs in $150K+ tab': stats.tab2,
        'Nontechnical roles': stats.nontechnical,
        'Technical roles': stats.technical,
        'Business-tech roles': stats.hybrid,
        'Urgently hiring (confirmed)': stats.urgent,
        'Verified Black-owned employers with openings': stats.blackOwnedEmployers,
        'Needs verification': stats.queue,
        'Archived': stats.archived,
        'Employers tracked': stats.employersTracked,
        'Employers searched': stats.employersSearched,
        'States represented': stats.statesSearched,
        'Last successful refresh': stats.lastRefresh ?? 'Not yet run',
        'Posting window (days)': stats.windowDays,
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportSlug()}-${stamp}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

app.get('/api/export.csv', async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket ?? 'all');
    const jobs = (await listJobs()).filter((job) => bucket === 'all' || job.bucket === bucket);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportSlug()}-${bucket}-${stamp}.csv"`);
    res.send(buildCsv(jobs));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- static app */

app.use(express.static(PUBLIC_DIR, {
  index: false,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (path.resolve(filePath) === path.join(PUBLIC_DIR, 'index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), {
    headers: { 'Cache-Control': 'no-cache' },
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: err.message });
});

/* ------------------------------------------------------------------ startup */

async function markInterruptedRuns(): Promise<void> {
  // Another container may be mid-sweep right now (rolling deploy, second service). Its run
  // row is live, not orphaned; only close rows when nobody holds the refresh lock.
  if (await refreshLockHeldElsewhere()) {
    console.log('[boot] a refresh is running in another process; leaving its run open');
    return;
  }
  await q(
    `UPDATE refresh_runs
        SET status='interrupted', finished_at=now(), message='Process restarted before this run finished.'
      WHERE status='running'`,
  );
}

async function main(): Promise<void> {
  await migrate();
  await markInterruptedRuns();

  // Seeding is idempotent (ON CONFLICT DO NOTHING) and runs on every boot so a
  // deploy that grows the registry actually reaches the live database instead of
  // waiting for an empty table.
  const inserted = await seedEmployers();
  console.log(`[startup] seeded ${inserted} new employers`);
  // A deploy that lands on a slot boundary kills the run that just started and the next one is
  // thirty minutes away. If the latest run was interrupted, or no run has started in the last
  // slot, start one now so no half hour is skipped.
  try {
    const last = await one<{ status: string; finished_epoch: string | null }>(
      `SELECT status, extract(epoch FROM finished_at)::text AS finished_epoch
         FROM refresh_runs ORDER BY id DESC LIMIT 1`,
    );
    // Missed slot: the default half-hour cadence passed a boundary after the last run finished.
    const slotMs = 30 * 60_000;
    const lastBoundary = Math.floor(Date.now() / slotMs) * slotMs;
    const missedSlot =
      CRON_EXPRESSION === '*/30 * * * *' &&
      last?.status === 'completed' &&
      last.finished_epoch !== null &&
      Number(last.finished_epoch) * 1000 < lastBoundary;
    if (CRON_ENABLED && last && (last.status === 'interrupted' || missedSlot)) {
      console.log(`[startup] last run ${last.status}${missedSlot ? ', slot missed' : ''} — starting a catch-up refresh`);
      startRefresh('catch-up')
        .then(({ runId, alreadyRunning }) => console.log(`[startup] catch-up refresh ${runId}${alreadyRunning ? ' joined an existing run' : ' started'}`))
        .catch((err) => console.error('[startup] catch-up refresh failed', err));
    }
  } catch (err) {
    console.error('[startup] could not check last run', (err as Error).message);
  }
  // A new database has a schema and an employer registry but no postings, and the
  // scheduled cycle can be hours away — a deploy would come up as an empty board and
  // look broken. When the table is empty, start one refresh immediately and let it run
  // in the background so the server still begins listening on time.
  try {
    const [row] = await q<{ count: string }>('SELECT count(*)::text AS count FROM jobs');
    if (Number(row?.count ?? 0) === 0) {
      console.log('[startup] no postings yet — starting a bootstrap refresh');
      startRefresh('manual')
        .then(({ runId, alreadyRunning }) =>
          console.log(`[startup] bootstrap refresh ${runId}${alreadyRunning ? ' joined an existing run' : ' started'}`),
        )
        .catch((err) => console.error('[startup] bootstrap refresh failed', err));
    }
  } catch (err) {
    console.error('[startup] could not check job count', (err as Error).message);
  }

  if (CRON_ENABLED && cron.validate(CRON_EXPRESSION)) {
    cron.schedule(CRON_EXPRESSION, () => {
      console.log('[cron] scheduled refresh starting');
      runRefresh('schedule')
        .then((id) => console.log(`[cron] refresh ${id} complete`))
        .catch((err) => console.error('[cron] refresh failed', err));
    }, { timezone: 'UTC' });
    console.log(`[cron] scheduled refresh active: ${CRON_EXPRESSION} (UTC)`);
  } else {
    console.log('[cron] scheduled refresh disabled; manual refresh only');
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] ${APP.name} listening on :${PORT}`);
  });
  // The refresh endpoint can legitimately run for several minutes.
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;
}

void main().catch((err) => {
  console.error('[startup] fatal', err);
  process.exitCode = 1;
});

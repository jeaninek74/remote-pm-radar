import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cron from 'node-cron';
import { healthCheck, migrate, q } from './db';
import { APP, RULES } from './config';
import { isRefreshing, runRefresh, seedEmployers, startRefresh } from './engine/ingest';
import {
  getStats, listEmployers, listJobs, listRuns, listSources, queueSummary, updateTracking,
} from './queries';
import { buildCsv, buildWorkbook } from './export';
import { describeProfile } from './profile';

const PORT = Number(process.env.PORT ?? 3000);
const CRON_ENABLED = process.env.ENABLE_CRON !== '0';
const CRON_EXPRESSION = process.env.REFRESH_CRON ?? '0 */4 * * *';
/** Works whether the server runs from dist/ (production) or server/ (tsx dev). */
const PUBLIC_DIR = [
  path.join(__dirname, 'client'),
  path.join(process.cwd(), 'dist', 'client'),
  path.join(__dirname, '..', 'dist', 'client'),
].find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? path.join(process.cwd(), 'dist', 'client');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function nextScheduledRefresh(from = new Date()): string | null {
  if (!CRON_ENABLED || CRON_EXPRESSION !== '0 */4 * * *') return null;
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  const hour = next.getUTCHours();
  next.setUTCHours(Math.floor(hour / 4) * 4 + 4);
  return next.toISOString();
}

/* ------------------------------------------------------------------- health */

app.get('/api/health', async (_req, res) => {
  const db = await healthCheck();
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    app: APP.name,
    version: APP.version,
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
    res.json({ run: rows[0] ?? null, refreshing: isRefreshing() });
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
        'Active jobs in $110K–$130K tab': stats.tab1,
        'Active jobs in $150K+ tab': stats.tab2,
        'Nontechnical roles': stats.nontechnical,
        'Technical roles': stats.technical,
        'Hybrid roles': stats.hybrid,
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
    res.setHeader('Content-Disposition', `attachment; filename="Remote-PM-Radar-${stamp}.xlsx"`);
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
    res.setHeader('Content-Disposition', `attachment; filename="Remote-PM-Radar-${bucket}-${stamp}.csv"`);
    res.send(buildCsv(jobs));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- static app */

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: err.message });
});

/* ------------------------------------------------------------------ startup */

async function markInterruptedRuns(): Promise<void> {
  await q(
    `UPDATE refresh_runs
        SET status='interrupted', finished_at=now(), message='Process restarted before this run finished.'
      WHERE status='running'`,
  );
}

async function main(): Promise<void> {
  await migrate();
  await markInterruptedRuns();

  const employers = await q<{ count: string }>(`SELECT count(*)::text AS count FROM employers`);
  if (!employers[0] || employers[0].count === '0') {
    const inserted = await seedEmployers();
    console.log(`[startup] seeded ${inserted} employers`);
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

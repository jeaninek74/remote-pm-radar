# Deploying Remote PM Radar

## Live now (Render + Neon)

| Piece | Where | Address |
| --- | --- | --- |
| Web app | Render, Docker, free plan | https://remote-pm-radar.onrender.com |
| Database | Neon, Postgres 18, free plan | project `remote-pm-radar` |
| Code | GitHub (public) | https://github.com/jeaninek74/remote-pm-radar |

The Render service carries `DATABASE_URL` (Neon), `ENABLE_CRON=1`, `JOB_WINDOW_DAYS=14` and
`EMPLOYERS_PER_RUN=600`. On boot it migrates the schema and seeds the employer registry (501
employers); the first production refresh added 298 roles in one pass.

### Free scheduling (no paid plan needed)

`.github/workflows/refresh.yml` replaces an always-on cron at zero cost. Every thirty minutes GitHub
Actions wakes the sleeping Render instance, starts a refresh, waits for it to finish and prints the
board totals in the run log. It can also be started by hand from the Actions tab. Verified working:
run `42312495969` woke the service and completed in 1m24s.

Free-tier limits worth knowing: scheduled workflows can start a few minutes late, they pause after
60 days without repository activity (any commit restarts them), and the first visit after a long
quiet spell still takes 30–60 seconds because the instance has to boot.

Two consequences of the free plans, stated plainly:

- The Render web instance sleeps after roughly 15 minutes without traffic. The first visit then
  takes 30–60 seconds to wake, and the four-hour cron cannot fire while it is asleep, so refreshes
  happen on wake or when **Refresh jobs now** is pressed. The Starter plan ($7/month) keeps it awake
  and makes the schedule dependable.
- Neon suspends its compute when idle and resumes on the next query; the first request after a quiet
  spell is a little slower.

### One deployment per database

Every process that boots with `ENABLE_CRON=1` runs its own scheduler. Two copies of the app
pointed at the same `DATABASE_URL` (an old Railway or Manus deployment, a second Render service,
a laptop running `npm run dev` against production) start two sweeps at every `:00`/`:30`, and the
combined connection storm is what shows up as `Authentication timed out`. The server now takes a
Postgres advisory lock for the length of a run, so a second *current* process steps aside — but
an older build does not know about the lock. If `/api/runs` shows several runs with the same
`started_at`, find the other deployment and stop it or set `ENABLE_CRON=0` on it.

### Deploys are triggered explicitly

Because the service was created from a public Git URL rather than through Render's GitHub app, Render
does not receive push webhooks, so a push alone does **not** deploy. Trigger one after pushing:

```bash
# from the agent, via the Render MCP tool
trigger_deploy(serviceId: "srv-dbn60nm1egvs73cnp0k0")
```

or press **Manual Deploy → Deploy latest commit** in the Render dashboard. Connecting the Render
GitHub app to the team restores automatic deploys.

## Reusable for another person

Candidate-specific values live in `profiles/*.json` and are loaded by `PROFILE_FILE`; the engine,
ATS adapters and interface are generic. See [profiles/README.md](profiles/README.md). Example:

```bash
PROFILE_FILE=profiles/example-data-analyst.json DATABASE_URL=… node dist/server.js
```

That run rebrands the board and re-bands the tabs from the same code and database.

### Why the repository is public

Render could not read the private repository because its GitHub app was not connected to the
`my job board` team. Switching the repository to public unblocked the first deploy. It contains
application code only — no credentials, keys or personal documents; the database URL lives in
Render's environment, not in Git. To restore privacy, connect the Render GitHub app to the team and
run `gh repo edit jeaninek74/remote-pm-radar --visibility private`; auto-deploy keeps working once
that app has repository access.

The app is a single Node service (Express API + built React client) plus a Postgres database.
The container serves everything on one port, so any Node host works.

## Railway deployment (the permanent home)

The repo is deployment-ready: `Dockerfile`, `railway.json`, health check at `/api/health`, and the
server runs migrations plus the 14-day/CA-rule evaluation on boot.

1. Railway → **New Project → Deploy from GitHub repo** → `jeaninek74/remote-pm-radar`.
2. **New → Database → PostgreSQL** in the same project. Railway injects `DATABASE_URL`; the service
   picks it up automatically on the next deploy.
3. Settings → Networking → **Generate Domain**. That URL is the permanent site.
4. Optional variables: `JOB_WINDOW_DAYS` (default 14), `EMPLOYERS_PER_RUN` (default 150),
   `ENABLE_CRON` (default 1 — the four-hour refresh runs inside the service).

The container binds `PORT` from Railway, waits for Postgres, migrates, seeds the 396-employer
registry, and starts the cron job. First boot takes ~2 minutes because it runs the initial search.

## What is running right now

A live instance is running in the Manus sandbox and is reachable at the preview URL provided with
this delivery. It has a populated database: 92 verified employer boards, 3 salary-verified roles,
3 queued roles, 16 archived roles and a full refresh history.

Because it runs inside the task sandbox, that URL follows the sandbox lifecycle. For a permanent
address, deploy the container below — it takes about three minutes.

## Railway (recommended, ~3 minutes)

1. Create a project at <https://railway.app/new> and choose **Deploy from GitHub repo**
   (the repository `jeaninek74/remote-pm-radar`) — `railway.json` and the `Dockerfile` are detected
   automatically.
2. In the same project, click **New → Database → PostgreSQL**.
3. On the web service, add the variable `DATABASE_URL` and reference the Postgres service:
   `${{Postgres.DATABASE_URL}}`.
4. Add `ENABLE_CRON=1` (scheduled refresh every thirty minutes) and optionally `PORT=3000`.
5. Deploy. On first boot the service creates its schema, seeds the employer registry and starts the
   scheduled refresh. The health check is `GET /api/health`.
6. **Settings → Networking → Generate Domain** to get the public URL.

No build-time secrets are needed. The schema is created automatically on boot and is additive only.

## Any other host

```bash
docker build -t remote-pm-radar .
docker run -p 3000:3000 -e DATABASE_URL=postgres://user:pass@host:5432/radar remote-pm-radar
```

Or without Docker:

```bash
npm ci
npm run build                                  # tsc server + vite client
DATABASE_URL=postgres://... node dist/server.js
```

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | Required. Postgres 13+. SSL is used automatically when the URL contains `sslmode=require`. |
| `PORT` | `3000` | HTTP port. |
| `ENABLE_CRON` | `1` | `0` disables the scheduled refresh (manual only). |
| `REFRESH_CRON` | `*/30 * * * *` | Cron expression in UTC. |
| `EMPLOYERS_PER_RUN` | `200` | Employer boards searched per cycle (rotation is least-recently-searched first). Sized to finish inside a thirty-minute slot; `600` on Render overruns it. |
| `EMPLOYER_BUDGET_MS` | `120000` | Wall-clock budget for paging one employer's board (Workday is searched with 15 phrases × 20 pages). |
| `PG_POOL_MAX` | `12` | Postgres connections. More is not better on Neon: each new connection is a TLS + SCRAM handshake through the proxy. |
| `PG_IDLE_TIMEOUT_MS` | `600000` | Keep idle connections for ten minutes so a sweep does not reconnect after every board read. |
| `PG_CONNECT_TIMEOUT_MS` | `60000` | Allowed time for a new connection; covers Neon resuming a suspended compute. |
| `FEED_PAGES` | `12` | Pages of 100 read from boards that paginate (SmartRecruiters). |
| `LINK_CHECKS_PER_RUN` | `40` | New roles whose application link is re-verified per cycle. |
| `FETCH_CONCURRENCY` | `7` | Employer boards read in parallel. |

## First-run checklist

1. `GET /api/health` returns `{"ok":true}`.
2. Open the dashboard: the KPI band shows the employer count, and *Refresh history* shows one run
   with a completed status.
3. Press **Refresh jobs now** once. The progress strip streams the current stage; the run finishes in
   one to three minutes and the KPIs update.
4. `GET /api/export.xlsx` downloads a workbook with seven sheets.

## Seeding and one-off refresh from the CLI

```bash
DATABASE_URL=... npx tsx scripts/migrate.ts          # schema + employer registry
DATABASE_URL=... npx tsx scripts/refresh.ts manual    # one full cycle, prints the run summary
DATABASE_URL=... npx tsx scripts/validate-employers.ts  # re-verify every board, rebuild the registry
```

## Operational notes

- The first refresh of a fresh database searches all employers, which is slower (2–4 minutes).
  Later cycles rotate and are quicker.
- Boards that fail three consecutive checks are retired (`active = false`) with the reason stored on
  the employer row, so the database never claims to search a board that no longer answers.
- Re-running a refresh is idempotent: jobs are keyed by board + posting id, and your notes,
  statuses and dates are never overwritten.

# Deploying Remote PM Radar

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
4. Add `ENABLE_CRON=1` (scheduled refresh every four hours) and optionally `PORT=3000`.
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
| `ENABLE_CRON` | `1` | `0` disables the four-hourly refresh (manual only). |
| `REFRESH_CRON` | `0 */4 * * *` | Cron expression in UTC. |
| `EMPLOYERS_PER_RUN` | `150` | Employer boards searched per cycle (rotation is least-recently-searched first). |
| `FEED_PAGES` | `4` | Pages of 100 read from the Himalayas feed. |
| `LINK_CHECKS_PER_RUN` | `40` | New roles whose application link is re-verified per cycle. |
| `HTTP_CONCURRENCY` | `7` | Parallel requests per board. |

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

# Build status — 6 November 2026

Snapshot for continuity. Rules live in `RULES.md`; deployment steps in `DEPLOY.md`.

## Running now

| Item | State |
| --- | --- |
| App | `node dist/server.js` on port 3003, cron `0 */4 * * *` UTC, health `/api/health` |
| Database | local Postgres (`postgres://radar:radar@127.0.0.1:5432/radar`) |
| Verified roles | 9 (2 in $110K–$130K, 7 at $150K+) |
| Queue / archive | 8 / 20 |
| Machine-read boards | 237 before the bulk probe, ~450 expected after |
| Tracked employers with careers link | 152 |
| States / industries | 51 / 54 |
| Discovery queue | 1,986 portfolio companies pending (1,989 loaded) |

## In flight

1. `scripts/probe-queue.ts` — bulk probing the 1,986 queued companies (20 concurrent). Found boards
   are inserted into `employers` immediately. Progress: `/tmp/probe.log`.
2. After it finishes: merge `/tmp/employer-validation.tsv` + new boards, rebuild the seed
   (`scripts/build-seed.py`), run a full refresh, recapture screenshots.

## Open decisions

- **Hosting**: the app is container-ready (Dockerfile + railway.json, health check). Railway needs a
  project token. User asked instead about Neon — Neon is Postgres only, so it replaces the database
  but still needs a Node host (Render connector is available; Vercel would need a serverless wrapper
  plus external cron). Nothing is deployed yet; the sandbox URL is temporary.
- **Volume**: the strict gates (remote + CA + 14 days + published base salary + direct link) pass
  roughly 1 role per 25-30 boards. Hundreds of tab roles needs thousands of boards, or a decision to
  surface salary-less roles in a separate tab.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/refresh.ts` | Full or limited refresh (`full-scan [limit]`) |
| `scripts/migrate.ts` | Schema + additive migrations |
| `scripts/build-seed.py` | Rebuild `server/data/employers.seed.ts` from a validation TSV |
| `scripts/check-titles.ts` | 86 nontechnical + 46 technical titles, 9 rejections |
| `scripts/check-salary.ts` | Every salary example and boundary from the prompt |
| `scripts/validate-states.ts` | Probe a candidate TSV against five ATS platforms |
| `scripts/discover-portfolio.ts` | Pull company names from the portfolio directory |
| `scripts/seed-discovery-queue.ts` | Load the directory into `discovery_queue` |
| `scripts/probe-queue.ts` | Bulk probe queued employers, insert found boards |

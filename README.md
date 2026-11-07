# Remote PM Radar

A self-hosted job radar for Jeanine Kendricks: fully remote **Project / Program Manager** roles that are
California-eligible, posted in the last 14 days, with a published base salary that clears either
**$110,000–$130,000** or **$150,000+**.

It never ingests third-party feeds. It reads employer applicant-tracking
systems (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters) directly, applies a fixed rule set, records why every job did or did not
earn a place, and never invents a salary.

---

## What it does every cycle

1. **Searches the employer database** — every employer with a public job feed, in rotation, 200 per cycle.
2. **Discovers new employers** — probes the discovery queue (startup, nonprofit and state registries) for a
   Greenhouse / Ashby / Lever / SmartRecruiters / Workable board, 60 per cycle. The queue is fed by
   `scripts/seed-discovery-queue.ts` from public registries — the Y Combinator directory (active US companies,
   8–600 staff) and the IRS exempt-organisation master file ($25M+ income) — never from job boards:
   Himalayas, Remotive and Remote OK were removed on 6 Nov 2026 (RULES.md §2).
3. **Applies the placement rules** (below) to every posting whose title is a project/program role.
4. **De-duplicates** the same role across a board and a feed (employer link wins, then earliest posting).
5. **Re-verifies application links** for newly tabbed roles (HTTP status recorded on the job).
6. **Archives** anything past the 14-day window, and closes anything no longer listed on the employer's board.
7. **Writes a run record** — sources checked, sources failed, postings read, new leads, duplicates, archives.

Runs on boot, every thirty minutes (`*/30 * * * *` UTC, via the in-container cron and the GitHub Actions workflow that wakes the free Render instance), and whenever **Refresh jobs now** is pressed. Each run sweeps 200 employers, oldest-searched first, so consecutive runs walk the whole registry.

## Placement rules

A job reaches a salary tab only if **all** of these hold:

| Rule | Detail |
| --- | --- |
| Title | Project / Program Manager family (incl. Technical Program Manager, PMO, Delivery/Implementation Manager, Program Lead, Chief of Staff). Product Manager and Scrum Master are explicitly excluded. |
| Remote | Posting states fully remote / distributed / anywhere. Hybrid, "remote-first with office", and city-only postings are rejected. |
| Posting age | Original posting date within **14 days** (extended from 7 on 6 Nov 2026; `JOB_WINDOW_DAYS=7` restores the original rule). A last-updated timestamp is **not** accepted as a posting date. |
| California | US-wide remote, CA-named, or a state list including CA. An unstated state is **kept and shown** ("CA not stated") rather than excluded. Only explicit exclusions and non-US postings are rejected. |
| Salary | Classified on the **published minimum**, never the maximum: $110,000–$130,000 → Tab 1, ≥ $150,000 → Tab 2, $130,001–$149,999 → neither tab (queue). Hourly contracts are annualised at 2,080 hours, placed on the band that figure falls into, and always shown with the hourly rate — never as guaranteed salary. No published base salary or OTE-only → the **Pay not published** tab (live, outside both bands, no estimate; Jeanine's 6 Nov 2026 instruction). |
| Link | The application link must be the employer's own posting. A link that cannot be confirmed as the employer's own is queued, never shown as a role. |

Everything that fails one of the *soft* rules lands in **Needs verification** with the reason attached, so a
human can still act on it. Jobs that are plainly out of scope (not remote, non-US, state-restricted) are not stored.

## Matching

Two resumes are scored per job, and the better one is named:

- `Jeanine_Kendricks_Resume_Construction_PM.pdf` — construction / program delivery.
- `Jeanine_Kendricks_Resume2026.pdf` — general project & program management.

Signals: title alignment by sub-family (technical, delivery, PMO, construction, operations), industry alignment,
seniority fit, and domain keywords mined from the resumes. Missing hard requirements found in the posting
(certs such as PMP, clearances, specific platforms) are surfaced as **hard requirements to check** rather than
silently lowering the score.

## Hiring urgency

- **High** — the posting itself says urgent / immediate start / expedited hiring.
- **Medium** — employer has two or more project/program roles open simultaneously (labelled as an inference).
- **Low / Unknown** — no signal. Absence of urgency language is not evidence of slow hiring.

## Black-owned employers

Ownership labels require a citable source and are stored with the source text. Nothing is inferred from names,
photos or workforce demographics. Employers without a machine-readable feed are tracked as `manual` with their
careers page and the reason, so the database never implies it searched a board it cannot read.

## Running it

```bash
pnpm install            # or npm install
pnpm build              # type-check server + build client into dist/
DATABASE_URL=postgres://user:pass@host:5432/radar pnpm start
```

Local development:

```bash
DATABASE_URL=postgres://radar:radar@127.0.0.1:5432/radar pnpm dev     # API on :3000 with Vite HMR
DATABASE_URL=... npx tsx scripts/refresh.ts manual                     # run one cycle in the terminal
DATABASE_URL=... npx tsx scripts/migrate.ts                            # create schema + seed employers
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required). |
| `PORT` | `3000` | HTTP port. |
| `ENABLE_CRON` | `1` | Set `0` to disable scheduled refreshes. |
| `REFRESH_CRON` | `*/30 * * * *` | Cron expression (UTC). |
| `EMPLOYERS_PER_RUN` | `1000` | Employer boards searched per cycle — above the registry size, so every active board is searched every slot. |
| `JOB_WINDOW_DAYS` | `14` | Posting window; `7` restores the master prompt's original rule. |
| `FEED_PAGES` | `12` | Pages of 100 read from boards that paginate (SmartRecruiters). |
| `EMPLOYER_BUDGET_MS` | `120000` | Wall-clock budget for paging one employer's board (Workday). |
| `DISCOVER_PER_RUN` | `60` | Companies from the discovery queue probed for a board per cycle (4 in parallel). |
| `DISCOVER_BUDGET_MS` | `90000` | Wall-clock budget for discovery inside one cycle. |
| `LINK_CHECKS_PER_RUN` | `35` | Application links re-verified per cycle. |
| `FETCH_CONCURRENCY` | `7` | Parallel board requests. |
| `FETCH_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `PG_POOL_MAX` | `8` | Postgres pool size (Neon rejects too many simultaneous handshakes). |
| `PG_LOCK_HEARTBEAT_MS` | `60000` | Keeps the refresh-lock transaction alive past Neon's 5-minute idle-in-transaction timeout. |

## Master prompt — where each rule lives and how it is proven

The build is checked against Jeanine's master prompt (and the standing instructions in `RULES.md` that
amend it). "Proven by" names the DB-free script that exercises the rule; run them after touching the file.

| Master prompt rule | Enforced in | Proven by |
| --- | --- | --- |
| Fully remote only; hybrid / on-site / commuting / heavy travel excluded (§6) | `server/engine/location.ts`, `ingest.ts#evaluateRaw` (queued with the reason, never tabbed) | `scripts/check-remote.ts` (needs a DB) |
| California eligibility; other-state residency excluded; unstated CA kept and flagged (§6, RULES §2) | `location.ts` | same |
| Posting window, archive when it lapses, unknown date never tabbed (§11; 14 days per RULES §4) | `server/config.ts` `RULES.windowDays`, `ingest.ts` | `scripts/check-parse.ts`, the Workday date helper `workdayPostedDate` |
| Two tabs on the published minimum; $130,001–$149,999 in neither; hourly at 2,080 h (§5) | `server/engine/salary.ts` | `scripts/check-salary.ts` — all 14 cases pass |
| Technical and nontechnical titles with equal priority (§3–4) | `server/engine/roles/families/project-management.ts`, `titles.ts`, `category.ts` | `scripts/check-titles.ts` — 86/86 nontechnical, 46/46 technical, 9/9 rejected |
| All 50 states, every industry, every company size (§6–8) | `server/data/*.ts` registries, discovery queue | `scripts/validate-states.ts`, `cover-states.ts`; KPI "States covered" |
| Black-owned employers with a citable source, never inferred (§9) | `server/data/ownership.ts`, `ingest.ts#ownershipLabel` | ownership records carry `source` text |
| Direct employer links only (§10) | `ingest.ts` (`linkType !== 'employer'` is queued), link checks | run column "Links checked / valid" |
| Urgency High / Medium / Low / Unknown, confirmed vs inferred, never from recency (§12) | `server/engine/urgency.ts` | explicit phrase list mirrors §12 |
| Dashboard totals, filters, REFRESH JOBS NOW, progress and failed sources (§13–14) | `client/src/components/KpiBand.tsx`, `Filters.tsx`, `App.tsx`, `/api/refresh` | `/api/bootstrap` stats |
| Scheduled refresh, confirmed not assumed (§15) | `server/index.ts` cron, `.github/workflows/refresh.yml` | `/api/bootstrap` reports `cronEnabled` + `nextRefresh`; `/api/runs` shows one run per :00/:30 |
| 29 job columns, clickable link, export (§16, §24) | `server/export.ts` `HEADERS` (29 columns in prompt order) | `GET /api/export.xlsx` |
| Application statuses, dates and notes preserved across refreshes (§17) | `server/config.ts` `APP_STATUSES`, `jobs` row fields `appStatus`, `appliedAt`, `interviewAt`, `followUpAt`, `recruiterNotes`, `notes` | upserts never touch those columns |
| Resume matching from both resumes, transparent 0–100, no inflation (§2, §18) | `project-management.ts` competencies + lanes (one per resume), `match.ts` | reasons and gaps are stored on every job |
| No duplicates (§19) | `ingest.ts` `jobKey` + `dedupeJobs()` | run column "Dupes" |
| Continuous employer discovery, oldest-searched first (§20) | `ingest.ts` employer rotation, `discoverPerRun` | run column "New employers" |
| Needs Verification, Archived, Employer Database, Refresh History (§21) | `App.tsx` tabs, `EmployersTab.tsx`, `RunsTab.tsx` | — |
| One sweep at a time across deployments | `server/db.ts` advisory lock + heartbeat | `/api/runs` one run per slot |

Where the master prompt and a later instruction from Jeanine disagree, `RULES.md` records the newer
instruction (14-day window, "CA not stated" kept visible, no-salary roles shown in their own tab).

## Exporting

- `GET /api/export.xlsx` — full workbook: both salary tabs, verification queue, archive, summary, employer
  database with ownership sourcing, refresh history.
- `GET /api/export.csv?bucket=tab1` — current view only.

## Data honesty

Every job row carries its own provenance: posting date and precision, salary source and the captured text,
link type and last HTTP check, ownership status and source. If a field could not be verified it is empty or
labelled — never filled with a guess.

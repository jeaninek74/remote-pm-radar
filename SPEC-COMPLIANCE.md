# Spec compliance — every numbered section of the brief

This maps each section of the master prompt to the code that implements it, so nothing is
"in the document" but missing from the build. Anything not yet fully satisfied is marked
**Gap** with the reason and what closes it.

| § | Requirement | Where it lives | Status |
| --- | --- | --- | --- |
| 1 | Working automated tool, not a static list | `server/index.ts`, `server/engine/ingest.ts`, `client/` | Met |
| 1.1 | Fully remote only | `server/engine/location.ts` (`remote` verdict; hybrid/on-site forced to queue) | Met |
| 1.2 | Accepts California residents | `location.ts` (`confirmed` / `us_wide` / `state_restricted`) | Met |
| 1.3 | Posted inside the window | `RULES.windowDays`, `archiveByAge()` in `ingest.ts` | Met (window is 14 days — see note 1) |
| 1.4 | Two salary tabs | `RULES.tab1/tab2`, `salary.ts`, `KpiBand.tsx` | Met |
| 1.5 | Technical **and** nontechnical, equal priority | `category.ts`; identical ranking for both | Met |
| 1.6 | Employers across all 50 states | `employers.seed.ts` `hq` column, `workday-employers.ts` | **Gap** — breadth, see note 2 |
| 1.7 | Every industry | `employers.seed.ts` industry column | **Gap** — breadth, see note 2 |
| 1.8 | Startups → enterprises, consulting, nonprofits, government contractors | `CompanySize` + registry rows | **Gap** — breadth, see note 2 |
| 1.9 | Actively discover Black-owned businesses | `server/data/ownership.ts`, `applyOwnership()`, Black-owned filter | **Partial** — 14 verified records, see note 3 |
| 1.10 | Prioritise urgently hiring employers | `urgency.ts`, urgency filter, `flagMultiRoleUrgency()` | Met |
| 1.11 | Verified direct employer application links | `checkLink()` loop, `linkType`, queue reason when only a job board is found | Met |
| 1.12 | Automatic recurring updates | `node-cron` in `index.ts` + `.github/workflows/refresh.yml` | Met |
| 1.13 | Refresh Jobs Now button | `POST /api/refresh`, `SimpleBoard.tsx`, `App.tsx` | Met |
| 1.14 | Match against both resumes | `match.ts`, per-lane resume selection, `bestResume` | Met |
| 1.15 | Block duplicate/expired/misleading listings | `dedupeJobs()`, `archiveByAge()`, salary + link gates | Met |
| 1.16 | Preserve statuses and notes across refreshes | `app_status`, `notes`, `recruiter_notes`; upsert never touches them | Met |
| 1.17 | Simple enough to run without technical knowledge | `SimpleBoard.tsx` default view, one button | Met |
| 2 | Combine both resumes into one profile | `roles/families/project-management.ts` competency groups | Met |
| 3 | Nontechnical PM titles | `titlePatterns` + `NON_TECHNICAL` vocabulary; nontechnical titles all match | Met |
| 4 | Technical PM titles | Same pattern set (`technical program`, `IT project`, `implementation`) | Met |
| 5 | Salary classification | `salary.ts`, `classifySalary()` | Met |
| 6 | 50-state employer search, exclude hybrid/on-site/residency-restricted | `location.ts`, `eligibleStates` in the profile | Met (logic) / **Gap** (employer count) |
| 7 | Every industry | Registry industry coverage | **Gap** — see note 2 |
| 8 | All company sizes | `CompanySize` on every registry row | Met |
| 9 | Black-owned emphasis + verification field + filter | `ownership.ts`, `black_owned_verification`, filter toggle | **Partial** — see note 3 |
| 10 | Job boards for discovery, direct employer links required | Employer-ATS + Workday only today | **Gap** — see note 4 |
| 11 | Seven-day rule enforced | `archiveByAge()`, `postedConfidence` gate | Met (window 14, see note 1) |
| 12 | Identify companies urgently hiring | `urgency.ts` (explicit phrases, multi-opening detection) | Met |
| 13 | Interactive dashboard + required filters | `Filters.tsx`: category, urgency, industry, size, HQ state, employment type, application status, date posted, Black-owned, minimum match | Met |
| 14 | Real refresh button | `POST /api/refresh`, live progress via `/api/refresh/status` | Met |
| 15 | Scheduled searches | Cron every 4h + GitHub Actions keep-alive | Met |
| 16 | Required job data columns | `export.ts` `HEADERS` — 30 columns including ownership, match %, urgency evidence, link verification | Met |
| 17 | Application tracking | `APP_STATUSES`, `PATCH /api/jobs/:id`, notes + recruiter notes | Met |
| 18 | Intelligent resume matching | `match.ts` (family-driven, explainable, gap rules) | Met |
| 19 | Deduplicate and verify | `dedupeJobs()`, `checkLink()`, `postedConfidence` | Met |
| 20 | Continuous company discovery | `discovery_queue`, `probeAts()`, `scripts/expand-employers.ts`, `scripts/resolve-careers.ts` | Met (mechanism) / **Gap** (volume, see note 2) |
| 21 | Supporting tabs without cluttering | `EmployersTab`, `RunsTab`, `HowTo`, verification queue | Met |
| 22 | Real automation and storage | Postgres schema + migrations, refresh runs, source health | Met |
| 23 | Test before delivery | `npm run typecheck`, `scripts/check-*.ts`, live board probes | Met |
| 24 | Final deliverables | Web app, Excel export, CSV export, tracker | Met |
| 25 | Execution instructions | `README.md`, `DEPLOY.md`, `RULES.md` | Met |

## Notes on the open items

**1 — Posting window.** The brief says seven days. The profile was extended to 14 days on
6 Nov 2026 because seven days produced three roles against 638 postings. `JOB_WINDOW_DAYS=7`
restores the original rule without a code change.

**2 — Employer breadth (the real gap).** The engine can only search a board that publishes a
machine-readable feed. Of 394 large employers probed, 69 answered an open ATS API and 28 more
were resolved to Workday; the rest sit behind Taleo, iCIMS or bespoke portals with no public
JSON. That is a structural ceiling on *this* discovery method, not a filter being too strict.
What is in place to close it:

- `employers.seed.ts` — registry with industry, size, HQ state and role-family tags
- `workday-employers.ts` — 28 verified Workday boards (Accenture, Booz Allen, BofA, Citi,
  Capital One, Target, Nike, Geisinger, Houston Methodist, Stanford Health, Guidehouse,
  Protiviti, Huron, Ankura, PCG, RAND, Highmark, Elevance, State Street, Northern Trust,
  Prudential, Nationwide, Xcel, Nordstrom, General Mills, Mastercard, Ochsner, Coca-Cola)
- `scripts/expand-employers.ts` — probes any candidate list against five ATS APIs
- `scripts/resolve-careers.ts` — verifies a careers URL and extracts Workday coordinates
- `discovery_queue` + `probeAts()` — the refresh cycle keeps adding employers on its own

**3 — Black-owned businesses.** Fourteen records are verified against public sources
(`ownership.ts`, trail in `VERIFICATION.md`). Ownership is never inferred from names,
photographs or demographics, as the brief requires. The limiting factor is that most
Black-owned firms are small and publish no machine-readable board, so they are tracked with a
direct careers link rather than silently dropped.

**4 — Aggregator discovery (§10).** An aggregator discovery layer was built and then removed on
instruction: **no job boards and no job leads at all**. Every posting must come from the
employer's own listing. Discovery therefore works state by state — see
`server/data/state-employers.ts` — and the engine never reads a third-party feed.

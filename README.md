# Remote PM Radar

A self-hosted job radar for Jeanine Kendricks: fully remote **Project / Program Manager** roles that are
California-eligible, posted in the last 14 days, with a published base salary that clears either
**$110,000–$130,000** or **$150,000+**.

It never ingests third-party feeds. It reads employer applicant-tracking
systems (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters) directly, applies a fixed rule set, records why every job did or did not
earn a place, and never invents a salary.

---

## What it does every cycle

1. **Searches the employer database** — every employer with a public job feed, in rotation, 150 per cycle.
2. **Reads discovery feeds** — Himalayas, Remotive and Remote OK — and uses them to *find new employers*,
   then probes Greenhouse / Ashby / Lever for that company's own board.
3. **Applies the placement rules** (below) to every posting whose title is a project/program role.
4. **De-duplicates** the same role across a board and a feed (employer link wins, then earliest posting).
5. **Re-verifies application links** for newly tabbed roles (HTTP status recorded on the job).
6. **Archives** anything past the 14-day window, and closes anything no longer listed on the employer's board.
7. **Writes a run record** — sources checked, sources failed, postings read, new leads, duplicates, archives.

Runs on boot, every four hours (`0 */4 * * *` UTC), and whenever **Refresh jobs now** is pressed.

## Placement rules

A job reaches a salary tab only if **all** of these hold:

| Rule | Detail |
| --- | --- |
| Title | Project / Program Manager family (incl. Technical Program Manager, PMO, Delivery/Implementation Manager, Program Lead, Chief of Staff). Product Manager and Scrum Master are explicitly excluded. |
| Remote | Posting states fully remote / distributed / anywhere. Hybrid, "remote-first with office", and city-only postings are rejected. |
| Posting age | Original posting date within **14 days** (extended from 7 on 6 Nov 2026; `JOB_WINDOW_DAYS=7` restores the original rule). A last-updated timestamp is **not** accepted as a posting date. |
| California | US-wide remote, CA-named, or a state list including CA. An unstated state is **kept and shown** ("CA not stated") rather than excluded. Only explicit exclusions and non-US postings are rejected. |
| Salary | Base salary published on the employer's posting. Minimum must land in $110,000–$130,000 (Tab 1) or ≥ $150,000 (Tab 2). $130,001–$149,999 matches neither tab. OTE/total-comp-only postings are queued, not placed. Hourly contract roles are queued with an annualised equivalent, never treated as a salary. |
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
| `REFRESH_CRON` | `0 */4 * * *` | Cron expression (UTC). |
| `EMPLOYERS_PER_RUN` | `150` | Employer boards searched per cycle. |
| `FEED_PAGES` | `4` | Pages of 100 read from the Himalayas feed. |
| `LINK_CHECKS_PER_RUN` | `40` | Application links re-verified per cycle. |
| `HTTP_CONCURRENCY` | `7` | Parallel requests to a single board. |

## Exporting

- `GET /api/export.xlsx` — full workbook: both salary tabs, verification queue, archive, summary, employer
  database with ownership sourcing, refresh history.
- `GET /api/export.csv?bucket=tab1` — current view only.

## Data honesty

Every job row carries its own provenance: posting date and precision, salary source and the captured text,
link type and last HTTP check, ownership status and source. If a field could not be verified it is empty or
labelled — never filled with a guess.

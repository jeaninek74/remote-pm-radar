# Standing rules and candidate profile

This file is the source of truth for this project. It is read before any change to the board, the
matching engine or the employer registry. If a chat instruction and this file disagree, the newer
instruction wins and this file is updated in the same commit.

Last updated: 7 November 2026 (resumes re-read; master-prompt audit; §4.1 describes what the build does).

---

## 1. What the product is

A working, continuously updating job finder — not a one-time search and not a mockup. It searches
employer career sites directly, discovers employers of every size, and has a real REFRESH JOBS NOW
button. It stores everything in Postgres and refreshes on a thirty-minute schedule.

## 2. Non-negotiable requirements

1. Fully remote positions only.
2. Employers must accept California residents working remotely.
3. Original posting date inside the posting window (see §4).
4. Two salary tabs: **$110,000–$130,000** and **$150,000+ with no ceiling**.
5. Technical and nontechnical project/program management have **equal** priority. Nontechnical means
   business operations, leadership, budgets, vendor management, planning, strategy, process
   improvement, project execution, compliance, procurement, administration and cross-functional
   coordination — a role does **not** need software, IT systems, engineering or coding to qualify, and
   the search must be run aggressively for these titles, not as a fallback.
6. Employers across all 50 states.
7. Every industry.
8. Startups, small companies, midsize companies, major corporations, consulting firms, nonprofits,
   government contractors.
9. Actively discover Black-owned businesses hiring project and program managers.
10. Prioritise employers hiring urgently.
11. Verified, direct employer application links.
12. Automatic recurring refresh.
13. Functional REFRESH JOBS NOW button.
14. Match every role against both of Jeanine's resumes.
15. No duplicate, expired, misleading or unverified listing in an active salary tab.
16. Application statuses and personal notes survive every refresh.
17. Simple enough to operate without technical knowledge.

Additional standing instructions:

- **Do not pull jobs from job boards or aggregators.** Comb individual employers' own career sites.
  Himalayas, Remotive and Remote OK were removed on 6 Nov 2026 for this reason.
- **If a posting does not specify California, keep it on the site.** Do not exclude it. It is shown
  with a `CA not stated` flag; only explicit California exclusions and non-US postings are dropped.
- **The interface stays simple.** A plain list first — title, company, description, pay, date posted,
  category, clickable link. The full dashboard is secondary.

### 2.1 Title coverage (verified)

`scripts/check-titles.ts` checks every title in Jeanine's master prompt against the recognition engine:

| Set | Result |
| --- | --- |
| Nontechnical titles (86) | 86 / 86 recognised |
| Technical titles (46) | 46 / 46 recognised |
| Non-PM roles that must stay out (9) | 9 / 9 rejected |

Re-run it after any change to `server/engine/titles.ts`.

## 3. Salary classification

Classify on the **published minimum**, never the maximum.

| Published minimum | Placement |
| --- | --- |
| $110,000–$130,000 | Tab 1 |
| $130,001–$149,999 | Neither tab (queue) |
| $150,000+ | Tab 2, no cap |

Hourly contracts are annualised at 2,080 hours and the hourly rate is shown; contract income is never
presented as guaranteed salary. They are placed on the band their annualised equivalent falls into.
Nothing is estimated. **No published salary no longer means the queue** — on 6 November 2026 Jeanine
directed that these roles be added rather than dropped, so they are held live in a separate
`Pay not published` tab, never inside a salary band and never with an estimated figure. OTE-only
postings sit there too. `scripts/check-salary.ts` proves every
example in the master prompt, plus the $130,000 / $130,001 / $149,999 / $150,000 boundaries:
all cases pass.

## 4. Posting window

Seven days was the original rule and produced three roles against 638 project/program postings. On
6 November 2026 Jeanine extended it to **14 days**. Implemented as `RULES.windowDays`, overridable with
`JOB_WINDOW_DAYS`. A last-updated date is never accepted as a posting date.

### 4.1 Exclusions enforced before anything is stored

Hybrid roles, onsite roles, roles that require regular commuting, positions that exclude California
residents, positions that demand residency in another state, region-locked remote roles that exclude
California, and roles requiring routine travel (40%+ stated, or unquantified "extensive/frequent
travel") never reach a salary tab. Non-US postings are dropped outright. Everything else that fails a
location rule is **stored in the verification queue with the exact reason** (`ingest.ts#evaluateRaw`),
so a misread location can be seen and corrected rather than silently discarded. Whether hybrid/on-site
postings should instead be dropped at ingestion is an open decision for Jeanine (see §9).

## 5. Sourcing policy

| Layer | Behaviour |
| --- | --- |
| Machine-readable boards — Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee | Fetched every refresh |
| Tracked employers — Workday, iCIMS, Taleo, Jobvite, bespoke portals | Stored with name, industry, size, state and a verified careers link that opens in one click |
| Ownership watchlist | Black-owned employers tracked for openings |

Current coverage: **396 employers, 51 states (50 + DC), 54 industries**.

A tracked employer is a first-class record, not a gap: the company, its state and its link are in the
database and the link is clickable. Absence of a public API never removes a company from the registry.

## 6. Candidate profile — Jeanine Kendricks

Distilled from both resumes and the master prompt. Matching must weigh all of it, and must not
penalise technical experience when scoring a nontechnical role (or the reverse).

**Executive and enterprise management** — senior project management, senior program management,
enterprise portfolio management, PMO leadership, program governance, strategic initiatives, enterprise
transformation, executive stakeholder management, operational leadership, risk and compliance
management, budget and financial oversight.

**Nontechnical business and operations** — business project management, business program management,
business operations, marketing operations, procurement, vendor management, contract management,
process improvement, organisational change, administrative operations, workforce planning, HR
transformation, business services, client services, resource planning, cross-functional delivery.

**Healthcare** — healthcare program management and operations, hospital systems, healthcare
administration, Medicare and Medicaid programs, regulatory compliance, clinical systems
implementations, electronic health records, Epic modernisation, healthcare technology transformation.

**Technology** — IT project management, SaaS implementations, enterprise systems, Workday, PeopleSoft,
Salesforce, ServiceNow, Cerner, Oracle, disaster recovery, IT infrastructure, digital transformation,
AI product development, AI workflow automation, software implementation, agile delivery.

**Construction, infrastructure and energy** — construction project management, federal construction
programs, courthouse and government infrastructure, healthcare construction, construction operations,
contractor and vendor management, construction budgets, renewable energy, solar installations, utility
programs, manufacturing operations, supply chain, facilities and infrastructure projects.

**Government and consulting** — federal government contracting, government program management, GSA
projects, FDA-related program delivery, regulated programs, professional services, consulting, public
sector programs, multimillion-dollar program delivery.

**Documented employers** — Google Cloud Marketing through AlgoMarketing, Media Force, University of
Minnesota Rochester, Palomar Health, Kaiser Permanente, RippleNami, Smoke Guard, O'Connor Management,
Parsons, Verengo Solar, Southern California Edison. These are her employers; they are never hardcoded
into the application and never presented as anything else.

**Credentials** — MBA, Executive Leadership (Liberty University); B.S., Public Administration (CSU Dominguez
Hills); PMP; Lean Six Sigma Green Belt; Agile Project Management; Risk Management; Ethical Leadership;
Generative AI Prompt Engineering; Generative AI for Project Managers; Python for Data Science & AI.

**Platforms named on both resumes** — Workday, Salesforce, Epic, Cerner, SAP, Oracle, ServiceNow, PeopleSoft,
Jira, Confluence, Smartsheet, SharePoint, MS Project, Primavera P6, OpenAI / Claude / ChatGPT / Gemini, Bubble,
Airtable, AI workflow-automation platforms. Also on the resumes and reflected in the competency keywords:
disaster recovery and business continuity, telecommunications / IVR, CMS-regulated Medicare and Medicaid
programs, smart grid and 100 MW+ of solar / wind / fuel-cell / biogas installations, Six Sigma and Kanban,
a $1B Epic program, a $360M procurement portfolio, and a 633,000 sq ft GSA courthouse.

Both resumes were re-read on 7 November 2026 and the competency groups in
`server/engine/roles/families/project-management.ts` updated to cover every platform and domain above.

## 7. Honesty rules

- Never invent a salary, posting date, ownership claim, urgency signal or qualification.
- Never claim scheduled automation works without confirming it.
- Unverified leads go to the queue with the blocking reason attached.
- Black-owned labels require a citable source; no inference from names, photos or demographics.
- Do not apply, contact recruiters or submit resumes without explicit authorisation.

## 8. Where each rule lives in the code

| Rule | File |
| --- | --- |
| Salary bands, window | `server/config.ts` |
| Placement decisions | `server/engine/ingest.ts` |
| Remote and California classification | `server/engine/location.ts` |
| Salary parsing | `server/engine/salary.ts` |
| Technical / nontechnical / hybrid | `server/engine/category.ts` |
| Urgency | `server/engine/urgency.ts` |
| Resume matching | `server/engine/match.ts` |
| Employer boards | `server/engine/sources.ts` |
| Machine-readable registry | `server/data/employers.seed.ts` |
| Tracked employers with career links | `server/data/manual-employers.ts` |
| Ownership records | `server/data/ownership.ts` |
| Simple list | `client/src/components/SimpleBoard.tsx` |
| Full dashboard | `client/src/App.tsx` |

## 8a. Sweep size and employer growth (7 November 2026)

Jeanine: "I need this to run and refresh quickly to capture jobs as soon as they post" and "it should
be triple — a 560-employer sweep nationwide". So: every active board is searched every 30-minute slot
(`EMPLOYERS_PER_RUN=0`, no cap, not a rotating 200). Jeanine, 7 Nov: "do not put a number cap on searches" — the
search-phrase list is every lead/rank pairing in the title taxonomy (138 phrases, not 15), Workday boards are read 20
at a time (the API's maximum per request) until they stop returning results, and no posting or page count is capped;
the only limits are time budgets so one hung board cannot stall the sweep, and the discovery queue is fed
from public company registries (YC directory, IRS exempt-organisation file) and probed 60 companies per
cycle, five ATS vendors each, until the registry is roughly three times its 557 active boards. Companies
whose careers page has no public ATS stay listed as `manual` and are not searched.

## 9. Open decisions — master prompt vs. later instructions

The master prompt (re-supplied 7 November 2026) and Jeanine's later instructions differ on four points.
The build follows the later instruction in each case until she says otherwise:

| Master prompt | Later instruction (in force) |
| --- | --- |
| Seven-day posting window (§11) | 14 days, 6 Nov 2026 (`JOB_WINDOW_DAYS=7` restores seven) |
| Unspecified California eligibility goes to the verification queue (§6) | Kept on the site with a `CA not stated` flag (§2) |
| No published salary goes to the review queue (§5) | Shown live in the `Pay not published` tab (§3) |
| Hybrid / on-site postings are excluded (§6) | Stored in the verification queue with the reason, never tabbed (§4.1) |


---

## 6. Update — 6 November 2026 (rules changed on Jeanine's instruction)

Three decisions changed after the first delivery. All are implemented and this section replaces the
numbers in sections 1 and 4 where they differ.

### 6.1 The posting window is 14 days, not 7

The master prompt specifies seven days. At 92 employers that produced **three** roles against 638 PM
postings, because good roles sat in the archive eight days after posting. Jeanine extended the window to
14 days on 6 Nov 2026. The rule is implemented as `RULES.windowDays` (`JOB_WINDOW_DAYS` env override);
setting `JOB_WINDOW_DAYS=7` restores the original behaviour with no code change. The archive still runs
on the same rolling date arithmetic, so the board moves forward every day.

### 6.2 California eligibility is flagged, not used to exclude

Jeanine's instruction: a posting that does not name California must be **kept and shown**, not dropped.
Postings are now classified three ways:

| Case | Behaviour |
| --- | --- |
| California named, or US-wide with no state exclusion | `CA confirmed` / `US-wide` badge, eligible for a salary tab |
| State never stated | Kept and shown with a `CA not stated` flag — confirm with the recruiter |
| California explicitly excluded, or posting outside the US | Dropped (cannot be done from California) |

### 6.3 Employer sites only — no aggregators

Himalayas, Remotive and Remote OK were removed from the refresh pipeline on 6 Nov 2026. Every row in the
database now comes from an employer's own applicant-tracking system, so the posting date and the
application link are both first-party. The UI no longer mentions feeds.

### 6.4 Registry rebuilt by discovery, not by a name list

The master prompt defines *categories* (50 states, all industries, all sizes) rather than a company list,
so the registry is built by probing employer career sites directly:

| Measure | Value |
| --- | --- |
| Candidate employers probed in this sweep | 622 |
| Probed across | all 50 states + DC |
| Employers with a readable public board | **186** |
| Postings readable across those boards | 24,023 |
| Project/program roles across those boards | 831 |
| Industries represented | 33 |
| Company-size mix | 72 midsize, 64 large, 25 startup, 17 enterprise, 8 small |
| States with at least one readable board | 21 |

Honest limitation: a state is only "covered" when an employer there publishes a machine-readable board.
Large enterprises in the remaining states run Workday, iCIMS, Taleo or Jobvite, which have no equivalent
public endpoint — those employers can only be tracked as `manual` with a careers link. That is why 21
states show live boards rather than 50, even though all 50 were probed. Adding Workday/iCIMS adapters
(with a known tenant and site path per employer) is the next concrete expansion.

### 6.5 Live state at this update

| Bucket | Roles |
| --- | --- |
| $110K–$130K | 2 |
| $150K+ | 7 |
| Needs verification | 7 |
| Archived (older than the window, or closed) | 19 |

Resume matching is unchanged: 18 competency groups distilled from both resumes (PMO and portfolio
leadership, budget and vendor/contract management, healthcare and EHR, enterprise SaaS including Workday,
Salesforce and ServiceNow, GSA/federal construction, utilities and renewables, marketing operations,
process improvement, organisational change), scored per job and explained line by line in the drawer. No
employer names from her CV are hardcoded anywhere in the application.

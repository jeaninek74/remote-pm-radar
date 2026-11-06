# Verification log

Every claim the radar makes is traceable. This file records how the employer registry was built, how
ownership was researched, and which data-quality checks the engine passed before delivery.

---

## 1. Employer registry — built by testing, not by assumption

The first draft of the employer list was a hypothesis: company name → plausible ATS slug. Testing
that hypothesis is what produced the real registry.

| Step | Result |
| --- | --- |
| Candidate employers probed (curated seed + industry list) | 362 |
| Candidates that resolved to a live public board | 160 |
| Boards with **zero** project/program roles at test time | 68 (kept out of the seed; the company is not hiring PMs now) |
| **Boards with live PM roles — the shipped registry** | **92** |
| Postings readable across those boards | 15,674 |
| Project/program roles across those boards | 638 |
| Industries represented | 27 |
| ATS platforms covered | Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee |

Boards that resolved but contained no PM roles were dropped rather than advertised as coverage.
Boards that fail three consecutive checks at runtime are retired automatically (`active = false`) with
the failure reason stored on the employer row, so the dashboard's "employers searched" number never
counts a dead feed.

Discovery continues at runtime: every cycle reads Himalayas, Remotive and Remote OK, probes the
companies hiring PMs for their own board, and adds them to the registry.

### Sample of the strongest boards (PM roles at validation time)

| Employer | Platform | Postings | PM roles |
| --- | --- | --- | --- |
| OpenAI | Ashby | 819 | 76 |
| Anthropic | Greenhouse | 671 | 45 |
| Stripe | Greenhouse | 765 | 44 |
| Databricks | Greenhouse | 928 | 29 |
| Crusoe | Ashby | 320 | 26 |
| Shield AI | Lever | 662 | 25 |
| Snowflake | Ashby | 370 | 19 |
| Datadog | Greenhouse | 399 | 13 |
| Brex | Greenhouse | 267 | 13 |
| Planet Labs | Greenhouse | 125 | 12 |

---

## 2. Black-owned business verification

Ownership is never inferred from names, imagery or workforce demographics. Each label below is tied to
a public source; the source text is stored on the employer row and exported in the workbook.

| Employer | Status | Source |
| --- | --- | --- |
| Esusu | Verified Black-owned | esusurent.com/about (co-founded 2018 by Wemimo Abbey); Sixth Street profile describes it as "one of the few Black-owned companies to reach unicorn status" |
| Blavity | Verified Black-owned | Wikipedia (Morgan DeBaun, "African American serial entrepreneur… Founder and CEO of Blavity Inc."); blavityinc.com |
| Mayvenn | Verified Black-owned | Forbes, 30 Jun 2022: "Black-owned beauty and tech company Mayvenn"; founder profile at blackventures.org |
| H.J. Russell & Company | Verified Black-owned | hjrussell.com/about — founded 1952 by Herman J. Russell |
| C.D. Moody Construction | Verified Black-owned | cdmoody.com/about — founded by Cedric D. Moody |
| The Integral Group | Verified Black-owned | integralgroup.com/about — founded by Egbert L. J. Perry |
| BITHGROUP Technologies | Verified Black-owned | bithgroup.com/about — founded by Dr. Robert L. Wallace |
| Ariel Investments | Verified Black-owned | arielinvestments.com — co-founded 1983 by John W. Rogers Jr. |
| Urban One | Verified Black-owned | urban1.com/about — founded by Cathy Hughes |
| SoLa Impact | Self-reported | solaimpact.com/about — Black-led team described by the company; ownership structure not disclosed in a citable filing |
| MLT, SEO, UNCF | Not applicable | Nonprofits without owners; tracked as mission-aligned employers, never labelled "Black-owned" |

The last nine are employers without a machine-readable job feed. They are stored as `manual` with their
careers page and a note, and are shown in the Employer database tab with that status — the radar never
implies it searched a board it cannot read.

Nothing else in the registry is labelled Black-owned simply because it is plausible. Those rows read
"Not verified", which is the honest default.

---

## 3. Data-quality checks performed

| Check | Evidence |
| --- | --- |
| Salary extraction ignores non-salary numbers | An early version read *"100,000+ active communities"* (Reddit boilerplate) as a $100,000 salary. The parser now requires a currency marker and pay context, and rejects figures near headcount/customer/funding language. Verified against live postings. |
| Salary ranges are read from the employer's own pay block | Greenhouse `pay-range` blocks are parsed directly: Reddit *Senior Principal Program Manager* → **$180,200–$313,000**, *Senior Program Manager* → **$154,700–$216,600**. |
| Double-escaped HTML does not hide pay | ATS payloads escape entities twice (`&amp;mdash;`); the stripper decodes to a fixed point before parsing. |
| Hybrid is not remote | 196 of 569 sampled PM postings were rejected as hybrid and 278 as on-site; only 95 were remote, of which 51 were California-eligible. |
| Posting dates are not "last updated" dates | Greenhouse `first_published`, Lever `createdAt`, Ashby `publishedAt` are required for tab placement. Boards exposing only an update timestamp send the job to the queue. |
| California eligibility is evidence-based | Mercury lists "San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States" → CA confirmed. Mozilla lists "Remote Canada; Remote Germany; Remote UK; Remote US" → US-wide. A bare "Remote" with no US statement stays unverified in the queue. |
| Application links are employer links | Every tabbed role points at the employer's ATS posting. HTTP status and check date are stored per job (`HTTP 200 · Nov 6, 2026`). |
| Salary bands use the published minimum | Reddit $180,200 → $150K+ tab. GitLab $139,200 → neither tab (the $130,001–$149,999 gap) and is queued with that reason. Instacart $71,000 → below floor, queued. |
| Duplicates collapse | Same company + same normalized title across a board and a feed keeps the employer-linked record. The run counter reports how many were removed. |
| Tracking data survives refreshes | Application status, notes, interview/applied/follow-up dates are only written by the user; the ingest upsert never touches them. Verified by setting and re-reading a note. |

---

## 4. Live run at delivery

| Metric | Value |
| --- | --- |
| Employers searched | 92 |
| Sources checked / failed | 95 / 0 |
| Postings read | ~15,700 |
| Project/program roles evaluated | 638 |
| Remote + California-eligible + recent | 22 |
| Placed in $110K–$130K | 0 |
| Placed in $150K+ | 3 |
| Needs verification | 3 |
| Archived (outside the 7-day window or closed) | 16 |

Three placed roles: Mozilla *Chief of Staff to the CEO* ($356,400), OpenAI *Applied AI Delivery Lead* ($234,000–$335,000),
Mercury *Staff Strategic Operations Program Manager* ($199,900–$249,900). All three are remote, California-eligible,
posted within seven days, with a published base range and a working employer application link.

The zero in the $110K–$130K tab is a real result, not a bug: mid-level remote PM roles in that band were either
hybrid, published without salary, or older than seven days during this window. They appear in the queue or archive
with the specific reason.

---

## 5. Known limitations (stated, not hidden)

1. **Volume is deliberately small.** Seven days + fully remote + California-eligible + published salary in a
   narrow band is a strict filter. With 92 boards the expected yield is a handful of roles per week. The
   registry grows every cycle via feed discovery; more boards scale the tabs linearly.
2. **Employers without a public ATS cannot be searched.** Workday-only employers (some hospitals, government
   contractors, large retailers) are not covered. They are tracked as `manual` where relevant.
3. **The $130,001–$149,999 gap belongs to neither tab** by design. Those roles sit in the queue with an explicit
   "sits in the gap" reason.
4. **Salary data depends on pay transparency.** Employers that do not publish ranges never reach a tab; they are
   queued as "No salary published".
5. **Match scores are keyword/qualification overlap, not a hiring prediction.** They are a sorting aid; the
   drawer lists the exact reasons and the hard requirements that were not met.

# Handover notes (operational facts)

## Live pieces

| Piece | Value |
| --- | --- |
| Live app (old build, still running) | https://remote-pm-radar.onrender.com |
| Repo | https://github.com/jeaninek74/remote-pm-radar (branch `master`) |
| Render service id | `srv-dbn60nm1egvs73cnp0k0` |
| Render deploy | manual only (no Git webhook); Render dashboard → Manual Deploy → Deploy latest commit |
| Database | Neon Postgres, `neondb` @ `ep-falling-wind-arkrcg3a-pooler.c-4.us-west-2.aws.neon.tech` |
| DATABASE_URL | `postgresql://neondb_owner:npg_mCD7npJUGBj2@ep-falling-wind-arkrcg3a-pooler.c-4.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require` |
| Working copy in sandbox | `/home/ubuntu/work/remote-pm-radar` |

## Rules the user set (do not lose)

1. **No job boards and no job leads.** Every posting must come from the employer's own listing.
   Aggregator adapters (Himalayas, Remotive, Remote OK) were deleted from `server/engine/sources.ts`.
   Do not reintroduce them.
2. **Employer listings per state, all 50 states.** Coverage is organised state by state in
   `server/data/state-employers.ts`; unresolved states are tracked with a careers link, never faked.
3. **Two salary tabs**: $110K–$130K and $150K+ (profile bands).
4. **Fully remote, California-eligible**, 14-day posting window (7 available via `JOB_WINDOW_DAYS`).
5. **Both resumes** drive matching; the profile is per-candidate data, the engine is generic.
6. Render's free tier does not meet the need (sleeps, manual deploys); a managed always-on host
   (Manus WebDev Reserved, external Postgres DSN as a secret) is the intended direction.

## Data state at last check

- Before this work: 501 employers, 299 jobs, 9 in salary tabs.
- Registry after this work: 445 seed employers (+ 76 tracked state careers entries), 34 states with
  a readable board, all 50 states represented once tracked rows are seeded.
- 132/132 titles listed in the brief match the title taxonomy (verified).
- 28 Workday boards resolved and searchable; 46 open-ATS boards verified live.
- Employer probing results: `employer-expansion.json`, `careers-resolution.json`, `state-coverage.json`.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/expand-employers.ts` | probe a candidate list against 5 open ATS APIs |
| `scripts/resolve-careers.ts` | verify careers URLs, extract Workday coordinates |
| `scripts/cover-states.ts` | resolve one board per state target, report state coverage |
| `scripts/refresh.ts` | run one refresh cycle against `DATABASE_URL` |

## Known constraints

- Of 394 large employers probed, only 69 publish an open ATS API and 28 resolved to Workday; the
  rest sit behind Taleo, iCIMS or bespoke portals with no public JSON.
- Some careers domains are unreachable from the Manus sandbox (DNS/egress), which is why several
  states fall back to tracked careers links.
- Black-owned ownership records: 14 verified in `server/data/ownership.ts`; most Black-owned firms
  publish no machine-readable board.

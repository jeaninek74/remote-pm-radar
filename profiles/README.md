# Search profiles

Everything candidate-specific lives in a JSON file. The engine — employer discovery, ATS adapters,
location and salary rules, matching, the interface — is generic and reads whichever profile it is
pointed at.

## Run a different board

```bash
cp profiles/example-data-analyst.json profiles/my-search.json
# edit boardName, owner, bands, windowDays, eligibleStates
PROFILE_FILE=profiles/my-search.json DATABASE_URL=postgres://… node dist/server.js
```

On Render, add `PROFILE_FILE=profiles/my-search.json` to the service environment and commit the
file. `JOB_WINDOW_DAYS`, when set, still wins over the file so a deployment can adjust the window
without editing it.

## Fields

| Field | Meaning |
|---|---|
| `boardName` | Title shown in the interface and the browser tab |
| `owner` | Whose search this is; used in the header and exports |
| `roleFamily` | One-line description of the target roles |
| `windowDays` | Only postings whose original date is inside this many days qualify |
| `bands.tab1` | Closed salary band: `min`, `max`, and the label on the tab |
| `bands.tab2` | Open band: `min` plus `label`; `max: null` means no ceiling |
| `eligibleStates` | Two-letter states the candidate may work from |
| `requireEligibleState` | When false, residency restrictions stop disqualifying a role |

## What is *not* yet profile-driven

Being explicit so nobody assumes otherwise:

- **Title relevance** uses a built-in project/program taxonomy (`server/engine/titles.ts`). A profile
  aimed at a different role family needs that taxonomy extended — it is a code change, not a JSON one.
- **Matching** scores against the two resume profiles compiled into `server/engine/match.ts`.
- **Employer registry** is shared; a different profile starts from the same 501 employers and narrows
  by the rules above.

Those three are the next refactor if this is to be sold or handed to another person as a product.

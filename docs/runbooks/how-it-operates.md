# How Deal Flow Matcher Operates

## Current Operator Start Point

Before using this repo runbook as your main entrypoint, start with the current CompanyOS operator runbook:

- [Deal Flow Matcher Current Operator Runbook](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/Companies/Acquira/WIP/Processes/Deal Flow Matcher/deal-flow-matcher-current-operator-runbook-2026-08-04.md>)

Use that file first when you need:

- the fastest workflow overview
- the current system map
- the morning schedule
- the main debugging order
- the most important files, scripts, and config references

Use this repo document after that when you want the code-oriented runtime flow.

## Purpose

Deal Flow Matcher is a standalone Acquira service that:

1. reads new deals from Airtable
2. compares them against stored AE theses
3. records workflow state in managed Postgres
4. creates deduplicated ClickUp delivery jobs
5. delivers matched deals to AE ClickUp lists

It runs without depending on Acquira CRM runtime.

## Current Subagent Boundary

The Deal Flow Matcher subagent should be treated as a daily deal-delivery and weekly deal-flow review system.

It owns:

- daily Airtable intake
- thesis matching
- ClickUp deal delivery
- cursor-safe workflow state
- weekly AE deal-flow review
- recent ClickUp deal-task activity as a deal-work signal inside that weekly review

It does not own:

- Stripe payment confirmation
- welcome and receipt emails
- Thinkific training progress as a direct system signal
- full AE engagement status
- Gmail or Slack as primary engagement truth
- full lifecycle intervention orchestration

## Operator Packet and Agent Read Model

The protected operator packet is the read-only production source for the Operator, QA, Engineering, and AE Deal Flow Agents.

It includes:

- latest scheduled run state
- safe Airtable and Google cursor state
- delivery-queue totals
- report state derived from the latest daily run
- weekly AE coverage and a timestamped recent ClickUp Deals-list activity snapshot
- 90-day stale-deal counts and samples based on Deal Flow Matcher delivery records

It deliberately does not wait for any live ClickUp inventory scan before returning. The separate ClickUp engagement snapshot runs every six hours and stores only the 14-day and 30-day Deals-list activity signals in the private Google Drive JSON file `dfm-clickup-engagement-snapshot.json`. It labels activity as unavailable when that file is missing or stale. This keeps the weekly AE review usable without pretending that missing activity data means an AE is inactive.

To put it another way, the packet is designed to answer the operational question quickly. A full historical ClickUp cleanup audit is a separate, heavier review and must not block daily monitoring or the weekly AE review.

The current durable scope record is:

- [Deal Flow Matcher Subagent Scope](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/Companies/Acquira/WIP/Processes/Deal Flow Matcher/deal-flow-matcher-subagent-scope-2026-08-14.md>)

To put it another way, this repo runbook explains how the service works, while the scope document explains where this subagent should stop so it does not silently become the broader Acquira Delivery Agent.

## Managed Services Split

- Airtable is the source of truth for deal inventory
- Google Sheets is the source of truth for AE thesis submissions
- ClickUp is the destination for matched deals
- Vercel runs the schedule and API routes
- Managed Postgres stores the workflow state needed for unattended reliability

The minimum workflow-state tables are:

- `sync_cursors`
- `match_runs`
- `clickup_delivery_jobs`
- `clickup_delivery_receipts`

The current implementation also keeps normalized deals, AE thesis versions, raw snapshots, and match candidates for replay, backfill, and audit support.

## Scheduling

The service is scheduled through [vercel.json](/Users/andicunanan/Documents/CompanyOS/tmp/deal-flow-matcher/vercel.json).

### Current Cron Schedule

| Job | Cron | Meaning |
|---|---|---|
| Daily run | `30 13 * * *` and `30 14 * * *` | Dual UTC cron entries. Route gating ensures only the invocation that is 9:30 AM Eastern actually runs. |
| New AE daily check | `0 11 * * *` and `0 12 * * *` | Dual UTC cron entries. Route gating ensures only the invocation that is 7:00 AM Eastern actually runs. |

### Route Targets

| Job | Route |
|---|---|
| Daily run | `/api/dfm/cron/daily` |
| New AE daily check | `/api/dfm/cron/new-ae-check` |

### Other Trigger Paths

| Trigger | Route |
|---|---|
| New AE intake | `/api/dfm/events/new-ae` |
| Manual run replay | `/api/dfm/internal/replay/run` |
| Manual AE replay | `/api/dfm/internal/replay/ae` |

Normal runtime note:

- scheduled reconcile is not part of the normal unattended path
- the daily run performs ClickUp delivery inline before advancing the Airtable cursor

## Step-By-Step Daily Operation

### 1. Daily cron fires

Vercel sends an authenticated request to `/api/dfm/cron/daily`.

Safeguard:
- request must include the correct `CRON_SECRET`

### 2. A run record is created

The service inserts a `match_runs` row in managed Postgres with:

- run type `daily`
- trigger source `vercel_cron`
- lock key `dfm:daily`

Safeguard:
- every run has an auditable row, even if it later fails

### 3. The service determines the fetch window

It reads the last Airtable cursor from `dfm_private.sync_cursors`.

If no cursor exists:
- it falls back to a 24-hour lookback window

Safeguard:
- first run still works without prior state

### 4. Airtable deals are fetched

The service calls Airtable with:

- base id from env
- table id from env
- optional view id from env
- a `filterByFormula` window using `CREATED_TIME()`

Current Acquira source:
- base `BBS Businesses in House`
- table `BBS Businesses`
- view `viwJtNNzh556xVJoI`

Safeguard:
- Airtable access is isolated in one provider client

### 5. Raw deals are snapshotted

Each fetched deal is written to `dfm_private.deals_raw`.

Safeguard:
- raw source snapshots are retained for replay and audit
- uniqueness uses `(airtable_record_id, source_hash)`

### 6. Deals are normalized and enriched

The service converts Airtable rows into a normalized internal structure and applies simple industry enrichment from titles when needed.

Safeguard:
- normalization is deterministic and reusable

### 7. Normalized deals are upserted

The current working representation of each deal is written to `dfm_public.deals_normalized`.

Safeguard:
- one current normalized row per Airtable record

### 8. Active AEs are loaded

The service loads active AE rows from `dfm_public.ae_theses`.

### 9. Current thesis versions are loaded

The service loads only `is_current = true` rows from `dfm_private.ae_thesis_versions`.

Safeguard:
- AEs without a current thesis version are skipped
- daily runs do not score against incomplete AE shell records

### 10. Deals are scored against theses

For each deal and each eligible AE thesis, the service scores:

- industry
- geography
- asking price
- EBITDA

Result:
- `Strong`
- `Moderate`
- `Weak`

Safeguard:
- scoring is deterministic and testable

### 11. Match candidates are upserted

The service writes candidate rows into `dfm_private.match_candidates`.

Safeguard:
- unique key on `(ae_thesis_id, deal_id)`
- reruns update the same logical candidate instead of multiplying it

### 12. Delivery jobs are created

For eligible matches, the service inserts a ClickUp delivery job into `dfm_private.clickup_delivery_jobs`.

Safeguard:
- dedupe key format: `ae:{aeThesisId}:deal:{dealId}:target:clickup`
- unique constraint on `dedupe_key`
- reruns do not create duplicate jobs

### 13. Cursor is updated

On non-dry runs, the Airtable cursor is advanced in `sync_cursors` only after inline ClickUp delivery succeeds.

Safeguard:
- dry runs do not mutate progress state
- failed ClickUp delivery prevents cursor advance

### 14. Run is finalized

The run is marked `succeeded` or `failed` and a summary payload is written.

### 15. Summary notification is sent

A summary notification hook is called.

Current status:
- notification client supports Gmail OAuth and Gmail SMTP
- live report emails have been verified against `andi@acquira.com`

## Step-By-Step New AE Operation

### 1. Daily new AE check fires

Vercel sends an authenticated request to `/api/dfm/cron/new-ae-check`.

Safeguards:
- request must include the correct `CRON_SECRET`
- dual UTC cron entries are route-gated so only the 7:00 AM Eastern invocation runs

### 2. The service determines the submission window

It reads the last Google Sheets submission cursor from `dfm_private.sync_cursors`.

If no cursor exists:
- it falls back to a 24-hour lookback window

Safeguards:
- first run still works without prior state
- Google Sheets timestamps are normalized to ISO before comparison and cursor storage

### 3. New submissions are read from Google Sheets

The service reads the configured thesis response sheet and filters rows newer than the cursor window.

Safeguards:
- invalid or unparseable timestamps are dropped instead of poisoning the cursor
- submissions are processed in ascending timestamp order

### 4. Each new submission is handed to the AE backfill workflow

Each qualifying row becomes a `new_ae_backfill` run using the submission key as the lock identity.

### 5. New AE event intake is also supported

The same backfill logic can be triggered directly at `/api/dfm/events/new-ae`.

## Step-By-Step Event-Based New AE Operation

### 1. New AE event is received

The service accepts a request at `/api/dfm/events/new-ae`.

Safeguard:
- request must include the configured event secret header

### 2. A backfill run is created

The service inserts a `match_runs` row with:

- run type `new_ae_backfill`
- lock key `dfm:ae:{submissionKey}`

Safeguard:
- repeated submissions for the same key can be traced and controlled

### 3. The AE row is upserted

The service upserts `dfm_public.ae_theses`.

### 4. Existing current thesis versions are cleared

Any prior `is_current = true` row for that AE is set to false.

### 5. A new current thesis version is inserted

The normalized thesis is written to `dfm_private.ae_thesis_versions`.

### 6. The AE row is updated with `latest_version_id`

Safeguard:
- there is one clear current thesis per AE

### 7. Existing normalized deals are loaded

The service reads current active deals from `dfm_public.deals_normalized`.

### 8. The new AE is matched against recent inventory

Candidate rows and delivery jobs are created the same way as in the daily run.

Safeguard:
- same candidate upsert rules
- same delivery dedupe rules

## Step-By-Step Delivery Operation

### 1. Daily run reaches delivery

The daily run processes pending ClickUp delivery jobs inline.

### 2. A reconciliation run row is created

Safeguard:
- worker activity is auditable like daily runs

### 3. Pending jobs are loaded

The worker reads jobs with:

- `pending`
- `retry_scheduled`

### 4. Job is marked `processing`

The worker sets:

- `claimed_by`
- `claimed_at`

### 5. Existing receipt is checked first

The worker checks `clickup_delivery_receipts` for that job id.

Safeguard:
- if a receipt already exists, the job is marked `sent` without creating a new ClickUp task
- this is an explicit duplicate-delivery guard

### 6. AE, deal, and candidate context is loaded

The worker reads:

- AE record
- normalized deal
- match candidate

### 7. ClickUp task is created

The worker sends a task creation request to ClickUp.

Current first-pass behavior:
- task title uses match quality and deal name
- description includes AE, score, industry, location, ask, cash flow, and listing URL

### 8. Delivery receipt is inserted

The worker writes the ClickUp task id and response payload to `clickup_delivery_receipts`.

Safeguard:
- append-only receipt layer preserves delivery evidence

### 9. Job is marked `sent`

Safeguard:
- delivery state is explicit and queryable

## Failure Handling

Delivery failures are classified by `classify-delivery-failure.ts`.

### Retry Cases

These are currently treated as retryable:

- 429-like responses
- 5xx-like responses
- unknown transient failures

Behavior:
- job status becomes `retry_scheduled`
- next attempt is scheduled 5 minutes later

### Terminal Cases

These are currently treated as terminal:

- authorization failures
- invalid or missing configuration-like failures

Behavior:
- job status becomes `failed_terminal`

### Run Failure Behavior

If a workflow step throws:

- the run row is marked `failed`
- the error message is stored in the run error payload

## Key Safeguards

### Authentication Safeguards

| Area | Safeguard |
|---|---|
| Cron routes | `CRON_SECRET` bearer auth |
| Internal routes | `DFM_INTERNAL_SECRET` bearer auth |
| Event intake | `DFM_EVENT_SECRET` header check |

### Data Safeguards

| Area | Safeguard |
|---|---|
| Raw deals | Immutable snapshots in `deals_raw` |
| Current deals | Upserted normalized table |
| AE theses | Versioned current thesis rows |
| Match candidates | Unique `(ae_thesis_id, deal_id)` key |
| Delivery jobs | Unique `dedupe_key` |
| Delivery receipts | Explicit receipt check before provider write |

### Operational Safeguards

| Area | Safeguard |
|---|---|
| Dry runs | Do not advance Airtable cursor |
| First daily run | Falls back to 24-hour Airtable lookback if no cursor exists |
| First new AE daily check | Falls back to 24-hour Google Sheets lookback if no cursor exists |
| Delivery boundary | Cursor advances only after inline ClickUp delivery succeeds |
| Replay safety | Candidate and job uniqueness constrain duplication |
| Recovery after failure | Next daily run resumes from the last successful Airtable cursor and captures missed deals |

## Cost-Conscious Deployment Path

- Keep the app on Vercel
- Keep the existing shared Supabase Postgres database as the managed Postgres layer
- Do not add another database vendor unless the shared database becomes an operational problem
- Do not use Google Drive as the operational store for cursors, jobs, or receipts

## Current Limitations

| Name | Description |
|---|---|
| Standalone Vercel env is incomplete | Unattended runtime still needs complete standalone secrets, especially a working managed Postgres connection such as `DIRECT_URL` |
| Google OAuth uses local file paths today | Vercel cannot use local Mac file paths for unattended token access |
| ClickUp custom-field mapping is not implemented | Task body is first-pass only |
| New AE deliveries are no longer immediate | New AE matches created outside the daily run will be delivered by the next daily run |
| No automated test suite yet | Verification currently relies on typecheck, smoke script, and build |

## Recommended Next Hardening Steps

1. Link the repo to a dedicated Vercel project for DFM.
2. Add standalone production secrets, especially a working managed Postgres connection.
3. Replace local-file Google OAuth token usage with production-safe secret material or a service account path.
4. Add explicit ClickUp custom-field mapping.
5. Consider inlining new-AE delivery if same-day delivery becomes important.

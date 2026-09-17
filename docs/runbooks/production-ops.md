# Production Ops

## Current Operator Start Point

Before using this repo production note as the main workflow guide, start with:

- [Deal Flow Matcher Current Operator Runbook](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/Companies/Acquira/WIP/Processes/Deal Flow Matcher/deal-flow-matcher-current-operator-runbook-2026-08-04.md>)

That runbook is the current operator-facing starting point for:

- workflow purpose
- schedule and runtime flow
- source-of-truth map
- debugging order
- key runtime files
- config and script references

Use this repo document for production-specific deployment and runtime notes after the operator runbook.

This service is production-backed by Vercel, Neon, Airtable, ClickUp, Google Sheets, and Gmail/Gmail OAuth. It is separate from Acquira CRM.

## Source Control and Deployment

The production source repo is:

`git@github.com:andi-c-ops/acquira-deal-flow-matcher-prod.git`

The Vercel project is:

`acquira-deal-flow-matcher-prod`

Normal deployment workflow:

1. Make code changes locally.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Run `npm run smoke` when matching, scoring, parsing, or delivery logic changes.
5. Commit the source changes to Git.
6. Push to `main`.
7. Let Vercel deploy from GitHub.
8. Verify the Vercel deployment is `Ready`.
9. Verify the production alias:

`https://acquira-deal-flow-matcher-prod.vercel.app`

Do not commit local secrets or generated artifacts. The repo ignores `.env.production.local`, `.vercel.*.env`, `.next`, `node_modules`, `tmp-preview`, and TypeScript build cache files.

In other words, GitHub is now the source of truth for code, and Vercel should receive production changes from GitHub instead of one-off local deploys.

## Read-Only Airtable Credential Probe

The protected `GET /api/dfm/internal/airtable-probe` route is the safe way to
check the Production Airtable credential before considering a rotation. It
requires the `DFM_INTERNAL_SECRET` bearer credential, makes one request for at
most one Airtable row, discards the response body, and returns only a redacted
status such as `authenticated`, `unauthorized`, or `unreachable`.

The probe does not create or update a Deal Flow Matcher run, touch Neon DFM state,
advance the Airtable cursor, enqueue or deliver ClickUp work, or send email.
Do not substitute the daily, backlog-recovery, or replay routes for this check;
those routes perform workflow work and write operational state.

## Cron Behavior

- `daily`: 9:30 AM Eastern year-round via dual UTC cron entries and route gating
- `new-ae-check`: 7:00 AM Eastern year-round via dual UTC cron entries and route gating
- `clickup-delivery`: minute-level ClickUp delivery worker with bounded batches and stale-claim recovery
- `clickup-engagement-snapshot`: every six hours, refreshes the private Google Drive JSON used only for AE Deal Flow Agent ClickUp activity signals
- `backlog-recovery`: every 5 minutes, but inactive unless `DFM_BACKLOG_RECOVERY_ENABLED=true`
- `reconcile`: removed from the normal runtime path

## Backlog Recovery Mode

Backlog recovery is the cloud-safe way to catch up after the Airtable cursor falls behind. It is intentionally disabled by default.

Use it when:

- Airtable has a large backlog after the current `airtable_daily_deals` cursor.
- The normal daily run would be too large for a single Vercel function invocation.
- ClickUp delivery must continue without depending on a local MacBook or terminal session.

How it works:

1. Vercel calls `/api/dfm/cron/backlog-recovery` every 5 minutes.
2. The route verifies the cron secret.
3. If `DFM_BACKLOG_RECOVERY_ENABLED` is not `true`, it exits without doing work.
4. It finalizes any completed partial daily runs first.
5. If any daily run is still open, it exits and waits for the next cron.
6. It reads the `airtable_daily_deals` cursor from the dedicated Neon DFM database.
7. It probes ahead for Airtable deals, skips empty windows, and shrinks dense windows to a safe size.
8. It creates deferred ClickUp delivery jobs.
9. The existing `clickup-delivery` cron drains those jobs.
10. The existing finalizer advances the Airtable cursor only after delivery succeeds.

To put it another way, backlog recovery turns a huge catch-up run into many small safe runs that Vercel can complete one at a time, while skipping quiet gaps quickly.

Enable only during catch-up:

`DFM_BACKLOG_RECOVERY_ENABLED=true`

Disable after the cursor is current:

`DFM_BACKLOG_RECOVERY_ENABLED=false`

Manual signed POST options:

```json
{
  "force": true,
  "skipNotifications": true,
  "windowSeconds": 10,
  "probeWindowSeconds": 86400,
  "maxDealsPerRun": 6,
  "overlapMs": 1000,
  "minLagSeconds": 900
}
```

Safety notes:

- Recovery skips if another daily run is queued, running, or partial.
- Recovery sends no summary email by default.
- Recovery replays a 1-second overlap to avoid missing records at cursor boundaries.
- Recovery can advance the cursor across empty Airtable windows because there are no ClickUp deliveries to protect in those windows.
- ClickUp dedupe keys prevent duplicate tasks when the overlap sees an already-delivered deal.
- The cursor still advances only after ClickUp delivery is complete.

## Production Guardrails

- The Airtable cursor advances only after required ClickUp delivery succeeds.
- ClickUp delivery uses idempotent dedupe keys, receipts, and a DFM delivery marker in each generated task description to avoid duplicate tasks after a retry.
- Failed daily runs should send an error email and leave the cursor unchanged.
- There is no automatic 90-day untouched-deal deletion in ClickUp or Airtable.
- Any stale-deal cleanup should begin as a read-only review or archive proposal, not a delete action.
- Per-AE delivery thresholds live in `dfm_public.ae_theses.delivery_min_match_quality`.
- `Moderate` is the default threshold, which sends Strong and Moderate matches.
- `Strong` sends only Strong matches for that AE.

Current Strong-only exception:

| AE | Rule |
|---|---|
| Nephtalie pierre | Send only Strong matches to ClickUp |

## Guarded ClickUp Reconciliation

When a delivery job is stuck in `processing` and an operator-created task already exists, do not reset the job and let the normal worker create another task. Use the protected `/dfm/operator/reconcile` page and provide the exact processing job ID and existing ClickUp task ID.

The reconciliation route checks all of the following before writing a receipt:

- the job still has no receipt and is still `processing`
- the ClickUp task is in the job's configured list
- the task title matches the expected match quality and deal name

Only after those checks pass does it write an append-only receipt, mark that one job `sent`, and run the normal daily finalizer. If the checks fail, no task or job state is changed. The receipt records that the task was reconciled by an operator rather than created by the worker.

In other words, recovery reuses one explicitly identified task only when its list and title prove it belongs to the stuck job. An uncertain match stays open instead of creating a duplicate or inventing evidence.

## ClickUp Engagement Snapshot

The weekly AE Deal Flow Agent reads recent ClickUp Deals-list activity from the dedicated Neon `sync_cursors` store under the key `clickup_engagement_snapshot_v1`. This monitoring record does not participate in daily matching, ClickUp delivery, job dedupe, receipts, run logs, or Airtable cursor advancement.

The six-hour snapshot refresh uses the same production database connection as the rest of the Deal Flow Matcher. It requires no Google Drive credential, personal Google authorization, or 1Password access. No additional Vercel environment variable is required.

If the snapshot record is absent, malformed, stale, or temporarily unreadable, the operator packet remains available and labels ClickUp engagement as unknown. It must never infer inactivity from a missing snapshot.

To put it another way, the snapshot is runtime monitoring state stored beside the workflow's existing private data in Neon, and the agent no longer needs a separate Google credential path.

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

This service is production-backed by Vercel, Supabase, Airtable, ClickUp, Google Sheets, and Gmail/Gmail OAuth.

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

## Cron Behavior

- `daily`: 9:30 AM Eastern year-round via dual UTC cron entries and route gating
- `new-ae-check`: 7:00 AM Eastern year-round via dual UTC cron entries and route gating
- `clickup-delivery`: minute-level ClickUp delivery worker
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
6. It reads the `airtable_daily_deals` cursor from Supabase.
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
- ClickUp delivery uses idempotent dedupe keys and receipts to avoid duplicate tasks.
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

## Google Drive Engagement Snapshot

The weekly AE Deal Flow Agent reads a small Google Drive JSON file for recent ClickUp Deals-list activity. This is monitoring data only. It does not participate in daily matching, ClickUp delivery, job dedupe, receipts, run logs, or Airtable cursor advancement.

Required Vercel production environment variables:

- `GOOGLE_DRIVE_SNAPSHOT_FOLDER_ID`: `1TKz24roAajp-pqgDFxMq6SARGSt1CWuL`
- `GOOGLE_DRIVE_TOKEN_JSON`: OAuth token JSON with the `https://www.googleapis.com/auth/drive.file` scope
- `GOOGLE_DRIVE_OAUTH_CLIENT_JSON`: the matching installed OAuth client JSON used to refresh that Drive token

The scheduled snapshot creates and then updates a private file named `dfm-clickup-engagement-snapshot.json` in the configured folder. The operator packet limits its Drive read to five seconds. If the file, credential, or Drive API is unavailable, the packet remains available and labels ClickUp engagement as unknown. It must never infer inactivity from a missing snapshot.

One-time authorization:

1. Use a Google OAuth client configured as an installed application with `http://localhost:8787` available as its local callback.
2. Run `npm run authorize-google-drive` with `GOOGLE_OAUTH_CLIENT_FILE` pointing to that client JSON and `GOOGLE_DRIVE_TOKEN_OUTPUT_FILE` pointing to a private file under the CompanyOS `config` folder.
3. Open the printed Google authorization link while signed in to the Acquira Google account that owns the snapshot folder.
4. Approve only the Google Drive `drive.file` permission.
5. Save the generated token JSON in 1Password, then add it to Vercel as `GOOGLE_DRIVE_TOKEN_JSON`.

Do not commit the generated token file or paste its contents into chat, documentation, or source control.

To put it another way, Google Drive stores only a small weekly-review aid. Supabase remains the authoritative persistence layer for the core daily Deal Flow Matcher workflow.

# Production Ops

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
7. It processes a small overlapped Airtable window, defaulting to 10 seconds.
8. It creates deferred ClickUp delivery jobs.
9. The existing `clickup-delivery` cron drains those jobs.
10. The existing finalizer advances the Airtable cursor only after delivery succeeds.

To put it another way, backlog recovery turns a huge catch-up run into many small safe runs that Vercel can complete one at a time.

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
  "overlapMs": 1000,
  "minLagSeconds": 900
}
```

Safety notes:

- Recovery skips if another daily run is queued, running, or partial.
- Recovery sends no summary email by default.
- Recovery replays a 1-second overlap to avoid missing records at cursor boundaries.
- ClickUp dedupe keys prevent duplicate tasks when the overlap sees an already-delivered deal.
- The cursor still advances only after ClickUp delivery is complete.

## Production Guardrails

- The Airtable cursor advances only after required ClickUp delivery succeeds.
- ClickUp delivery uses idempotent dedupe keys and receipts to avoid duplicate tasks.
- Failed daily runs should send an error email and leave the cursor unchanged.
- Per-AE delivery thresholds live in `dfm_public.ae_theses.delivery_min_match_quality`.
- `Moderate` is the default threshold, which sends Strong and Moderate matches.
- `Strong` sends only Strong matches for that AE.

Current Strong-only exception:

| AE | Rule |
|---|---|
| Nephtalie pierre | Send only Strong matches to ClickUp |

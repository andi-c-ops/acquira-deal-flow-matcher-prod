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
- `reconcile`: removed from the normal runtime path

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

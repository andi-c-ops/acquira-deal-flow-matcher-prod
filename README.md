# Deal Flow Matcher

Standalone Acquira service for matching Airtable deals against AE theses and delivering matched deals into ClickUp.

## Documentation Start Here

If you are opening this repo to understand, support, or troubleshoot the workflow, use this reading order:

1. [Current operator runbook](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/Companies/Acquira/WIP/Processes/Deal Flow Matcher/deal-flow-matcher-current-operator-runbook-2026-08-04.md>)
2. [How Deal Flow Matcher Operates](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/tmp/Acquira/Acquira Deal Flow Matcher/Repo/docs/runbooks/how-it-operates.md>)
3. [Production Ops](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/tmp/Acquira/Acquira Deal Flow Matcher/Repo/docs/runbooks/production-ops.md>)
4. [Stale Deal Review Policy](</Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/tmp/Acquira/Acquira Deal Flow Matcher/Repo/docs/runbooks/stale-deal-review.md>)

Use the operator runbook first when you need:

- the fastest workflow overview
- the current schedule
- the source-of-truth map
- the debugging order
- the most important files, scripts, and config references

Use the repo runbooks after that when you need code-level or production-specific detail.

## Status

Working standalone service with Airtable intake, Google Sheets thesis intake, ClickUp delivery, and Gmail notification wiring. A real-data live matching and report-email test has been run locally. The unattended runtime path is Vercel for execution plus managed Postgres for durable workflow state.

## Intended Shape

- Dedicated Vercel project
- Dedicated cron ownership
- Dedicated DFM environment variables
- Managed Postgres for workflow state through dedicated `dfm_public` and `dfm_private` schemas
- No runtime coupling to Acquira CRM

## Live Sources

- Deal source: `BBS Businesses in House` Airtable base `appWjJI1If33uroBs`, table `tbllzLdE5ZLCLD2eI`, view `viwJtNNzh556xVJoI`
- Thesis source: `Accelerator Investment Thesis (Responses)` Google Sheet `1BGRFFrpLstH_KCUhHS2hKaQNomyKxOsLxmxv8A63xCc`
- Managed Postgres host: currently the shared Acquira Supabase Postgres project at `https://jinjqqibkmsdmfwlizte.supabase.co`

## Current Schedule

- Daily deal run: `9:30 AM America/New_York` year-round
- New AE daily check: `7:00 AM America/New_York` year-round
- Daily notification email: sent from `andi@acquira.com` to `andi@acquira.com` using Gmail OAuth or Gmail app-password credentials

Because Vercel cron uses UTC schedules, the service uses dual UTC cron entries plus an Eastern-time gate in the route handlers so only the invocation that matches the target New York time actually runs.

Cursor defaults:

- Daily deal run falls back to a 24-hour Airtable lookback if no daily cursor exists
- New AE daily check falls back to a 24-hour Google Sheets lookback if no submission cursor exists

## Commands

```bash
npm install
npm run typecheck
npm run smoke
npm run readiness
npm run live-test
npm run dev
```

Production-friendly auth:

- Google OAuth client and token material can be supplied either as local file paths or inline JSON env vars
- Inline JSON env vars are the intended path for unattended Vercel execution
- The workflow can persist through either `SUPABASE_SERVICE_ROLE_KEY` or a direct pooled Postgres connection such as `DIRECT_URL`

## Managed Services Model

- Airtable remains the source of truth for new deals
- ClickUp remains the delivery surface for matched deals
- Vercel owns scheduling, route execution, inline delivery, and notifications
- Managed Postgres owns cursor state, run history, job dedupe, and delivery receipts

Current recommendation:

- keep Vercel as the runtime
- keep the existing shared Supabase Postgres instance as the lowest-cost managed database
- avoid Google Drive, Airtable, or ClickUp as workflow-state stores

Current runtime simplification:

- the daily run now includes ClickUp delivery inline before the Airtable cursor is advanced
- the scheduled reconcile cron pass has been removed
- if ClickUp delivery fails, the run fails and the Airtable cursor stays at the last successful point
- the next daily run resumes from that last successful Airtable cursor and captures the missed deals using job and receipt dedupe

## Minimal Required Persistence

For unattended reliability, the minimal operational state is:

- `dfm_private.sync_cursors`
- `dfm_private.match_runs`
- `dfm_private.clickup_delivery_jobs`
- `dfm_private.clickup_delivery_receipts`

The current first-pass implementation also persists AE theses, thesis versions, normalized deals, raw deal snapshots, and match candidates to support replay, backfill, and audit. Those tables are acceptable to keep for now because removing them before the workflow is fully stable would increase risk.

## Current Contents

- Thin Next.js route handlers for cron, event intake, replay, and worker paths
- Workflow implementations for run state, AE upserts, thesis version persistence, raw deal snapshots, normalized deal persistence, candidate upserts, daily delivery job enqueue, and backfill matching
- Shared env validation and auth guards
- Repo-owned first-pass managed-Postgres migration draft, now also applied to the shared Acquira Supabase Postgres project
- Repository-layer stubs for runs, deals, candidates, jobs, receipts, errors, and cursors
- First-pass Airtable client, Google Sheets intake client, ClickUp client, Gmail notification client, thesis normalization, deal normalization, enrichment, and scoring
- Seeded smoke runner for zero-network matching verification and a real-data live test harness
- Architecture and runbook doc placeholders

## Current Production Blockers

1. Keep a working pooled Postgres connection such as `DIRECT_URL` so the cron routes can use the live `dfm_public` and `dfm_private` tables
2. Replace local-file Google OAuth token dependencies with production-safe secrets or a service-to-service auth path before unattended Vercel execution
3. Add stronger ClickUp task payload shaping and custom-field mapping
4. Add explicit rate-limit and retry classification plus replay coverage

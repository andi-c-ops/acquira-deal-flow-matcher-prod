# Architecture Overview

Deal Flow Matcher runs as a standalone Vercel service with managed-Postgres workflow state.

Core boundaries:

- Airtable is the deal source
- ClickUp is the delivery surface
- Vercel owns execution
- Managed Postgres owns state, dedupe, and receipts
- Acquira CRM is not part of the runtime path

Operational recommendation:

- Use Vercel for route execution, cron scheduling, and notifications
- Use the existing shared Supabase Postgres instance as the managed Postgres layer
- Do not use Google Drive as a live workflow database
- Do not move cursor, job, or receipt state into Airtable or ClickUp

Minimal reliability state:

- `dfm_private.sync_cursors`
- `dfm_private.match_runs`
- `dfm_private.clickup_delivery_jobs`
- `dfm_private.clickup_delivery_receipts`

Scheduling model:

- Vercel cron triggers the daily deal run twice in UTC, at `13:30` and `14:30`
- route-level Eastern-time gating ensures the run executes only when local New York time is `9:30 AM`
- Vercel cron triggers the daily new-AE check twice in UTC, at `11:00` and `12:00`
- route-level Eastern-time gating ensures the new-AE check executes only when local New York time is `7:00 AM`

Delivery model:

- the daily run enqueues matched ClickUp jobs and processes them inline before advancing the Airtable cursor
- scheduled reconcile passes are not part of the normal runtime path
- if inline ClickUp delivery fails, the daily run fails and the Airtable cursor remains unchanged
- the next daily run resumes from the last successful Airtable cursor and captures deals missed during the failed run window

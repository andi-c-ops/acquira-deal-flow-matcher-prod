# Production Ops

This service is not production-ready yet.

Before production:

1. add the real Supabase migration files
2. wire provider clients
3. implement repository layer
4. add replay and recovery tests
5. configure Vercel cron and secrets

Current intended cron behavior:

- `daily`: 9:30 AM Eastern year-round via dual UTC cron entries and route gating
- `new-ae-check`: 7:00 AM Eastern year-round via dual UTC cron entries and route gating
- `reconcile`: removed from the normal runtime path

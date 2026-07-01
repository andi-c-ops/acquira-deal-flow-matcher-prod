-- Deal Flow Matcher
-- First-pass Supabase schema draft
-- Date: 2026-06-15
-- Status: WIP
-- Company: Acquira
--
-- Purpose:
-- Create the first durable schema for the managed-cloud redesign of
-- Deal Flow Matcher. This draft is intended for review, iteration, and later
-- hardening once implementation details are finalized.

create extension if not exists pgcrypto;

create schema if not exists dfm_public;
create schema if not exists dfm_private;

comment on schema dfm_public is 'Deal Flow Matcher tables that may later support controlled API reads.';
comment on schema dfm_private is 'Deal Flow Matcher internal workflow tables for runs, jobs, receipts, and errors.';

revoke all on schema dfm_public from public;
revoke all on schema dfm_private from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema dfm_public from anon';
    execute 'revoke all on schema dfm_private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema dfm_public from authenticated';
    execute 'revoke all on schema dfm_private from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema dfm_public to service_role';
    execute 'grant usage on schema dfm_private to service_role';
  end if;
end $$;

create type dfm_private.run_type as enum (
  'daily',
  'new_ae_backfill',
  'reconciliation',
  'manual_replay'
);

create type dfm_private.run_status as enum (
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
  'cancelled'
);

create type dfm_private.job_status as enum (
  'pending',
  'processing',
  'sent',
  'retry_scheduled',
  'failed_terminal',
  'cancelled'
);

create type dfm_private.ae_status as enum (
  'active',
  'paused',
  'archived'
);

create type dfm_private.error_type as enum (
  'airtable_fetch_failed',
  'normalization_failed',
  'matching_failed',
  'clickup_mapping_missing',
  'clickup_request_failed',
  'notification_failed',
  'invalid_payload',
  'lock_conflict',
  'unknown'
);

create or replace function dfm_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table dfm_public.ae_theses (
  id uuid primary key default gen_random_uuid(),
  external_submission_key text unique,
  ae_name text not null,
  ae_email text,
  clickup_list_id text,
  status dfm_private.ae_status not null default 'active',
  latest_version_id uuid,
  first_submitted_at timestamptz,
  last_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ae_theses_name_not_blank check (btrim(ae_name) <> '')
);

create index ae_theses_status_idx on dfm_public.ae_theses (status);
create index ae_theses_email_idx on dfm_public.ae_theses (ae_email);

create trigger set_ae_theses_updated_at
before update on dfm_public.ae_theses
for each row
execute function dfm_private.set_updated_at();

create table dfm_private.ae_thesis_versions (
  id uuid primary key default gen_random_uuid(),
  ae_thesis_id uuid not null references dfm_public.ae_theses(id) on delete cascade,
  raw_payload jsonb not null,
  normalized_payload jsonb not null,
  submitted_at timestamptz not null,
  is_current boolean not null default false,
  normalization_version text not null,
  created_at timestamptz not null default now(),
  constraint ae_thesis_versions_normalization_version_not_blank
    check (btrim(normalization_version) <> '')
);

create index ae_thesis_versions_parent_idx
  on dfm_private.ae_thesis_versions (ae_thesis_id, submitted_at desc);

create unique index ae_thesis_versions_current_unique
  on dfm_private.ae_thesis_versions (ae_thesis_id)
  where is_current = true;

alter table dfm_public.ae_theses
  add constraint ae_theses_latest_version_fk
  foreign key (latest_version_id)
  references dfm_private.ae_thesis_versions(id);

create table dfm_private.deals_raw (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text not null,
  fetched_at timestamptz not null default now(),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_hash text not null,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint deals_raw_airtable_record_id_not_blank check (btrim(airtable_record_id) <> ''),
  constraint deals_raw_source_hash_not_blank check (btrim(source_hash) <> '')
);

create unique index deals_raw_source_unique
  on dfm_private.deals_raw (airtable_record_id, source_hash);

create index deals_raw_airtable_idx
  on dfm_private.deals_raw (airtable_record_id, fetched_at desc);

create table dfm_public.deals_normalized (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,
  current_raw_id uuid not null references dfm_private.deals_raw(id),
  business_name text not null,
  industry text,
  location text,
  state text,
  price numeric,
  ebitda numeric,
  multiple numeric,
  listing_url text,
  description text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_normalized_airtable_record_id_not_blank check (btrim(airtable_record_id) <> ''),
  constraint deals_normalized_business_name_not_blank check (btrim(business_name) <> '')
);

create index deals_normalized_active_idx
  on dfm_public.deals_normalized (is_active, updated_at desc);

create index deals_normalized_source_updated_idx
  on dfm_public.deals_normalized (source_updated_at desc);

create trigger set_deals_normalized_updated_at
before update on dfm_public.deals_normalized
for each row
execute function dfm_private.set_updated_at();

create table dfm_private.match_runs (
  id uuid primary key default gen_random_uuid(),
  run_type dfm_private.run_type not null,
  trigger_source text not null,
  status dfm_private.run_status not null default 'queued',
  trigger_payload jsonb,
  cursor_start timestamptz,
  cursor_end timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  summary_json jsonb,
  error_json jsonb,
  replay_of_run_id uuid references dfm_private.match_runs(id),
  lock_key text,
  created_at timestamptz not null default now(),
  constraint match_runs_trigger_source_not_blank check (btrim(trigger_source) <> ''),
  constraint match_runs_finished_after_started
    check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index match_runs_status_idx
  on dfm_private.match_runs (status, created_at desc);

create index match_runs_type_idx
  on dfm_private.match_runs (run_type, created_at desc);

create index match_runs_lock_key_idx
  on dfm_private.match_runs (lock_key, created_at desc)
  where lock_key is not null;

create table dfm_private.match_candidates (
  id uuid primary key default gen_random_uuid(),
  ae_thesis_id uuid not null references dfm_public.ae_theses(id) on delete cascade,
  deal_id uuid not null references dfm_public.deals_normalized(id) on delete cascade,
  last_run_id uuid not null references dfm_private.match_runs(id),
  score_pct numeric not null,
  match_quality text not null,
  criteria_details jsonb not null,
  delivery_eligible boolean not null,
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_candidates_score_pct_range check (score_pct >= 0 and score_pct <= 100),
  constraint match_candidates_match_quality_not_blank check (btrim(match_quality) <> '')
);

create unique index match_candidates_unique
  on dfm_private.match_candidates (ae_thesis_id, deal_id);

create index match_candidates_delivery_idx
  on dfm_private.match_candidates (delivery_eligible, updated_at desc);

create trigger set_match_candidates_updated_at
before update on dfm_private.match_candidates
for each row
execute function dfm_private.set_updated_at();

create table dfm_private.clickup_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references dfm_private.match_runs(id),
  ae_thesis_id uuid not null references dfm_public.ae_theses(id),
  deal_id uuid not null references dfm_public.deals_normalized(id),
  match_candidate_id uuid references dfm_private.match_candidates(id),
  clickup_list_id text not null,
  dedupe_key text not null,
  status dfm_private.job_status not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 6,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  last_error text,
  last_error_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clickup_delivery_jobs_clickup_list_id_not_blank check (btrim(clickup_list_id) <> ''),
  constraint clickup_delivery_jobs_dedupe_key_not_blank check (btrim(dedupe_key) <> ''),
  constraint clickup_delivery_jobs_attempt_count_nonnegative check (attempt_count >= 0),
  constraint clickup_delivery_jobs_max_attempts_positive check (max_attempts > 0)
);

create unique index clickup_delivery_jobs_dedupe_unique
  on dfm_private.clickup_delivery_jobs (dedupe_key);

create index clickup_delivery_jobs_pending_idx
  on dfm_private.clickup_delivery_jobs (status, next_attempt_at, created_at);

create index clickup_delivery_jobs_run_idx
  on dfm_private.clickup_delivery_jobs (run_id, created_at);

create trigger set_clickup_delivery_jobs_updated_at
before update on dfm_private.clickup_delivery_jobs
for each row
execute function dfm_private.set_updated_at();

create table dfm_private.clickup_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references dfm_private.clickup_delivery_jobs(id) on delete cascade,
  clickup_task_id text not null,
  clickup_task_url text,
  provider_response_json jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint clickup_delivery_receipts_task_id_not_blank check (btrim(clickup_task_id) <> '')
);

create unique index clickup_delivery_receipts_job_unique
  on dfm_private.clickup_delivery_receipts (job_id);

create index clickup_delivery_receipts_task_idx
  on dfm_private.clickup_delivery_receipts (clickup_task_id);

create table dfm_private.workflow_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references dfm_private.match_runs(id),
  job_id uuid references dfm_private.clickup_delivery_jobs(id),
  error_type dfm_private.error_type not null default 'unknown',
  error_message text not null,
  error_json jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_errors_error_message_not_blank check (btrim(error_message) <> '')
);

create index workflow_errors_run_idx
  on dfm_private.workflow_errors (run_id, created_at desc);

create index workflow_errors_job_idx
  on dfm_private.workflow_errors (job_id, created_at desc);

create index workflow_errors_type_idx
  on dfm_private.workflow_errors (error_type, created_at desc);

create table dfm_private.sync_cursors (
  key text primary key,
  cursor_value text,
  cursor_timestamp timestamptz,
  metadata jsonb,
  updated_at timestamptz not null default now(),
  constraint sync_cursors_key_not_blank check (btrim(key) <> '')
);

create trigger set_sync_cursors_updated_at
before update on dfm_private.sync_cursors
for each row
execute function dfm_private.set_updated_at();

comment on table dfm_public.ae_theses is 'Stable AE identity, routing, and current thesis pointer.';
comment on table dfm_private.ae_thesis_versions is 'Versioned raw and normalized AE thesis submissions.';
comment on table dfm_private.deals_raw is 'Immutable Airtable source snapshots for deals.';
comment on table dfm_public.deals_normalized is 'Latest normalized deal rows used for matching.';
comment on table dfm_private.match_runs is 'Workflow run ledger for daily, onboarding, reconciliation, and replay runs.';
comment on table dfm_private.match_candidates is 'Current best-known AE-to-deal match records.';
comment on table dfm_private.clickup_delivery_jobs is 'Durable outbound ClickUp delivery queue.';
comment on table dfm_private.clickup_delivery_receipts is 'Append-only proof of successful ClickUp delivery.';
comment on table dfm_private.workflow_errors is 'Searchable error history across runs and jobs.';
comment on table dfm_private.sync_cursors is 'Optional workflow cursors for Airtable and Google submission progress.';

import { queryOne } from "@/lib/dfm/db/client";
import type { RunStatus, RunType } from "@/lib/dfm/domain/types";

export interface CreateMatchRunInput {
  runType: RunType;
  triggerSource: string;
  triggerPayload?: unknown;
  lockKey?: string | null;
}

export async function createMatchRun(input: CreateMatchRunInput) {
  return queryOne(
    `
      insert into dfm_private.match_runs (
        run_type,
        trigger_source,
        trigger_payload,
        lock_key,
        status
      )
      values ($1::dfm_private.run_type, $2, $3::jsonb, $4, 'queued')
      returning *
    `,
    [
      input.runType,
      input.triggerSource,
      JSON.stringify(input.triggerPayload ?? null),
      input.lockKey ?? null,
    ],
  );
}

export async function updateMatchRunStatus(
  runId: string,
  status: RunStatus,
  summaryJson?: Record<string, unknown>,
  errorJson?: Record<string, unknown>,
) {
  return queryOne(
    `
      update dfm_private.match_runs
      set
        status = $2::dfm_private.run_status,
        summary_json = $3::jsonb,
        error_json = $4::jsonb,
        finished_at = case when $2::text = 'running' then null else now() end,
        started_at = case when $2::text = 'running' then now() else started_at end
      where id = $1
      returning *
    `,
    [runId, status, JSON.stringify(summaryJson ?? null), JSON.stringify(errorJson ?? null)],
  );
}

export async function getMatchRunById(runId: string) {
  return queryOne(`select * from dfm_private.match_runs where id = $1`, [runId]);
}

export async function listOpenDailyRuns() {
  return queryOne(
    `
      select json_agg(t order by t.created_at asc) as runs
      from (
        select *
        from dfm_private.match_runs
        where run_type = 'daily'
          and status in ('queued', 'running', 'partial')
        order by created_at asc
      ) t
    `,
    [],
  );
}

export async function listStaleRunningDailyRuns(cutoffIso: string) {
  return queryOne(
    `
      select json_agg(t order by t.created_at asc) as runs
      from (
        select *
        from dfm_private.match_runs
        where run_type = 'daily'
          and status = 'running'
          and summary_json is null
          and coalesce(started_at, created_at) < $1::timestamptz
        order by created_at asc
      ) t
    `,
    [cutoffIso],
  );
}

export async function listPartialDailyRuns() {
  return queryOne(
    `
      select json_agg(t order by t.created_at asc) as runs
      from (
        select *
        from dfm_private.match_runs
        where run_type = 'daily'
          and status = 'partial'
        order by created_at asc
      ) t
    `,
    [],
  );
}

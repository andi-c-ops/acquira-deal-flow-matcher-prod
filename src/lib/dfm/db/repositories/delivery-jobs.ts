import { queryMany, queryOne } from "@/lib/dfm/db/client";
import type { JobStatus } from "@/lib/dfm/domain/types";

export interface InsertDeliveryJobInput {
  runId: string;
  aeThesisId: string;
  dealId: string;
  matchCandidateId?: string | null;
  clickupListId: string;
  dedupeKey: string;
}

export async function insertDeliveryJob(input: InsertDeliveryJobInput) {
  return queryOne(
    `
      insert into dfm_private.clickup_delivery_jobs (
        run_id,
        ae_thesis_id,
        deal_id,
        match_candidate_id,
        clickup_list_id,
        dedupe_key
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (dedupe_key)
      do update set
        run_id = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.run_id
          else excluded.run_id
        end,
        ae_thesis_id = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.ae_thesis_id
          else excluded.ae_thesis_id
        end,
        deal_id = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.deal_id
          else excluded.deal_id
        end,
        match_candidate_id = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.match_candidate_id
          else excluded.match_candidate_id
        end,
        clickup_list_id = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.clickup_list_id
          else excluded.clickup_list_id
        end,
        status = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.status
          else 'pending'::dfm_private.job_status
        end,
        next_attempt_at = case
          when dfm_private.clickup_delivery_jobs.sent_at is not null then dfm_private.clickup_delivery_jobs.next_attempt_at
          else now()
        end,
        claimed_by = null,
        claimed_at = null,
        last_error = null
      returning *
    `,
    [
      input.runId,
      input.aeThesisId,
      input.dealId,
      input.matchCandidateId ?? null,
      input.clickupListId,
      input.dedupeKey,
    ],
  );
}

export async function updateDeliveryJobStatus(
  jobId: string,
  status: JobStatus,
  patch?: Record<string, unknown>,
) {
  const nextAttemptAt = patch?.next_attempt_at ?? null;
  const claimedBy = patch?.claimed_by ?? null;
  const claimedAt = patch?.claimed_at ?? null;
  const sentAt = patch?.sent_at ?? null;
  const lastError = patch?.last_error ?? null;

  return queryOne(
    `
      update dfm_private.clickup_delivery_jobs
      set
        status = $2::dfm_private.job_status,
        next_attempt_at = coalesce($3::timestamptz, next_attempt_at),
        claimed_by = coalesce($4::text, claimed_by),
        claimed_at = coalesce($5::timestamptz, claimed_at),
        sent_at = coalesce($6::timestamptz, sent_at),
        last_error = coalesce($7::text, last_error),
        attempt_count = case
          when $2::text in ('processing', 'retry_scheduled', 'failed_terminal') then attempt_count + 1
          else attempt_count
        end
      where id = $1
      returning *
    `,
    [jobId, status, nextAttemptAt, claimedBy, claimedAt, sentAt, lastError],
  );
}

export async function listPendingDeliveryJobs(limit: number) {
  return queryMany(
    `
      select *
      from dfm_private.clickup_delivery_jobs
      where status in ('pending', 'retry_scheduled')
        and next_attempt_at <= now()
      order by created_at asc
      limit $1
    `,
    [limit],
  );
}

export async function getDeliveryJobById(jobId: string) {
  return queryOne(`select * from dfm_private.clickup_delivery_jobs where id = $1`, [jobId]);
}

export async function listDeliveryJobStatusCountsByRunId(runId: string) {
  return queryMany(
    `
      select status, count(*)::int as count
      from dfm_private.clickup_delivery_jobs
      where run_id = $1
      group by status
      order by status asc
    `,
    [runId],
  );
}

export async function getDeliveryJobIntegrityByRunId(runId: string) {
  return queryOne(
    `
      select
        count(j.id)::int as jobs,
        count(r.id)::int as receipts,
        count(distinct r.clickup_task_id)::int as distinct_task_ids,
        count(j.id) filter (where j.status <> 'sent')::int as non_sent
      from dfm_private.clickup_delivery_jobs j
      left join dfm_private.clickup_delivery_receipts r on r.job_id = j.id
      where j.run_id = $1
    `,
    [runId],
  );
}

export async function listDeliveredMatchRowsByRunId(runId: string) {
  return queryMany(
    `
      select
        ae.id as ae_thesis_id,
        ae.ae_name,
        ae.ae_email,
        ae.clickup_list_id,
        ae.delivery_min_match_quality,
        d.id as deal_id,
        d.business_name,
        d.location,
        d.state,
        d.price,
        d.ebitda,
        d.multiple,
        d.listing_url,
        c.score_pct,
        c.match_quality,
        c.criteria_details
      from dfm_private.clickup_delivery_jobs j
      join dfm_public.ae_theses ae on ae.id = j.ae_thesis_id
      join dfm_public.deals_normalized d on d.id = j.deal_id
      left join dfm_private.match_candidates c on c.id = j.match_candidate_id
      where j.run_id = $1
        and j.status = 'sent'
      order by ae.ae_name asc, c.score_pct desc nulls last, d.business_name asc
    `,
    [runId],
  );
}

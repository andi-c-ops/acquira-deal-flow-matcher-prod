import { queryOne } from "@/lib/dfm/db/client";

export interface UpsertMatchCandidateInput {
  aeThesisId: string;
  dealId: string;
  lastRunId: string;
  scorePct: number;
  matchQuality: string;
  criteriaDetails: Record<string, unknown>;
  deliveryEligible: boolean;
}

export async function upsertMatchCandidate(input: UpsertMatchCandidateInput) {
  return queryOne(
    `
      insert into dfm_private.match_candidates (
        ae_thesis_id,
        deal_id,
        last_run_id,
        score_pct,
        match_quality,
        criteria_details,
        delivery_eligible,
        last_evaluated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      on conflict (ae_thesis_id, deal_id)
      do update set
        last_run_id = excluded.last_run_id,
        score_pct = excluded.score_pct,
        match_quality = excluded.match_quality,
        criteria_details = excluded.criteria_details,
        delivery_eligible = excluded.delivery_eligible,
        last_evaluated_at = excluded.last_evaluated_at
      returning *
    `,
    [
      input.aeThesisId,
      input.dealId,
      input.lastRunId,
      input.scorePct,
      input.matchQuality,
      JSON.stringify(input.criteriaDetails),
      input.deliveryEligible,
      new Date().toISOString(),
    ],
  );
}

export async function getMatchCandidateById(candidateId: string) {
  return queryOne(`select * from dfm_private.match_candidates where id = $1`, [candidateId]);
}

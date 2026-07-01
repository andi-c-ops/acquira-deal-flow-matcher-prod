import { queryMany, queryOne } from "@/lib/dfm/db/client";

export interface InsertAeThesisVersionInput {
  aeThesisId: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  submittedAt: string;
  normalizationVersion: string;
}

export async function insertAeThesisVersion(input: InsertAeThesisVersionInput) {
  return queryOne(
    `
      insert into dfm_private.ae_thesis_versions (
        ae_thesis_id,
        raw_payload,
        normalized_payload,
        submitted_at,
        is_current,
        normalization_version
      )
      values ($1, $2::jsonb, $3::jsonb, $4, true, $5)
      returning *
    `,
    [
      input.aeThesisId,
      JSON.stringify(input.rawPayload),
      JSON.stringify(input.normalizedPayload),
      input.submittedAt,
      input.normalizationVersion,
    ],
  );
}

export async function clearCurrentAeThesisVersions(aeThesisId: string) {
  return queryMany(
    `
      update dfm_private.ae_thesis_versions
      set is_current = false
      where ae_thesis_id = $1 and is_current = true
      returning *
    `,
    [aeThesisId],
  );
}

export async function listCurrentAeThesisVersions(aeThesisIds: string[]) {
  if (aeThesisIds.length === 0) {
    return { data: [], error: null };
  }

  return queryMany(
    `
      select *
      from dfm_private.ae_thesis_versions
      where ae_thesis_id = any($1::uuid[])
        and is_current = true
    `,
    [aeThesisIds],
  );
}

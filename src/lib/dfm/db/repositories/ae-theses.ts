import { queryMany, queryOne } from "@/lib/dfm/db/client";

export interface UpsertAeThesisInput {
  externalSubmissionKey: string;
  aeName: string;
  aeEmail?: string | null;
  clickupListId?: string | null;
  submittedAt?: string | null;
}

export async function findActiveAeThesisByEmail(aeEmail?: string | null) {
  const normalizedEmail = aeEmail?.trim() ?? "";
  if (!normalizedEmail) {
    return { data: null, error: null };
  }

  return queryOne(
    `
      select *
      from dfm_public.ae_theses
      where status = 'active'::dfm_private.ae_status
        and lower(btrim(coalesce(ae_email, ''))) = lower(btrim($1))
      order by
        (nullif(btrim(clickup_list_id), '') is not null) desc,
        (delivery_min_match_quality = 'Strong') desc,
        updated_at desc
      limit 1
    `,
    [normalizedEmail],
  );
}

export async function refreshAeThesisSubmission(
  aeThesisId: string,
  input: Pick<UpsertAeThesisInput, "aeName" | "aeEmail" | "submittedAt">,
) {
  return queryOne(
    `
      update dfm_public.ae_theses
      set
        ae_name = $2,
        ae_email = coalesce(nullif(btrim($3), ''), ae_email),
        first_submitted_at = coalesce(first_submitted_at, $4::timestamptz),
        last_submitted_at = $4::timestamptz
      where id = $1
        and status = 'active'::dfm_private.ae_status
      returning *
    `,
    [aeThesisId, input.aeName, input.aeEmail ?? null, input.submittedAt ?? null],
  );
}

export async function upsertAeThesis(input: UpsertAeThesisInput) {
  return queryOne(
    `
      insert into dfm_public.ae_theses (
        external_submission_key,
        ae_name,
        ae_email,
        clickup_list_id,
        first_submitted_at,
        last_submitted_at
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (external_submission_key)
      do update set
        ae_name = excluded.ae_name,
        ae_email = excluded.ae_email,
        clickup_list_id = coalesce(excluded.clickup_list_id, dfm_public.ae_theses.clickup_list_id),
        first_submitted_at = coalesce(dfm_public.ae_theses.first_submitted_at, excluded.first_submitted_at),
        last_submitted_at = excluded.last_submitted_at
      returning *
    `,
    [
      input.externalSubmissionKey,
      input.aeName,
      input.aeEmail ?? null,
      input.clickupListId ?? null,
      input.submittedAt ?? null,
      input.submittedAt ?? null,
    ],
  );
}

export async function listActiveAeTheses() {
  return queryMany(`select * from dfm_public.ae_theses where status = 'active' order by created_at asc`);
}

export async function getAeThesisById(aeThesisId: string) {
  return queryOne(`select * from dfm_public.ae_theses where id = $1`, [aeThesisId]);
}

export async function updateAeLatestVersion(aeThesisId: string, latestVersionId: string) {
  return queryOne(
    `update dfm_public.ae_theses set latest_version_id = $2 where id = $1 returning *`,
    [aeThesisId, latestVersionId],
  );
}

export async function updateAeClickupListId(aeThesisId: string, clickupListId: string) {
  return queryOne(
    `update dfm_public.ae_theses set clickup_list_id = $2 where id = $1 returning *`,
    [aeThesisId, clickupListId],
  );
}

export async function updateAeDeliveryMinMatchQuality(
  aeThesisId: string,
  deliveryMinMatchQuality: "Strong" | "Moderate",
) {
  return queryOne(
    `update dfm_public.ae_theses set delivery_min_match_quality = $2 where id = $1 returning *`,
    [aeThesisId, deliveryMinMatchQuality],
  );
}

export async function archiveAeThesis(aeThesisId: string) {
  return queryOne(
    `
      update dfm_public.ae_theses
      set status = 'archived'::dfm_private.ae_status
      where id = $1
        and status = 'active'::dfm_private.ae_status
      returning *
    `,
    [aeThesisId],
  );
}

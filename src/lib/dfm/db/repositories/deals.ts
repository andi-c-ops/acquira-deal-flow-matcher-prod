import { queryMany, queryOne } from "@/lib/dfm/db/client";

export interface InsertRawDealInput {
  airtableRecordId: string;
  sourceHash: string;
  rawPayload: Record<string, unknown>;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
}

export async function insertRawDealSnapshot(input: InsertRawDealInput) {
  return queryOne(
    `
      insert into dfm_private.deals_raw (
        airtable_record_id,
        source_hash,
        raw_payload,
        source_created_at,
        source_updated_at
      )
      values ($1, $2, $3::jsonb, $4, $5)
      on conflict (airtable_record_id, source_hash)
      do update set
        raw_payload = excluded.raw_payload,
        source_created_at = excluded.source_created_at,
        source_updated_at = excluded.source_updated_at
      returning *
    `,
    [
      input.airtableRecordId,
      input.sourceHash,
      JSON.stringify(input.rawPayload),
      input.sourceCreatedAt ?? null,
      input.sourceUpdatedAt ?? null,
    ],
  );
}

export async function listActiveNormalizedDeals() {
  return queryMany(
    `select * from dfm_public.deals_normalized where is_active = true order by updated_at desc`,
  );
}

export async function getNormalizedDealById(dealId: string) {
  return queryOne(`select * from dfm_public.deals_normalized where id = $1`, [dealId]);
}

export interface UpsertNormalizedDealInput {
  airtableRecordId: string;
  currentRawId: string;
  businessName: string;
  industry?: string | null;
  location?: string | null;
  state?: string | null;
  price?: number | null;
  ebitda?: number | null;
  multiple?: number | null;
  listingUrl?: string | null;
  description?: string | null;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
}

export async function upsertNormalizedDeal(input: UpsertNormalizedDealInput) {
  return queryOne(
    `
      insert into dfm_public.deals_normalized (
        airtable_record_id,
        current_raw_id,
        business_name,
        industry,
        location,
        state,
        price,
        ebitda,
        multiple,
        listing_url,
        description,
        source_created_at,
        source_updated_at,
        is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
      on conflict (airtable_record_id)
      do update set
        current_raw_id = excluded.current_raw_id,
        business_name = excluded.business_name,
        industry = excluded.industry,
        location = excluded.location,
        state = excluded.state,
        price = excluded.price,
        ebitda = excluded.ebitda,
        multiple = excluded.multiple,
        listing_url = excluded.listing_url,
        description = excluded.description,
        source_created_at = excluded.source_created_at,
        source_updated_at = excluded.source_updated_at,
        is_active = true
      returning *
    `,
    [
      input.airtableRecordId,
      input.currentRawId,
      input.businessName,
      input.industry ?? null,
      input.location ?? null,
      input.state ?? null,
      input.price ?? null,
      input.ebitda ?? null,
      input.multiple ?? null,
      input.listingUrl ?? null,
      input.description ?? null,
      input.sourceCreatedAt ?? null,
      input.sourceUpdatedAt ?? null,
    ],
  );
}

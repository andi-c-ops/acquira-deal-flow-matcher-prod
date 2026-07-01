import type { NormalizedDeal } from "@/lib/dfm/domain/types";
import type { AirtableDealSourceRecord } from "@/lib/dfm/providers/airtable-client";

export function normalizeDeal(record: AirtableDealSourceRecord): NormalizedDeal {
  return {
    airtableRecordId: record.airtableRecordId,
    businessName: record.title,
    industry: record.industry ?? null,
    location: record.location ?? null,
    state: record.state ?? null,
    price: record.price ?? null,
    ebitda: record.ebitda ?? null,
    multiple: record.multiple ?? null,
    listingUrl: record.listingUrl ?? null,
    description: record.description ?? null,
    sourceCreatedAt: record.sourceCreatedAt ?? null,
    sourceUpdatedAt: record.sourceUpdatedAt ?? null,
  };
}

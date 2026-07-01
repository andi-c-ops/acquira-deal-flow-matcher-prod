import { getEnv } from "@/lib/dfm/config/env";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

export interface AirtableDealSourceRecord {
  airtableRecordId: string;
  title: string;
  industry?: string | null;
  location?: string | null;
  state?: string | null;
  price?: number | null;
  ebitda?: number | null;
  multiple?: number | null;
  description?: string | null;
  listingUrl?: string | null;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
  rawPayload: Record<string, unknown>;
}

export interface FetchDealsInput {
  cursorStart: string;
  cursorEnd: string;
}

interface AirtableListResponse {
  records?: Array<{
    id: string;
    createdTime?: string;
    fields?: Record<string, unknown>;
  }>;
  offset?: string;
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[$,]/g, "").trim();
  if (cleaned === "") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAirtableRecord(record: {
  id: string;
  createdTime?: string;
  fields?: Record<string, unknown>;
}): AirtableDealSourceRecord {
  const fields = record.fields ?? {};
  return {
    airtableRecordId: record.id,
    title: typeof fields.Title === "string" ? fields.Title : "Untitled Deal",
    industry: typeof fields.Industry === "string" ? fields.Industry : null,
    location: typeof fields.Location === "string" ? fields.Location : null,
    state: typeof fields.State === "string" ? fields.State : null,
    price: parseNumericField(fields["Asking Price [Formatted]"]) ?? parseNumericField(fields["Asking Price"]),
    ebitda: parseNumericField(fields["Cash Flow [Formatted]"]) ?? parseNumericField(fields["Cash Flow"]),
    multiple: parseNumericField(fields.Multiple),
    description:
      typeof fields["Business Description"] === "string" ? fields["Business Description"] : null,
    listingUrl:
      typeof fields.Link === "string"
        ? fields.Link
        : typeof fields.URL === "string"
          ? fields.URL
          : null,
    sourceCreatedAt: record.createdTime ?? null,
    sourceUpdatedAt: typeof fields["Last Modified"] === "string" ? fields["Last Modified"] : record.createdTime ?? null,
    rawPayload: {
      id: record.id,
      createdTime: record.createdTime,
      fields,
    },
  };
}

export async function fetchDealsInWindow(input: FetchDealsInput): Promise<AirtableDealSourceRecord[]> {
  const env = getEnv();
  const records: AirtableDealSourceRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_ID)}`,
    );
    url.searchParams.set("pageSize", "100");
    if (env.AIRTABLE_VIEW_ID) {
      url.searchParams.set("view", env.AIRTABLE_VIEW_ID);
    }
    url.searchParams.set(
      "filterByFormula",
      `AND(IS_AFTER(CREATED_TIME(), '${input.cursorStart}'), IS_BEFORE(CREATED_TIME(), '${input.cursorEnd}'))`,
    );
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      },
    }, 20_000);

    if (!response.ok) {
      throw new Error(`Airtable fetch failed with status ${response.status}`);
    }

    const data = (await response.json()) as AirtableListResponse;
    for (const record of data.records ?? []) {
      records.push(normalizeAirtableRecord(record));
    }
    offset = data.offset;
  } while (offset);

  return records;
}

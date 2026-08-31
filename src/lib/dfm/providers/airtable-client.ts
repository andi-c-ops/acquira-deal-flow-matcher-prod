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

export interface CountDealsInput extends FetchDealsInput {
  stopAfter?: number;
}

interface AirtableListResponse {
  records?: Array<{
    id: string;
    createdTime?: string;
    fields?: Record<string, unknown>;
  }>;
  offset?: string;
}

const AIRTABLE_MAX_ATTEMPTS = 3;

// Retrying every page independently could add minutes of pure waiting to a
// large catch-up run and push the route past its 300s ceiling. A shared budget
// across one pagination loop absorbs an isolated blip without letting a broadly
// unhealthy Airtable turn a failure into a timeout.
const AIRTABLE_MAX_RETRIES_PER_CALL = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAirtableStatus(status: number) {
  return status === 429 || status >= 500;
}

/**
 * True for a thrown transport failure rather than an HTTP response, which is
 * what `fetchWithTimeout` raises when it aborts. The 2026-08-30 daily run died
 * on exactly this ("Request timed out after 20000ms") because a single page
 * fetch had no retry at all.
 */
export function isTransientAirtableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // An error that names an HTTP status describes a response the server
  // actually sent, so it is decided by status rather than treated as a
  // transport failure. This check must come first: this module's own
  // "Airtable fetch failed with status 401" contains the substring
  // "fetch failed", which is undici's transport-level message.
  if (/with status \d{3}/i.test(error.message)) {
    return false;
  }

  return /timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network/i.test(
    error.message,
  );
}

interface AirtableRetryBudget {
  remaining: number;
}

async function fetchAirtablePageWithRetry(
  url: URL,
  headers: Record<string, string>,
  label: string,
  budget: AirtableRetryBudget,
): Promise<Response> {
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= AIRTABLE_MAX_ATTEMPTS; attempt += 1) {
    const isLastAttempt = attempt === AIRTABLE_MAX_ATTEMPTS || budget.remaining <= 0;

    try {
      const response = await fetchWithTimeout(url, { headers }, 20_000);
      if (response.ok || !isRetryableAirtableStatus(response.status) || isLastAttempt) {
        return response;
      }
      lastStatus = response.status;
      lastError = null;
    } catch (error) {
      if (!isTransientAirtableError(error) || isLastAttempt) {
        throw error;
      }
      lastError = error;
      lastStatus = null;
    }

    budget.remaining -= 1;
    await sleep(500 * attempt);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(
    `${label} failed after retry exhaustion${lastStatus ? ` with status ${lastStatus}` : ""}`,
  );
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
  const retryBudget: AirtableRetryBudget = { remaining: AIRTABLE_MAX_RETRIES_PER_CALL };
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

    const response = await fetchAirtablePageWithRetry(
      url,
      { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
      "Airtable fetch",
      retryBudget,
    );

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

export async function countDealsInWindow(input: CountDealsInput): Promise<number> {
  const env = getEnv();
  let count = 0;
  const retryBudget: AirtableRetryBudget = { remaining: AIRTABLE_MAX_RETRIES_PER_CALL };
  let offset: string | undefined;
  const stopAfter = input.stopAfter ?? Number.POSITIVE_INFINITY;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_ID)}`,
    );
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Title");
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

    const response = await fetchAirtablePageWithRetry(
      url,
      { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
      "Airtable count",
      retryBudget,
    );

    if (!response.ok) {
      throw new Error(`Airtable count failed with status ${response.status}`);
    }

    const data = (await response.json()) as AirtableListResponse;
    count += data.records?.length ?? 0;
    if (count >= stopAfter) {
      return count;
    }
    offset = data.offset;
  } while (offset);

  return count;
}

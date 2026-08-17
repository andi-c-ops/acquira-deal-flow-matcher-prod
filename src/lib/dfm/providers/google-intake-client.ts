import { getEnv } from "@/lib/dfm/config/env";
import { getGoogleSheetsAccessToken } from "@/lib/dfm/providers/google-oauth";
import { parseTimestampToIso } from "@/lib/dfm/utils/dates";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

export interface GoogleSubmissionRecord {
  submissionKey: string;
  submittedAt: string;
  payload: Record<string, unknown>;
}

export interface GoogleSubmissionFetchDiagnostics {
  sheetConfigured: boolean;
  sheetIdConfigured: boolean;
  range: string | null;
  rawRowsRead: number;
  dataRowsRead: number;
  parsedRows: number;
  rowsAfterCursor: number;
  headerCount: number;
  headersPresent: string[];
  timestampHeaderPresent: boolean;
  firstParsedTimestamp: string | null;
  lastParsedTimestamp: string | null;
  cursorTimestamp: string | null;
}

export interface GoogleSubmissionFetchResult {
  submissions: GoogleSubmissionRecord[];
  diagnostics: GoogleSubmissionFetchDiagnostics;
}

interface GoogleSheetValuesResponse {
  values?: string[][];
}

const GOOGLE_SHEETS_MAX_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGoogleSheetsStatus(status: number) {
  return status === 429 || status >= 500;
}

async function fetchGoogleSheetsWithRetry(url: URL, headers: Record<string, string>) {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= GOOGLE_SHEETS_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetchWithTimeout(url, { headers }, 20_000);
    if (response.ok || !isRetryableGoogleSheetsStatus(response.status) || attempt === GOOGLE_SHEETS_MAX_ATTEMPTS) {
      return response;
    }

    lastStatus = response.status;
    // Bounded retries recover temporary Google availability errors without risking the cron timeout.
    await sleep(500 * attempt);
  }

  throw new Error(`Google Sheets fetch failed after retry exhaustion${lastStatus ? ` with status ${lastStatus}` : ""}`);
}

function rowToPayload(headers: string[], row: string[]) {
  const payload: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    payload[header] = row[index] ?? "";
  });
  return payload;
}

function buildSubmissionKey(payload: Record<string, unknown>, submittedAt: string) {
  const name =
    typeof payload["Your Full Name"] === "string"
      ? payload["Your Full Name"]
      : typeof payload["Your Full Name:"] === "string"
        ? payload["Your Full Name:"]
        : typeof payload["Your Full Name:  "] === "string"
          ? payload["Your Full Name:  "]
      : typeof payload.aeName === "string"
        ? payload.aeName
        : "unknown";
  const email =
    typeof payload["Your Email"] === "string"
      ? payload["Your Email"]
      : typeof payload["Your Email:"] === "string"
        ? payload["Your Email:"]
        : typeof payload["Email Address"] === "string"
          ? payload["Email Address"]
      : typeof payload.aeEmail === "string"
        ? payload.aeEmail
        : "unknown";
  return `${submittedAt}:${name}:${email}`;
}

export async function fetchNewAeSubmissionsSince(cursorTimestamp?: string | null) {
  const result = await fetchNewAeSubmissionWindow(cursorTimestamp);
  return result.submissions;
}

export async function fetchNewAeSubmissionWindow(
  cursorTimestamp?: string | null,
): Promise<GoogleSubmissionFetchResult> {
  const env = getEnv();
  const range = env.GOOGLE_SHEET_RANGE ?? "Form Responses 1";
  const baseDiagnostics: GoogleSubmissionFetchDiagnostics = {
    sheetConfigured: Boolean(env.GOOGLE_SHEET_ID),
    sheetIdConfigured: Boolean(env.GOOGLE_SHEET_ID),
    range: env.GOOGLE_SHEET_ID ? range : null,
    rawRowsRead: 0,
    dataRowsRead: 0,
    parsedRows: 0,
    rowsAfterCursor: 0,
    headerCount: 0,
    headersPresent: [],
    timestampHeaderPresent: false,
    firstParsedTimestamp: null,
    lastParsedTimestamp: null,
    cursorTimestamp: cursorTimestamp ?? null,
  };

  if (!env.GOOGLE_SHEET_ID) {
    return {
      submissions: [],
      diagnostics: baseDiagnostics,
    };
  }

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}`,
  );

  const requestHeaders: Record<string, string> = {};
  if (env.GOOGLE_API_KEY) {
    url.searchParams.set("key", env.GOOGLE_API_KEY);
  } else {
    requestHeaders.Authorization = `Bearer ${await getGoogleSheetsAccessToken()}`;
  }

  const response = await fetchGoogleSheetsWithRetry(url, requestHeaders);
  if (!response.ok) {
    throw new Error(`Google Sheets fetch failed with status ${response.status}`);
  }

  const data = (await response.json()) as GoogleSheetValuesResponse;
  const [sheetHeaders = [], ...rows] = data.values ?? [];
  const parsedRows = rows
    .map((row) => {
      const payload = rowToPayload(sheetHeaders, row);
      const rawSubmittedAt =
        typeof payload.Timestamp === "string"
          ? payload.Timestamp
          : typeof payload.timestamp === "string"
            ? payload.timestamp
            : "";
      const submittedAt = parseTimestampToIso(rawSubmittedAt);

      return {
        submissionKey: buildSubmissionKey(payload, submittedAt ?? rawSubmittedAt),
        submittedAt: submittedAt ?? "",
        payload,
      };
    })
    .filter((row) => row.submittedAt !== "")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const submissions = parsedRows.filter((row) => !cursorTimestamp || row.submittedAt > cursorTimestamp);

  return {
    submissions,
    diagnostics: {
      ...baseDiagnostics,
      rawRowsRead: data.values?.length ?? 0,
      dataRowsRead: rows.length,
      parsedRows: parsedRows.length,
      rowsAfterCursor: submissions.length,
      headerCount: sheetHeaders.length,
      headersPresent: sheetHeaders.slice(0, 12),
      timestampHeaderPresent: sheetHeaders.some((header) => header === "Timestamp" || header === "timestamp"),
      firstParsedTimestamp: parsedRows[0]?.submittedAt ?? null,
      lastParsedTimestamp: parsedRows.at(-1)?.submittedAt ?? null,
    },
  };
}

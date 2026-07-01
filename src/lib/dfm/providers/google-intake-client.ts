import { getEnv } from "@/lib/dfm/config/env";
import { getGoogleSheetsAccessToken } from "@/lib/dfm/providers/google-oauth";
import { parseTimestampToIso } from "@/lib/dfm/utils/dates";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

export interface GoogleSubmissionRecord {
  submissionKey: string;
  submittedAt: string;
  payload: Record<string, unknown>;
}

interface GoogleSheetValuesResponse {
  values?: string[][];
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
      : typeof payload.aeName === "string"
        ? payload.aeName
        : "unknown";
  const email =
    typeof payload["Your Email"] === "string"
      ? payload["Your Email"]
      : typeof payload.aeEmail === "string"
        ? payload.aeEmail
        : "unknown";
  return `${submittedAt}:${name}:${email}`;
}

export async function fetchNewAeSubmissionsSince(cursorTimestamp?: string | null) {
  const env = getEnv();
  if (!env.GOOGLE_SHEET_ID) {
    return [] as GoogleSubmissionRecord[];
  }

  const range = env.GOOGLE_SHEET_RANGE ?? "Form Responses 1";
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}`,
  );

  const requestHeaders: Record<string, string> = {};
  if (env.GOOGLE_API_KEY) {
    url.searchParams.set("key", env.GOOGLE_API_KEY);
  } else {
    requestHeaders.Authorization = `Bearer ${await getGoogleSheetsAccessToken()}`;
  }

  const response = await fetchWithTimeout(url, { headers: requestHeaders }, 20_000);
  if (!response.ok) {
    throw new Error(`Google Sheets fetch failed with status ${response.status}`);
  }

  const data = (await response.json()) as GoogleSheetValuesResponse;
  const [sheetHeaders = [], ...rows] = data.values ?? [];

  return rows
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
    .filter((row) => !cursorTimestamp || row.submittedAt > cursorTimestamp)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export type DeliveryFailureDisposition = "retry" | "terminal";

export interface DeliveryFailureClassification {
  disposition: DeliveryFailureDisposition;
  reason: string;
  retryDelayMs?: number;
}

const RETRY_DELAY_MS = 5 * 60 * 1000;

// Provider clients throw messages shaped like
// "ClickUp task creation failed with status 429", so the explicit status
// phrase is the most reliable signal. A bare 4xx/5xx token is the fallback.
// Word boundaries keep long numeric ClickUp list and task ids from being
// mistaken for status codes.
const EXPLICIT_STATUS_PATTERN = /\bstatus\s+(\d{3})\b/i;
const BARE_STATUS_PATTERN = /\b([45]\d{2})\b/;

// Transient network and socket failures never carry an HTTP status.
const TRANSIENT_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /etimedout/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /socket hang up/i,
  /fetch failed/i,
  /network/i,
];

const TERMINAL_PATTERNS = [/unauthorized/i, /forbidden/i, /missing/i, /invalid/i, /is required/i];

// Statuses that represent a temporary condition rather than a bad request.
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);

export function extractHttpStatus(message: string): number | null {
  const explicit = EXPLICIT_STATUS_PATTERN.exec(message);
  if (explicit) {
    return Number(explicit[1]);
  }

  const bare = BARE_STATUS_PATTERN.exec(message);
  return bare ? Number(bare[1]) : null;
}

export function classifyDeliveryFailure(error: unknown): DeliveryFailureClassification {
  const message = error instanceof Error ? error.message : "Unknown delivery failure";
  const status = extractHttpStatus(message);

  if (status !== null) {
    if (status >= 500 || RETRYABLE_STATUSES.has(status)) {
      return { disposition: "retry", reason: message, retryDelayMs: RETRY_DELAY_MS };
    }

    // Every other 4xx is a request the provider will reject the same way
    // on every future attempt, so retrying only stalls the delivery queue.
    if (status >= 400) {
      return { disposition: "terminal", reason: message };
    }
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { disposition: "retry", reason: message, retryDelayMs: RETRY_DELAY_MS };
  }

  if (TERMINAL_PATTERNS.some((pattern) => pattern.test(message))) {
    return { disposition: "terminal", reason: message };
  }

  return { disposition: "retry", reason: message, retryDelayMs: RETRY_DELAY_MS };
}

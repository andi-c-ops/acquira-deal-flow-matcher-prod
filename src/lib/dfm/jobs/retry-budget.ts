// The delivery jobs table has always carried `attempt_count` and
// `max_attempts`, but nothing read them. Without a ceiling a job that can
// never succeed is retried forever, the owning daily run stays `partial`, and
// the Airtable cursor never advances. These helpers make the existing columns
// authoritative so an unrecoverable job fails loudly instead of stalling the
// queue.

export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 6;

export function readAttemptCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function readMaxAttempts(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_MAX_DELIVERY_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_DELIVERY_ATTEMPTS;
}

/**
 * True when the job has already used its whole retry budget and must not be
 * handed to the provider again. Checked before claiming so rows left over the
 * ceiling by earlier behaviour are escalated instead of silently skipped.
 */
export function isRetryBudgetExhausted(job: {
  attempt_count?: unknown;
  max_attempts?: unknown;
}): boolean {
  return readAttemptCount(job.attempt_count) >= readMaxAttempts(job.max_attempts);
}

/**
 * True when the attempt that just failed was the last one allowed. The claim
 * for this attempt has already incremented `attempt_count`, so the count read
 * off the pre-claim row is one short of the attempts now used.
 */
export function isFinalAttempt(job: {
  attempt_count?: unknown;
  max_attempts?: unknown;
}): boolean {
  return readAttemptCount(job.attempt_count) + 1 >= readMaxAttempts(job.max_attempts);
}

export function describeExhaustedBudget(used: number, allowed: number, reason: string): string {
  return `Retry budget exhausted after ${used} of ${allowed} attempts: ${reason}`;
}

/** Message for a job that was already over the ceiling before this pass claimed it. */
export function describeAlreadyExhaustedBudget(
  job: { attempt_count?: unknown; max_attempts?: unknown; last_error?: unknown },
): string {
  const reason =
    typeof job.last_error === "string" && job.last_error.length > 0
      ? job.last_error
      : "no successful ClickUp delivery";
  return describeExhaustedBudget(
    readAttemptCount(job.attempt_count),
    readMaxAttempts(job.max_attempts),
    reason,
  );
}

/** Message for the attempt that just failed and used the last of the budget. */
export function describeFinalAttemptFailure(
  job: { attempt_count?: unknown; max_attempts?: unknown },
  reason: string,
): string {
  return describeExhaustedBudget(
    readAttemptCount(job.attempt_count) + 1,
    readMaxAttempts(job.max_attempts),
    reason,
  );
}

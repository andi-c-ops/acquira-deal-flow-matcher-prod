import assert from "node:assert/strict";
import test from "node:test";

import { classifyDeliveryFailure, extractHttpStatus } from "@/lib/dfm/jobs/classify-delivery-failure";
import {
  describeAlreadyExhaustedBudget,
  describeFinalAttemptFailure,
  isFinalAttempt,
  isRetryBudgetExhausted,
  readMaxAttempts,
} from "@/lib/dfm/jobs/retry-budget";

test("does not mistake a numeric ClickUp list id for a 5xx status", () => {
  // The previous check was message.includes("5"), so this authorization
  // failure was classified retryable and looped forever.
  const classification = classifyDeliveryFailure(
    new Error("ClickUp task creation failed with status 401 for list 901500123456"),
  );

  assert.equal(classification.disposition, "terminal");
});

test("classifies real server and rate-limit statuses as retryable", () => {
  for (const status of [500, 502, 503, 504, 429, 408]) {
    const classification = classifyDeliveryFailure(
      new Error(`ClickUp task creation failed with status ${status}`),
    );
    assert.equal(classification.disposition, "retry", `status ${status} should retry`);
    assert.equal(classification.retryDelayMs, 5 * 60 * 1000);
  }
});

test("classifies non-retryable client statuses as terminal", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const classification = classifyDeliveryFailure(
      new Error(`ClickUp task creation failed with status ${status}`),
    );
    assert.equal(classification.disposition, "terminal", `status ${status} should be terminal`);
  }
});

test("treats network and timeout failures without a status as retryable", () => {
  for (const message of [
    "Request timed out after 30000ms",
    "fetch failed",
    "socket hang up",
    "getaddrinfo ENOTFOUND api.clickup.com",
  ]) {
    assert.equal(classifyDeliveryFailure(new Error(message)).disposition, "retry", message);
  }
});

test("treats configuration failures as terminal", () => {
  assert.equal(
    classifyDeliveryFailure(new Error("CLICKUP_API_KEY is required for live ClickUp task creation"))
      .disposition,
    "terminal",
  );
});

test("extractHttpStatus prefers the explicit status phrase over other digits", () => {
  assert.equal(
    extractHttpStatus("ClickUp custom field update failed for field 404 with status 503"),
    503,
  );
  assert.equal(extractHttpStatus("no status here"), null);
  assert.equal(extractHttpStatus("deal 901500123456 was rejected"), null);
});

test("retry budget stops an unrecoverable job instead of looping forever", () => {
  assert.equal(isRetryBudgetExhausted({ attempt_count: 6, max_attempts: 6 }), true);
  assert.equal(isRetryBudgetExhausted({ attempt_count: 7, max_attempts: 6 }), true);
  assert.equal(isRetryBudgetExhausted({ attempt_count: 5, max_attempts: 6 }), false);
  assert.equal(isRetryBudgetExhausted({ attempt_count: 0, max_attempts: 6 }), false);
});

test("the claim for the current attempt is counted when testing the final attempt", () => {
  // attempt_count is read before the claim increments it, so 5 of 6 used
  // means this pass is the sixth and last.
  assert.equal(isFinalAttempt({ attempt_count: 5, max_attempts: 6 }), true);
  assert.equal(isFinalAttempt({ attempt_count: 4, max_attempts: 6 }), false);
});

test("retry budget falls back to a safe ceiling for missing or invalid values", () => {
  assert.equal(readMaxAttempts(undefined), 6);
  assert.equal(readMaxAttempts(null), 6);
  assert.equal(readMaxAttempts(0), 6);
  assert.equal(readMaxAttempts("not a number"), 6);
  assert.equal(readMaxAttempts("3"), 3);
  assert.equal(isRetryBudgetExhausted({ attempt_count: 6 }), true);
});

test("exhausted budget messages report attempts used and preserve the cause", () => {
  assert.match(
    describeFinalAttemptFailure(
      { attempt_count: 5, max_attempts: 6 },
      "ClickUp task creation failed with status 503",
    ),
    /exhausted after 6 of 6 attempts: ClickUp task creation failed with status 503/,
  );
  assert.match(
    describeAlreadyExhaustedBudget({ attempt_count: 6, max_attempts: 6, last_error: "boom" }),
    /exhausted after 6 of 6 attempts: boom/,
  );
  assert.match(
    describeAlreadyExhaustedBudget({ attempt_count: 6, max_attempts: 6 }),
    /no successful ClickUp delivery/,
  );
});

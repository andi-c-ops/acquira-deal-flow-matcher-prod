import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesBearerSecret,
  matchesConfiguredSecret,
} from "../../src/lib/dfm/auth/secret-rollover";
import { verifyOperatorSecret } from "../../src/lib/dfm/auth/verify-operator-secret";
import { parseDfmEnv } from "../../src/lib/dfm/config/env";

test("accepts the current configured secret", () => {
  assert.equal(matchesConfiguredSecret("current-value", "current-value", undefined), true);
});

test("accepts the staged next secret", () => {
  assert.equal(matchesConfiguredSecret("next-value", "current-value", "next-value"), true);
});

test("rejects unrelated, missing, and blank candidates", () => {
  assert.equal(matchesConfiguredSecret("unrelated", "current-value", "next-value"), false);
  assert.equal(matchesConfiguredSecret(undefined, "current-value", "next-value"), false);
  assert.equal(matchesConfiguredSecret(null, "current-value", "next-value"), false);
  assert.equal(matchesConfiguredSecret("", "current-value", "next-value"), false);
});

test("fails closed when configured secrets are absent or blank", () => {
  assert.equal(matchesConfiguredSecret("undefined", undefined, undefined), false);
  assert.equal(matchesConfiguredSecret("candidate", "", ""), false);
});

test("accepts current and next bearer secrets with the existing exact format", () => {
  assert.equal(matchesBearerSecret("Bearer current-value", "current-value", "next-value"), true);
  assert.equal(matchesBearerSecret("Bearer next-value", "current-value", "next-value"), true);
});

test("rejects missing-secret bypass and malformed bearer headers", () => {
  assert.equal(matchesBearerSecret("Bearer undefined", undefined, undefined), false);
  assert.equal(matchesBearerSecret("bearer current-value", "current-value", undefined), false);
  assert.equal(matchesBearerSecret("Bearer  current-value", "current-value", undefined), false);
  assert.equal(matchesBearerSecret("current-value", "current-value", undefined), false);
  assert.equal(matchesBearerSecret(null, "current-value", undefined), false);
});

test("does not normalize secret whitespace", () => {
  assert.equal(matchesConfiguredSecret(" current-value", "current-value", undefined), false);
  assert.equal(matchesConfiguredSecret("current-value", " current-value", undefined), false);
});

test("blank optional next values parse as not staged", () => {
  const env = parseDfmEnv({
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "test-base",
    AIRTABLE_TABLE_ID: "test-table",
    CRON_SECRET: "cron-current",
    CRON_SECRET_NEXT: "",
    DFM_INTERNAL_SECRET: "internal-current",
    DFM_INTERNAL_SECRET_NEXT: "",
    DFM_EVENT_SECRET: "event-current",
    DFM_EVENT_SECRET_NEXT: "",
  });

  assert.equal(env.CRON_SECRET_NEXT, undefined);
  assert.equal(env.DFM_INTERNAL_SECRET_NEXT, undefined);
  assert.equal(env.DFM_EVENT_SECRET_NEXT, undefined);
});

test("operator login and cookie policy accepts overlap and fails closed", () => {
  const overlap = {
    DFM_INTERNAL_SECRET: "internal-current",
    DFM_INTERNAL_SECRET_NEXT: "internal-next",
  };

  assert.equal(verifyOperatorSecret("internal-current", overlap), true);
  assert.equal(verifyOperatorSecret("internal-next", overlap), true);
  assert.equal(verifyOperatorSecret("unrelated", overlap), false);
  assert.equal(
    verifyOperatorSecret(undefined, {
      DFM_INTERNAL_SECRET: undefined,
      DFM_INTERNAL_SECRET_NEXT: undefined,
    }),
    false,
  );
});

test("cron, internal, and event guards use current-plus-next rollover", async () => {
  process.env.AIRTABLE_API_KEY = "test-airtable-key";
  process.env.AIRTABLE_BASE_ID = "test-base";
  process.env.AIRTABLE_TABLE_ID = "test-table";
  process.env.CRON_SECRET = "cron-current";
  process.env.CRON_SECRET_NEXT = "cron-next";
  process.env.DFM_INTERNAL_SECRET = "internal-current";
  process.env.DFM_INTERNAL_SECRET_NEXT = "internal-next";
  process.env.DFM_EVENT_SECRET = "event-current";
  process.env.DFM_EVENT_SECRET_NEXT = "event-next";

  const [{ verifyCronRequest }, { verifyInternalRequest }, { verifyEventSignature }] =
    await Promise.all([
      import("../../src/lib/dfm/auth/verify-cron"),
      import("../../src/lib/dfm/auth/verify-internal-request"),
      import("../../src/lib/dfm/auth/verify-event-signature"),
    ]);

  for (const value of ["cron-current", "cron-next"]) {
    assert.equal(
      verifyCronRequest(new Request("https://example.test", {
        headers: { authorization: `Bearer ${value}` },
      })),
      true,
    );
  }

  for (const value of ["internal-current", "internal-next"]) {
    assert.equal(
      verifyInternalRequest(new Request("https://example.test", {
        headers: { authorization: `Bearer ${value}` },
      })),
      true,
    );
  }

  for (const value of ["event-current", "event-next"]) {
    assert.equal(
      verifyEventSignature(new Request("https://example.test", {
        headers: { "x-dfm-event-secret": value },
      })),
      true,
    );
  }

  assert.equal(
    verifyCronRequest(new Request("https://example.test", {
      headers: { authorization: "Bearer unrelated" },
    })),
    false,
  );
  assert.equal(
    verifyInternalRequest(new Request("https://example.test", {
      headers: { authorization: "Bearer unrelated" },
    })),
    false,
  );
  assert.equal(
    verifyEventSignature(new Request("https://example.test", {
      headers: { "x-dfm-event-secret": "unrelated" },
    })),
    false,
  );
});

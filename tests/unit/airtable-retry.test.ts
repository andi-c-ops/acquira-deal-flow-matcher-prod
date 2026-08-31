import assert from "node:assert/strict";
import test from "node:test";

// getEnv() validates and caches on first use, so the required Airtable
// configuration must be present before the client module is exercised.
process.env.AIRTABLE_API_KEY ??= "test-airtable-key";
process.env.AIRTABLE_BASE_ID ??= "appTestBase";
process.env.AIRTABLE_TABLE_ID ??= "tblTestTable";

const { fetchDealsInWindow, isTransientAirtableError } = await import(
  "@/lib/dfm/providers/airtable-client"
);

const WINDOW = { cursorStart: "2026-08-29T13:30:00Z", cursorEnd: "2026-08-31T13:30:00Z" };

function okPage(records: Array<{ id: string; fields: Record<string, unknown> }>, offset?: string) {
  return new Response(JSON.stringify({ records, offset }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function withStubbedFetch<T>(
  responses: Array<() => Promise<Response>>,
  run: () => Promise<T>,
): Promise<{ result: T; calls: number }> {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    const next = responses[calls] ?? responses[responses.length - 1];
    calls += 1;
    return next();
  }) as typeof globalThis.fetch;

  return run()
    .then((result) => ({ result, calls }))
    .finally(() => {
      globalThis.fetch = originalFetch;
    });
}

test("isTransientAirtableError recognises the failure that broke the Aug 30 daily run", () => {
  assert.equal(isTransientAirtableError(new Error("Request timed out after 20000ms")), true);
  assert.equal(isTransientAirtableError(new Error("fetch failed")), true);
  assert.equal(isTransientAirtableError(new Error("getaddrinfo ENOTFOUND api.airtable.com")), true);
  assert.equal(isTransientAirtableError(new Error("socket hang up")), true);
  assert.equal(isTransientAirtableError(new Error("Airtable fetch failed with status 401")), false);
  assert.equal(isTransientAirtableError("not an error"), false);
});

test("a page fetch that times out once is retried instead of failing the run", async () => {
  const { result, calls } = await withStubbedFetch(
    [
      () => Promise.reject(new Error("Request timed out after 20000ms")),
      () => Promise.resolve(okPage([{ id: "rec1", fields: { Title: "Tampa Plumbing" } }])),
    ],
    () => fetchDealsInWindow(WINDOW),
  );

  assert.equal(calls, 2, "the timed-out page should be retried once");
  assert.equal(result.length, 1);
  assert.equal(result[0].airtableRecordId, "rec1");
  assert.equal(result[0].title, "Tampa Plumbing");
});

test("a retryable status is retried and the recovered page is used", async () => {
  const { result, calls } = await withStubbedFetch(
    [
      () => Promise.resolve(new Response("rate limited", { status: 429 })),
      () => Promise.resolve(okPage([{ id: "rec2", fields: { Title: "Atlanta Roofing" } }])),
    ],
    () => fetchDealsInWindow(WINDOW),
  );

  assert.equal(calls, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].airtableRecordId, "rec2");
});

test("a non-retryable status fails immediately without burning retries", async () => {
  const { calls } = await withStubbedFetch(
    [() => Promise.resolve(new Response("unauthorized", { status: 401 }))],
    async () => {
      await assert.rejects(
        () => fetchDealsInWindow(WINDOW),
        /Airtable fetch failed with status 401/,
      );
    },
  );

  assert.equal(calls, 1, "an authorization failure must not be retried");
});

test("retries are bounded so a broadly unhealthy Airtable cannot stall the route", async () => {
  const { calls } = await withStubbedFetch(
    [() => Promise.reject(new Error("Request timed out after 20000ms"))],
    async () => {
      await assert.rejects(() => fetchDealsInWindow(WINDOW), /timed out/);
    },
  );

  assert.equal(calls, 3, "attempts are capped at AIRTABLE_MAX_ATTEMPTS");
});

test("pagination shares one retry budget across pages", async () => {
  // Page one succeeds with an offset, page two times out repeatedly. The shared
  // budget must stop the loop rather than retrying every page in full.
  let call = 0;
  const { calls } = await withStubbedFetch(
    [
      () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(okPage([{ id: "rec3", fields: { Title: "First Page" } }], "off1"));
        }
        return Promise.reject(new Error("Request timed out after 20000ms"));
      },
    ],
    async () => {
      await assert.rejects(() => fetchDealsInWindow(WINDOW), /timed out/);
    },
  );

  assert.ok(calls <= 4, `expected bounded total calls, saw ${calls}`);
});

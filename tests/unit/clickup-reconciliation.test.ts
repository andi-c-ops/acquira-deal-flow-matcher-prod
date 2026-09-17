import assert from "node:assert/strict";
import test from "node:test";

process.env.AIRTABLE_API_KEY ??= "test-airtable-key";
process.env.AIRTABLE_BASE_ID ??= "appTestBase";
process.env.AIRTABLE_TABLE_ID ??= "tblTestTable";
process.env.CLICKUP_API_KEY ??= "test-clickup-key";

const {
  buildDfmDeliveryMarker,
  createClickupDealTask,
  findClickupTasksByDeliveryKey,
  getClickupTask,
  hasDfmDeliveryMarker,
} = await import("@/lib/dfm/providers/clickup-client");

function withStubbedFetch<T>(
  handler: typeof fetch,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("DFM delivery markers are deterministic and exact", () => {
  const key = "list:901413052028:deal:rec123:target:clickup";
  assert.equal(buildDfmDeliveryMarker(key), `DFM Delivery Key: ${key}`);
  assert.equal(hasDfmDeliveryMarker(`description\n\nDFM Delivery Key: ${key}`, key), true);
  assert.equal(hasDfmDeliveryMarker(`DFM Delivery Key: other-${key}`, key), false);
});

test("existing marked task is found only in the target list and with the exact name", async () => {
  const key = "list:target:deal:rec123:target:clickup";
  const result = await withStubbedFetch(
    (async () =>
      new Response(
        JSON.stringify({
          tasks: [
            {
              id: "task-1",
              name: "[Moderate] Roofing Co",
              url: "https://app.clickup.com/t/task-1",
              description: `Deal\n\n${buildDfmDeliveryMarker(key)}`,
              list: { id: "target-list" },
            },
            {
              id: "task-2",
              name: "[Moderate] Roofing Co",
              description: `Deal\n\n${buildDfmDeliveryMarker(key)}`,
              list: { id: "other-list" },
            },
            {
              id: "task-3",
              name: "[Strong] Roofing Co",
              description: `Deal\n\n${buildDfmDeliveryMarker(key)}`,
              list: { id: "target-list" },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
    () =>
      findClickupTasksByDeliveryKey({
        clickupListId: "target-list",
        taskName: "[Moderate] Roofing Co",
        deliveryKey: key,
      }),
  );

  assert.deepEqual(result.map((task) => task.taskId), ["task-1"]);
});

test("task lookup returns the list and task name needed for controlled reconciliation", async () => {
  const result = await withStubbedFetch(
    (async () =>
      new Response(
        JSON.stringify({
          id: "task-1",
          name: "[Moderate] Roofing Co",
          url: "https://app.clickup.com/t/task-1",
          description: "operator-created task",
          list: { id: "target-list" },
        }),
        { status: 200 },
      )) as typeof fetch,
    () => getClickupTask("task-1"),
  );

  assert.equal(result.taskId, "task-1");
  assert.equal(result.taskName, "[Moderate] Roofing Co");
  assert.equal(result.listId, "target-list");
  assert.equal(result.description, "operator-created task");
});

test("new task descriptions carry the delivery marker", async () => {
  const key = "list:target:deal:rec123:target:clickup";
  let requestBody: Record<string, unknown> | undefined;
  const result = await withStubbedFetch(
    (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ id: "task-1", url: "https://app.clickup.com/t/task-1" }),
        { status: 200 },
      );
    }) as typeof fetch,
    () =>
      createClickupDealTask({
        aeName: "AE One",
        dealName: "Roofing Co",
        matchQuality: "Moderate",
        scorePct: 70,
        description: "Deal description",
        clickupListId: "target-list",
        deliveryKey: key,
      }),
  );

  assert.equal(result.taskId, "task-1");
  assert.ok(requestBody);
  assert.match(String(requestBody.description), new RegExp(buildDfmDeliveryMarker(key)));
});

test("task creation bounds provider calls and updates numeric fields concurrently", async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const signals: AbortSignal[] = [];

  const result = await withStubbedFetch(
    (async (_input, init) => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (init?.signal instanceof AbortSignal) {
        signals.push(init.signal);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(JSON.stringify({ id: "task-1", url: "https://app.clickup.com/t/task-1" }), {
        status: 200,
      });
    }) as typeof fetch,
    () =>
      createClickupDealTask({
        aeName: "AE One",
        dealName: "Roofing Co",
        matchQuality: "Moderate",
        scorePct: 70,
        description: "Deal description",
        clickupListId: "target-list",
        purchasePrice: 1_000_000,
        cashFlow: 200_000,
        multiple: 5,
      }),
  );

  assert.equal(result.taskId, "task-1");
  assert.equal(calls, 4, "creation plus three numeric field updates");
  assert.equal(signals.length, calls, "every provider call is abortable");
  assert.ok(maxActive >= 3, "numeric field updates should overlap");
});

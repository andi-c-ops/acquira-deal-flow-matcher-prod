import assert from "node:assert/strict";
import test from "node:test";

import { parseClickupEngagementSnapshot } from "../../src/lib/dfm/db/repositories/clickup-engagement-snapshot";

test("accepts a complete ClickUp engagement snapshot", () => {
  const snapshot = {
    version: 1 as const,
    observedAt: "2026-09-02T13:30:00.000Z",
    rows: [
      {
        aeThesisId: "ae-1",
        clickupListId: "list-1",
        recentlyUpdatedDeals14Days: 2,
        recentlyUpdatedDeals30Days: 3,
        lastClickupActivityAt: "2026-09-01T14:00:00.000Z",
      },
    ],
  };

  assert.deepEqual(parseClickupEngagementSnapshot(snapshot), snapshot);
});

test("rejects malformed snapshot metadata", () => {
  assert.equal(parseClickupEngagementSnapshot(null), null);
  assert.equal(parseClickupEngagementSnapshot({ version: 2, observedAt: "now", rows: [] }), null);
  assert.equal(
    parseClickupEngagementSnapshot({
      version: 1,
      observedAt: "2026-09-02T13:30:00.000Z",
      rows: [{ aeThesisId: "ae-1" }],
    }),
    null,
  );
});

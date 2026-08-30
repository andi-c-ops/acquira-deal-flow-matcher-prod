import assert from "node:assert/strict";
import test from "node:test";

import { buildClickupDedupeKey } from "@/lib/dfm/utils/idempotency";

test("deduplicates a deal by ClickUp destination rather than thesis record", () => {
  assert.equal(
    buildClickupDedupeKey("list-123", "deal-456"),
    "list:list-123:deal:deal-456:target:clickup",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { isScheduledEasternTime } from "../../src/lib/dfm/utils/eastern-time";

test("accepts delayed Vercel invocations inside the five-minute schedule window", () => {
  assert.equal(isScheduledEasternTime(7, 0, new Date("2026-08-18T11:00:00Z")), true);
  assert.equal(isScheduledEasternTime(7, 0, new Date("2026-08-18T11:01:16Z")), true);
  assert.equal(isScheduledEasternTime(9, 30, new Date("2026-08-18T13:35:00Z")), true);
});

test("rejects invocations outside the schedule window", () => {
  assert.equal(isScheduledEasternTime(7, 0, new Date("2026-08-18T10:59:59Z")), false);
  assert.equal(isScheduledEasternTime(7, 0, new Date("2026-08-18T11:06:00Z")), false);
  assert.equal(isScheduledEasternTime(7, 0, new Date("2026-08-18T12:00:00Z")), false);
  assert.equal(isScheduledEasternTime(9, 30, new Date("2026-08-18T13:36:00Z")), false);
});

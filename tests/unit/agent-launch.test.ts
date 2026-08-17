import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentLaunchModel,
  getPromptTabsForCard,
} from "../../src/lib/dfm/agents/agent-launch";

test("buildAgentLaunchModel returns the deal flow agent starters including AE deal flow review", () => {
  const model = buildAgentLaunchModel();

  assert.equal(model.title, "Deal Flow Agent Launch");
  assert.equal(model.platformRecommendation.primarySurface, "ChatGPT Work");
  assert.equal(model.platformRecommendation.engineeringSurface, "Codex");
  assert.equal(model.handoffs.length, 2);
  assert.deepEqual(
    model.handoffs.map((handoff) => handoff.title),
    ["Start In ChatGPT Work", "Escalate To Codex"],
  );
  assert.equal(model.cards.length, 4);
  assert.deepEqual(
    model.cards.map((card) => card.name),
    ["Operator Agent", "QA Agent", "Engineering Agent", "AE Deal Flow Agent"],
  );
  assert.ok(model.cards.every((card) => card.copyLabel === "Copy starter prompt"));
  assert.ok(
    model.cards.every((card) => card.prompt.includes("Deal Flow Matcher")),
  );
});

test("getPromptTabsForCard returns starter and follow-up tabs in order", () => {
  const model = buildAgentLaunchModel();
  const tabs = getPromptTabsForCard(model.cards[0]);

  assert.deepEqual(
    tabs.map((tab) => tab.label),
    ["Launch prompt", "Follow-up"],
  );
  assert.ok(tabs.every((tab) => tab.content.length > 0));
});

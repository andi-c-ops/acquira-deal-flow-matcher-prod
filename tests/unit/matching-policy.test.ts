import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedAeThesis, NormalizedDeal } from "@/lib/dfm/domain/types";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";

const baseDeal: NormalizedDeal = {
  airtableRecordId: "rec-test",
  businessName: "Test Business",
  industry: "HVAC",
  location: "Austin",
  state: "Texas",
  price: 2_000_000,
  ebitda: 500_000,
};

const baseThesis: NormalizedAeThesis = {
  aeName: "Test AE",
  aeEmail: "test@example.com",
  industries: ["HVAC"],
  geography: ["Texas"],
  priceMin: 1_000_000,
  priceMax: 3_000_000,
  ebitdaMin: 300_000,
  ebitdaMax: 700_000,
  summary: "Test",
  normalizationVersion: "v3",
};

test("requires all four applicable criteria for a Strong match", () => {
  const result = scoreDealAgainstThesis(baseDeal, baseThesis);
  assert.equal(result.matchQuality, "Strong");
  assert.equal(result.scorePct, 100);
});

test("does not match short geography fragments inside unrelated locations", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, location: "Columbia", state: "South Carolina" },
    { ...baseThesis, geography: ["San Francisco Bay Area", "NA", "NA"], geographyTargets: undefined },
  );
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Geography")?.match, false);
});

test("requires both city and state for paired geography targets", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, location: "Portland", state: "Oregon" },
    { ...baseThesis, geography: ["Portland", "ME"], geographyTargets: undefined },
  );
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Geography")?.match, false);
});

test("matches an exact state abbreviation to the full deal state", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, location: "Harris County", state: "Texas" },
    { ...baseThesis, geography: ["TX"], geographyTargets: undefined },
  );
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Geography")?.match, true);
});

test("uses controlled title evidence for specific trade industries", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, businessName: "Profitable Roofing Company", industry: "Building & Construction" },
    { ...baseThesis, industries: ["Roofing"] },
  );
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Industry")?.match, true);
});

test("does not infer Commercial Cleaning from Home Services", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, businessName: "Commercial Cleaning Company", industry: "Cleaning" },
    { ...baseThesis, industries: ["Home Services"] },
  );
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Industry")?.match, false);
});

test("treats Any as neutral and requires two substantive matches for Moderate", () => {
  const result = scoreDealAgainstThesis(baseDeal, {
    ...baseThesis,
    priceMin: null,
    priceMax: null,
    ebitdaMin: 800_000,
    ebitdaMax: 1_000_000,
  });
  assert.equal(result.matchQuality, "Moderate");
  assert.equal(Math.round(result.scorePct), 67);
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "Asking Price")?.applicable, false);
});

test("does not qualify a deal with only one substantive match", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, price: 0, ebitda: 0 },
    { ...baseThesis, industries: [], geography: ["Texas"] },
  );
  assert.equal(result.matchQuality, "Weak");
  assert.equal(result.deliveryEligible, false);
});

test("treats zero deal financials as unknown and neutral", () => {
  const result = scoreDealAgainstThesis(
    { ...baseDeal, price: 0, ebitda: 0 },
    baseThesis,
  );
  assert.equal(result.matchQuality, "Moderate");
  assert.equal(result.scorePct, 100);
  assert.equal(result.criteriaDetails.find((item) => item.criterion === "EBITDA")?.dealValue, "Unknown");
});

test("normalizes implicit price and EBITDA units", () => {
  const normalized = normalizeAePayload({
    aeName: "Range Test",
    priceTarget: "1 to 3",
    ebitdaRange: "0 to 500",
  });
  assert.equal(normalized.priceMin, 1_000_000);
  assert.equal(normalized.priceMax, 3_000_000);
  assert.equal(normalized.ebitdaMin, 0);
  assert.equal(normalized.ebitdaMax, 500_000);
});

test("normalizes mixed implicit EBITDA units", () => {
  const normalized = normalizeAePayload({ aeName: "Range Test", ebitdaRange: "ideally 500-1" });
  assert.equal(normalized.ebitdaMin, 500_000);
  assert.equal(normalized.ebitdaMax, 1_000_000);
});

test("preserves previous financial criteria when a new submission is blank or zero", () => {
  const normalized = normalizeAePayload(
    { aeName: "Updated AE", priceTarget: "0", ebitdaRange: "" },
    baseThesis,
  );
  assert.equal(normalized.priceMin, baseThesis.priceMin);
  assert.equal(normalized.priceMax, baseThesis.priceMax);
  assert.equal(normalized.ebitdaMin, baseThesis.ebitdaMin);
  assert.equal(normalized.ebitdaMax, baseThesis.ebitdaMax);
});

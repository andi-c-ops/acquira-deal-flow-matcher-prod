import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDeal } from "@/lib/dfm/matching/deal-normalizer";
import { enrichDealIndustry } from "@/lib/dfm/matching/deal-enricher";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";
import { buildClickupDedupeKey } from "@/lib/dfm/utils/idempotency";
import type { AirtableDealSourceRecord } from "@/lib/dfm/providers/airtable-client";

interface SmokeInput {
  thesis: Record<string, unknown>;
  deals: AirtableDealSourceRecord[];
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixturePath = path.resolve(__dirname, "../tests/fixtures/smoke-input.json");
  const raw = await fs.readFile(fixturePath, "utf8");
  const input = JSON.parse(raw) as SmokeInput;

  const thesis = normalizeAePayload(input.thesis);
  const suffixRangeThesis = normalizeAePayload({
    aeName: "Range Parser Smoke",
    "What is the desired asking price for the business you’re interested in?": "$2.5-5M",
  });
  const colonHeaderThesis = normalizeAePayload({
    "Your Full Name:": "Kyle Sausser",
    "Your Email:": "kylesausser@example.com",
  });

  if (suffixRangeThesis.priceMin !== 2_500_000 || suffixRangeThesis.priceMax !== 5_000_000) {
    throw new Error(
      `Expected $2.5-5M to parse as 2500000 to 5000000, received ${suffixRangeThesis.priceMin} to ${suffixRangeThesis.priceMax}`,
    );
  }
  if (colonHeaderThesis.aeName !== "Kyle Sausser") {
    throw new Error(`Expected colon header name to parse as Kyle Sausser, received ${colonHeaderThesis.aeName}`);
  }

  console.log(`AE: ${thesis.aeName}`);
  console.log(`Summary: ${thesis.summary}`);

  for (const deal of input.deals) {
    const normalized = enrichDealIndustry(normalizeDeal(deal));
    const score = scoreDealAgainstThesis(normalized, thesis);
    const dedupeKey = buildClickupDedupeKey("ae-smoke", normalized.airtableRecordId);

    console.log("");
    console.log(`Deal: ${normalized.businessName}`);
    console.log(`Industry: ${normalized.industry ?? "Unknown"}`);
    console.log(`Location: ${[normalized.location, normalized.state].filter(Boolean).join(", ")}`);
    console.log(`Score: ${score.scorePct.toFixed(1)}%`);
    console.log(`Quality: ${score.matchQuality}`);
    console.log(`Eligible: ${score.deliveryEligible ? "yes" : "no"}`);
    console.log(`Dedupe Key: ${dedupeKey}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

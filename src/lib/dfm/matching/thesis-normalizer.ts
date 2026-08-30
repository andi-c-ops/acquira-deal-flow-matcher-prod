import type { NormalizedAeThesis } from "@/lib/dfm/domain/types";
import { parseGeographyTargets } from "@/lib/dfm/matching/geography-matcher";

const NORMALIZATION_VERSION = "v4";

type RangeKind = "price" | "ebitda";

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function fallbackMultiplier(value: number, values: number[], kind: RangeKind) {
  const max = Math.max(...values);

  if (kind === "price") {
    if (value <= 100) return 1_000_000;
    if (value < 10_000) return 1_000;
    return 1;
  }

  if (value <= 10 && max <= 10) return 1_000_000;
  if (value <= 10 && max >= 100 && max < 10_000) return 1_000_000;
  if (value < 10_000) return 1_000;
  return 1;
}

function suffixMultiplier(suffix: string | undefined): number | null {
  const normalized = suffix?.toLowerCase();
  if (!normalized) return null;
  if (["m", "mm", "mill", "million"].includes(normalized)) return 1_000_000;
  if (["k", "thousand"].includes(normalized)) return 1_000;
  return null;
}

function parseRange(value: unknown, kind: RangeKind): { min?: number; max?: number } {
  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  const cleaned = value.replace(/(?<=\d),(?=\s*\d)/g, "");
  const matches = Array.from(
    cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(million|mill|mm|m|thousand|k)?/gi),
  );
  if (matches.length === 0) {
    return {};
  }

  const numericValues = matches.map((match) => Number(match[1]));
  const explicitMultipliers = matches
    .map((match) => suffixMultiplier(match[2]))
    .filter((multiplier): multiplier is number => multiplier !== null);
  const sharedExplicitMultiplier = new Set(explicitMultipliers).size === 1 ? explicitMultipliers[0] : null;

  const parsed = matches.map((match, index) => {
    const numericValue = numericValues[index];
    const multiplier =
      suffixMultiplier(match[2]) ??
      (numericValue < 10_000 ? sharedExplicitMultiplier : null) ??
      fallbackMultiplier(numericValue, numericValues, kind);
    return numericValue * multiplier;
  });

  if (parsed.every((item) => item === 0)) return {};

  if (parsed.length === 1) {
    return { min: parsed[0], max: parsed[0] };
  }

  return {
    min: Math.min(...parsed),
    max: Math.max(...parsed),
  };
}

function preservePreviousRange(
  parsed: { min?: number; max?: number },
  previousMin: number | null | undefined,
  previousMax: number | null | undefined,
) {
  if (parsed.min !== undefined || parsed.max !== undefined) return parsed;
  if (previousMin == null && previousMax == null) return parsed;
  return { min: previousMin ?? undefined, max: previousMax ?? undefined };
}

export function normalizeAePayload(
  payload: Record<string, unknown>,
  previous?: NormalizedAeThesis | null,
): NormalizedAeThesis {
  const aeName =
    firstString(
      payload.aeName,
      payload.ae_name,
      payload["Your Full Name"],
      payload["Your Full Name:"],
      payload["Your Full Name:  "],
    ) ?? "Unknown AE";

  const aeEmail =
    firstString(
      payload.aeEmail,
      payload.ae_email,
      payload["Your Email"],
      payload["Your Email:"],
      payload["Email Address"],
    ) ?? null;

  const industries = toStringArray(
    [
      payload.industries,
      payload["What are your preferred industries? Note: If your geographical search area is restricted, you MUST be more open on industry, and vice versa. The less restricted you are with both area and industry, the more likely you are (1) to be successful rapidly, and (2) to be successful at all."],
      payload["Acquira's Industries of Preference (including manufacturing, distribution, servicing, and installation activities)\n"],
      payload["List any other business that both Acquisition Entrepreneur and Acquira agree is consistent with the Investment Thesis."],
    ]
      .filter(Boolean)
      .join("; "),
  );
  const geography = toStringArray(
    [
      payload.geography,
      payload["1. Primary geographical areas of interest:"],
      payload["2. Secondary geographical areas of interest:"],
      payload["3. Tertiary geographical areas of interest (if any):"],
    ]
      .filter(Boolean)
      .join("; "),
  );
  const price = preservePreviousRange(
    parseRange(
      payload.priceTarget ??
        payload.price_target ??
        payload["What is the desired asking price for the business you’re interested in?"],
      "price",
    ),
    previous?.priceMin,
    previous?.priceMax,
  );
  const ebitda = preservePreviousRange(
    parseRange(
      payload.ebitdaRange ??
        payload.ebitda_range ??
        payload["What is the Adjusted EBITDA/SDE that you are seeking? "],
      "ebitda",
    ),
    previous?.ebitdaMin,
    previous?.ebitdaMax,
  );

  const summaryParts = [
    industries.length ? `Industries: ${industries.join(", ")}` : null,
    geography.length ? `Geography: ${geography.join(", ")}` : null,
    price.min !== undefined || price.max !== undefined
      ? `Price: ${price.min ?? "?"} to ${price.max ?? "?"}`
      : null,
    ebitda.min !== undefined || ebitda.max !== undefined
      ? `EBITDA: ${ebitda.min ?? "?"} to ${ebitda.max ?? "?"}`
      : null,
  ].filter(Boolean);

  return {
    aeName,
    aeEmail,
    industries,
    geography,
    geographyTargets: parseGeographyTargets(geography),
    priceMin: price.min ?? null,
    priceMax: price.max ?? null,
    ebitdaMin: ebitda.min ?? null,
    ebitdaMax: ebitda.max ?? null,
    summary: summaryParts.join(" | ") || aeName,
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

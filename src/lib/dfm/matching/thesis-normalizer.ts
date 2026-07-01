import type { NormalizedAeThesis } from "@/lib/dfm/domain/types";

const NORMALIZATION_VERSION = "v1";

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

function parseRange(value: unknown): { min?: number; max?: number } {
  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  const numbers = value.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) {
    return {};
  }

  const parsed = numbers.map(Number);
  if (parsed.length === 1) {
    return { min: parsed[0], max: parsed[0] };
  }

  return {
    min: Math.min(...parsed),
    max: Math.max(...parsed),
  };
}

export function normalizeAePayload(payload: Record<string, unknown>): NormalizedAeThesis {
  const aeName =
    firstString(
      payload.aeName,
      payload.ae_name,
      payload["Your Full Name"],
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
  const price = parseRange(
    payload.priceTarget ??
      payload.price_target ??
      payload["What is the desired asking price for the business you’re interested in?"],
  );
  const ebitda = parseRange(
    payload.ebitdaRange ??
      payload.ebitda_range ??
      payload["What is the Adjusted EBITDA/SDE that you are seeking? "],
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
    priceMin: price.min ?? null,
    priceMax: price.max ?? null,
    ebitdaMin: ebitda.min ?? null,
    ebitdaMax: ebitda.max ?? null,
    summary: summaryParts.join(" | ") || aeName,
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

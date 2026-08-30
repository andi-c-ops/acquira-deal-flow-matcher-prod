import type { MatchCriterionDetail, MatchScore, NormalizedAeThesis, NormalizedDeal } from "@/lib/dfm/domain/types";
import { matchesGeography, parseGeographyTargets } from "@/lib/dfm/matching/geography-matcher";
import { matchesIndustry } from "@/lib/dfm/matching/industry-matcher";

function checkIndustry(deal: NormalizedDeal, thesis: NormalizedAeThesis): MatchCriterionDetail {
  const dealIndustry = deal.industry ?? "Unknown";
  if (thesis.industries.length === 0) {
    return {
      criterion: "Industry",
      match: true,
      score: 0,
      applicable: false,
      dealValue: dealIndustry,
      thesisValue: "Any",
    };
  }

  const match = matchesIndustry(deal, thesis.industries);

  return {
    criterion: "Industry",
    match,
    score: match ? 1 : 0,
    applicable: true,
    dealValue: dealIndustry,
    thesisValue: thesis.industries.join(", "),
  };
}

function checkGeography(deal: NormalizedDeal, thesis: NormalizedAeThesis): MatchCriterionDetail {
  const combined = [deal.location, deal.state].filter(Boolean).join(", ") || "Unknown";
  if (thesis.geography.length === 0) {
    return {
      criterion: "Geography",
      match: true,
      score: 0,
      applicable: false,
      dealValue: combined,
      thesisValue: "Any",
    };
  }

  const targets = thesis.geographyTargets ?? parseGeographyTargets(thesis.geography);
  const match = matchesGeography(deal.location, deal.state, targets);

  return {
    criterion: "Geography",
    match,
    score: match ? 1 : 0,
    applicable: true,
    dealValue: combined,
    thesisValue: thesis.geography.join(", "),
  };
}

function checkRange(
  criterion: string,
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): MatchCriterionDetail {
  if (min == null && max == null) {
    return {
      criterion,
      match: true,
      score: 0,
      applicable: false,
      dealValue: value == null ? "Unknown" : String(value),
      thesisValue: "Any",
    };
  }

  if (value == null || value <= 0) {
    return {
      criterion,
      match: false,
      score: 0,
      applicable: false,
      dealValue: "Unknown",
      thesisValue: `${min ?? "?"} to ${max ?? "?"}`,
    };
  }

  const match = (min == null || value >= min) && (max == null || value <= max);
  return {
    criterion,
    match,
    score: match ? 1 : 0,
    applicable: true,
    dealValue: String(value),
    thesisValue: `${min ?? "?"} to ${max ?? "?"}`,
  };
}

export function scoreDealAgainstThesis(deal: NormalizedDeal, thesis: NormalizedAeThesis): MatchScore {
  const criteria = [
    checkIndustry(deal, thesis),
    checkGeography(deal, thesis),
    checkRange("Asking Price", deal.price ?? null, thesis.priceMin, thesis.priceMax),
    checkRange("EBITDA", deal.ebitda ?? null, thesis.ebitdaMin, thesis.ebitdaMax),
  ];

  const applicableCriteria = criteria.filter((item) => item.applicable !== false);
  const matchedCriteria = applicableCriteria.filter((item) => item.match).length;
  const totalScore = applicableCriteria.reduce((sum, item) => sum + item.score, 0);
  const scorePct = applicableCriteria.length === 0 ? 0 : (totalScore / applicableCriteria.length) * 100;

  let matchQuality: MatchScore["matchQuality"] = "Weak";
  if (scorePct >= 80 && matchedCriteria >= 3) {
    matchQuality = "Strong";
  } else if (scorePct >= 50 && matchedCriteria >= 2) {
    matchQuality = "Moderate";
  }

  return {
    scorePct,
    matchQuality,
    deliveryEligible: matchQuality === "Strong" || matchQuality === "Moderate",
    criteriaDetails: criteria,
  };
}

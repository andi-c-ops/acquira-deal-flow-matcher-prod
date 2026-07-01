import type { MatchCriterionDetail, MatchScore, NormalizedAeThesis, NormalizedDeal } from "@/lib/dfm/domain/types";

function checkIndustry(deal: NormalizedDeal, thesis: NormalizedAeThesis): MatchCriterionDetail {
  const dealIndustry = deal.industry ?? "Unknown";
  if (thesis.industries.length === 0) {
    return {
      criterion: "Industry",
      match: true,
      score: 1,
      dealValue: dealIndustry,
      thesisValue: "Any",
    };
  }

  const match = thesis.industries.some((industry) =>
    dealIndustry.toLowerCase().includes(industry.toLowerCase()),
  );

  return {
    criterion: "Industry",
    match,
    score: match ? 1 : 0,
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
      score: 1,
      dealValue: combined,
      thesisValue: "Any",
    };
  }

  const match = thesis.geography.some((geo) => combined.toLowerCase().includes(geo.toLowerCase()));

  return {
    criterion: "Geography",
    match,
    score: match ? 1 : 0,
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
      score: 1,
      dealValue: value == null ? "Unknown" : String(value),
      thesisValue: "Any",
    };
  }

  if (value == null) {
    return {
      criterion,
      match: false,
      score: 0,
      dealValue: "Unknown",
      thesisValue: `${min ?? "?"} to ${max ?? "?"}`,
    };
  }

  const match = (min == null || value >= min) && (max == null || value <= max);
  return {
    criterion,
    match,
    score: match ? 1 : 0,
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

  const totalScore = criteria.reduce((sum, item) => sum + item.score, 0);
  const scorePct = (totalScore / criteria.length) * 100;

  let matchQuality: MatchScore["matchQuality"] = "Weak";
  if (scorePct >= 80) {
    matchQuality = "Strong";
  } else if (scorePct >= 50) {
    matchQuality = "Moderate";
  }

  return {
    scorePct,
    matchQuality,
    deliveryEligible: matchQuality === "Strong" || matchQuality === "Moderate",
    criteriaDetails: criteria,
  };
}

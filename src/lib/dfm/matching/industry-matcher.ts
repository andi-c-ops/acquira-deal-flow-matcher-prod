import type { NormalizedDeal } from "@/lib/dfm/domain/types";

const INDUSTRY_CONCEPTS = [
  ["hvac", "heating", "air conditioning", "refrigeration"],
  ["electrical", "electric", "electrician"],
  ["roofing", "roof"],
  ["plumbing", "plumber"],
  ["landscaping", "landscape"],
  ["restoration", "remediation"],
] as const;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(text: string, phrase: string) {
  return (` ${text} `).includes(` ${phrase} `);
}

export function matchesIndustry(deal: NormalizedDeal, thesisIndustries: string[]) {
  const dealIndustry = normalize(deal.industry ?? "");
  const titleEvidence = normalize(deal.businessName);
  const dealEvidence = `${dealIndustry} ${titleEvidence}`.trim();

  return thesisIndustries.some((industry) => {
    const thesisIndustry = normalize(industry);
    if (!thesisIndustry) return false;
    if (dealIndustry.includes(thesisIndustry)) return true;

    return INDUSTRY_CONCEPTS.some((aliases) => {
      const thesisConcept = aliases.some((alias) => containsPhrase(thesisIndustry, alias));
      const dealConcept = aliases.some((alias) => containsPhrase(dealEvidence, alias));
      return thesisConcept && dealConcept;
    });
  });
}

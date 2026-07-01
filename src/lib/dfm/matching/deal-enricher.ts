import type { NormalizedDeal } from "@/lib/dfm/domain/types";

const KEYWORD_MAP: Record<string, string> = {
  plumbing: "Plumbing",
  hvac: "HVAC",
  roofing: "Roofing",
  landscaping: "Landscaping",
  electrical: "Electrical",
};

export function enrichDealIndustry(deal: NormalizedDeal): NormalizedDeal {
  if (deal.industry) {
    return deal;
  }

  const lowerName = deal.businessName.toLowerCase();
  for (const [keyword, label] of Object.entries(KEYWORD_MAP)) {
    if (lowerName.includes(keyword)) {
      return {
        ...deal,
        industry: label,
      };
    }
  }

  return deal;
}

import type { MatchScore } from "@/lib/dfm/domain/types";

export type DeliveryMinMatchQuality = Extract<MatchScore["matchQuality"], "Strong" | "Moderate">;

const MATCH_QUALITY_RANK: Record<MatchScore["matchQuality"], number> = {
  Weak: 0,
  Moderate: 1,
  Strong: 2,
};

export function normalizeDeliveryMinMatchQuality(value: unknown): DeliveryMinMatchQuality {
  return value === "Strong" ? "Strong" : "Moderate";
}

export function shouldCreateClickupDeliveryJob(
  matchQuality: MatchScore["matchQuality"],
  deliveryMinMatchQuality: unknown,
): boolean {
  const minimum = normalizeDeliveryMinMatchQuality(deliveryMinMatchQuality);
  return MATCH_QUALITY_RANK[matchQuality] >= MATCH_QUALITY_RANK[minimum];
}

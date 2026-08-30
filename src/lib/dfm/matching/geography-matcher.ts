import type { NormalizedGeographyTarget } from "@/lib/dfm/domain/types";

const STATE_NAMES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
  mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
  ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
  sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont",
  va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
  dc: "district of columbia",
};

const STATE_CODES = new Map(Object.entries(STATE_NAMES).flatMap(([code, name]) => [[code, code], [name, code]]));
const IGNORED_VALUES = new Set(["", "n a", "na", "none", "not applicable", "unknown"]);
const ANYWHERE_VALUES = new Set([
  "any",
  "anywhere",
  "nationwide",
  "national",
  "united states",
  "united states of america",
  "usa",
  "us",
]);

export function normalizeGeographyText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalState(value: string | null | undefined) {
  if (!value) return null;
  return STATE_CODES.get(normalizeGeographyText(value)) ?? null;
}

export function parseGeographyTargets(values: string[]): NormalizedGeographyTarget[] {
  const targets: NormalizedGeographyTarget[] = [];
  let pendingLocation: string | null = null;

  for (const rawValue of values) {
    const value = rawValue.trim();
    const normalized = normalizeGeographyText(value);
    if (IGNORED_VALUES.has(normalized)) continue;
    if (ANYWHERE_VALUES.has(normalized)) return [];

    const state = canonicalState(value);
    if (state) {
      if (pendingLocation) {
        targets.push({ location: pendingLocation, state });
        pendingLocation = null;
      } else {
        targets.push({ state });
      }
      continue;
    }

    if (pendingLocation) targets.push({ location: pendingLocation });
    pendingLocation = value;
  }

  if (pendingLocation) targets.push({ location: pendingLocation });
  return targets;
}

function locationMatches(dealLocation: string, targetLocation: string) {
  const deal = normalizeGeographyText(dealLocation);
  const target = normalizeGeographyText(targetLocation);
  if (!deal || !target) return false;
  return deal === target || (deal.length >= 4 && target.includes(deal)) || (target.length >= 4 && deal.includes(target));
}

export function matchesGeography(
  dealLocation: string | null | undefined,
  dealState: string | null | undefined,
  targets: NormalizedGeographyTarget[],
) {
  const dealStateCode = canonicalState(dealState);
  const location = dealLocation?.trim() ?? "";

  return targets.some((target) => {
    const targetStateCode = canonicalState(target.state);
    const stateMatches = !targetStateCode || (dealStateCode !== null && targetStateCode === dealStateCode);
    const targetLocation = target.location?.trim();
    const placeMatches = !targetLocation || locationMatches(location, targetLocation);
    return stateMatches && placeMatches;
  });
}

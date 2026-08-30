import fs from "node:fs/promises";

import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";

type Quality = "Strong" | "Moderate" | "Weak";

interface CriterionDetail {
  criterion: string;
  match: boolean;
  dealValue: string;
  thesisValue: string;
}

interface PacketMatch {
  matchQuality: Quality;
  criteriaDetails: CriterionDetail[];
}

interface AeReport {
  aeName: string;
  deliveryMinMatchQuality: "Strong" | "Moderate";
  matches: PacketMatch[];
}

function parseKnownFinancialValue(value: string) {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function rescoreCriterion(detail: CriterionDetail) {
  if (detail.thesisValue === "Any") {
    return { applicable: false, match: false };
  }

  if (detail.criterion !== "Asking Price" && detail.criterion !== "EBITDA") {
    return { applicable: true, match: detail.match };
  }

  const dealValue = parseKnownFinancialValue(detail.dealValue);
  if (dealValue == null) {
    return { applicable: false, match: false };
  }

  const normalized =
    detail.criterion === "Asking Price"
      ? normalizeAePayload({ aeName: "Preview", priceTarget: detail.thesisValue })
      : normalizeAePayload({ aeName: "Preview", ebitdaRange: detail.thesisValue });
  const min = detail.criterion === "Asking Price" ? normalized.priceMin : normalized.ebitdaMin;
  const max = detail.criterion === "Asking Price" ? normalized.priceMax : normalized.ebitdaMax;

  if (min == null && max == null) {
    return { applicable: false, match: false };
  }

  return {
    applicable: true,
    match: (min == null || dealValue >= min) && (max == null || dealValue <= max),
  };
}

function classify(match: PacketMatch): Quality {
  const criteria = match.criteriaDetails.map(rescoreCriterion);
  const applicable = criteria.filter((criterion) => criterion.applicable);
  const matched = applicable.filter((criterion) => criterion.match).length;
  const scorePct = applicable.length === 0 ? 0 : (matched / applicable.length) * 100;

  if (scorePct >= 80 && matched >= 3) return "Strong";
  if (scorePct >= 50 && matched >= 2) return "Moderate";
  return "Weak";
}

function isDelivered(quality: Quality, minimum: "Strong" | "Moderate") {
  return quality === "Strong" || (quality === "Moderate" && minimum === "Moderate");
}

async function main() {
  const packetPath = process.argv[2];
  if (!packetPath) throw new Error("Usage: preview-scoring-policy <operator-packet.json>");

  const raw = JSON.parse(await fs.readFile(packetPath, "utf8")) as {
    packet?: { latestRuns?: { daily?: { id?: string; summary?: { aeReports?: AeReport[] } } } };
  };
  const daily = raw.packet?.latestRuns?.daily;
  const reports = daily?.summary?.aeReports ?? [];

  const perAe = reports.map((report) => {
    const rescored = report.matches.map((match) => classify(match));
    return {
      aeName: report.aeName,
      minimum: report.deliveryMinMatchQuality,
      priorEligible: report.matches.length,
      priorDelivered: report.matches.filter((match) =>
        isDelivered(match.matchQuality, report.deliveryMinMatchQuality),
      ).length,
      previewStrong: rescored.filter((quality) => quality === "Strong").length,
      previewModerate: rescored.filter((quality) => quality === "Moderate").length,
      previewWeak: rescored.filter((quality) => quality === "Weak").length,
      previewDelivered: rescored.filter((quality) =>
        isDelivered(quality, report.deliveryMinMatchQuality),
      ).length,
    };
  });

  const sum = (key: keyof (typeof perAe)[number]) =>
    perAe.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] : 0), 0);

  console.log(
    JSON.stringify(
      {
        runId: daily?.id ?? null,
        scope: "Re-scores candidates already present in the packet; previously Weak candidates are not available for promotion.",
        totals: {
          priorEligible: sum("priorEligible"),
          priorDelivered: sum("priorDelivered"),
          previewStrong: sum("previewStrong"),
          previewModerate: sum("previewModerate"),
          previewWeak: sum("previewWeak"),
          previewDelivered: sum("previewDelivered"),
        },
        perAe: perAe.sort((a, b) => b.priorDelivered - a.priorDelivered),
      },
      null,
      2,
    ),
  );
}

void main();

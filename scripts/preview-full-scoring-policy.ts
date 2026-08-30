import fs from "node:fs/promises";

import { closePool, queryOne } from "@/lib/dfm/db/client";
import { listCurrentAeThesisVersions } from "@/lib/dfm/db/repositories/ae-thesis-versions";
import { listActiveAeTheses } from "@/lib/dfm/db/repositories/ae-theses";
import type { MatchScore, NormalizedAeThesis, NormalizedDeal } from "@/lib/dfm/domain/types";
import { enrichDealIndustry } from "@/lib/dfm/matching/deal-enricher";
import { normalizeDeal } from "@/lib/dfm/matching/deal-normalizer";
import { normalizeDeliveryMinMatchQuality, shouldCreateClickupDeliveryJob } from "@/lib/dfm/matching/delivery-threshold";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";
import { fetchDealsInWindow } from "@/lib/dfm/providers/airtable-client";
import { fetchNewAeSubmissionsSince, type GoogleSubmissionRecord } from "@/lib/dfm/providers/google-intake-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

type Quality = MatchScore["matchQuality"];

interface LatestDailyRun {
  id: string;
  cursor_start: string;
  cursor_end: string;
  summary_json: Record<string, unknown> | null;
}

interface ActiveAeRow {
  id: string;
  ae_name: string;
  ae_email?: string | null;
  clickup_list_id?: string | null;
  delivery_min_match_quality?: string | null;
}

interface ThesisVersionRow {
  ae_thesis_id: string;
  normalized_payload: NormalizedAeThesis;
}

function identity(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function submissionIdentity(submission: GoogleSubmissionRecord) {
  const normalized = normalizeAePayload(submission.payload);
  return identity(normalized.aeEmail) || identity(normalized.aeName);
}

function rebuildSubmissionHistories(submissions: GoogleSubmissionRecord[]) {
  const histories = new Map<string, GoogleSubmissionRecord[]>();

  for (const submission of submissions) {
    const key = submissionIdentity(submission);
    if (!key) continue;
    const history = histories.get(key) ?? [];
    history.push(submission);
    histories.set(key, history);
  }

  const rebuilt = new Map<string, NormalizedAeThesis>();
  for (const [key, history] of histories) {
    let current: NormalizedAeThesis | null = null;
    for (const submission of history.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
      current = normalizeAePayload(submission.payload, current);
    }
    if (current) rebuilt.set(key, current);
  }

  return rebuilt;
}

function findRebuiltThesis(
  ae: ActiveAeRow,
  rebuilt: Map<string, NormalizedAeThesis>,
) {
  return rebuilt.get(identity(ae.ae_email)) ?? rebuilt.get(identity(ae.ae_name)) ?? null;
}

function scoreLegacy(deal: NormalizedDeal, thesis: NormalizedAeThesis): MatchScore {
  const industryMatch =
    thesis.industries.length === 0 ||
    thesis.industries.some((industry) =>
      (deal.industry ?? "Unknown").toLowerCase().includes(industry.toLowerCase()),
    );
  const combinedGeography = [deal.location, deal.state].filter(Boolean).join(", ") || "Unknown";
  const geographyMatch =
    thesis.geography.length === 0 ||
    thesis.geography.some((geography) =>
      combinedGeography.toLowerCase().includes(geography.toLowerCase()),
    );
  const priceMatch =
    thesis.priceMin == null && thesis.priceMax == null
      ? true
      : deal.price != null &&
        (thesis.priceMin == null || deal.price >= thesis.priceMin) &&
        (thesis.priceMax == null || deal.price <= thesis.priceMax);
  const ebitdaMatch =
    thesis.ebitdaMin == null && thesis.ebitdaMax == null
      ? true
      : deal.ebitda != null &&
        (thesis.ebitdaMin == null || deal.ebitda >= thesis.ebitdaMin) &&
        (thesis.ebitdaMax == null || deal.ebitda <= thesis.ebitdaMax);
  const matched = [industryMatch, geographyMatch, priceMatch, ebitdaMatch].filter(Boolean).length;
  const scorePct = (matched / 4) * 100;
  const matchQuality: Quality = scorePct >= 80 ? "Strong" : scorePct >= 50 ? "Moderate" : "Weak";

  return {
    scorePct,
    matchQuality,
    deliveryEligible: matchQuality !== "Weak",
    criteriaDetails: [],
  };
}

function incrementQuality(counts: Record<Quality, number>, quality: Quality) {
  counts[quality] += 1;
}

async function latestSuccessfulDailyRun() {
  return unwrapSupabaseResult(
    await queryOne<LatestDailyRun>(
      `
        select id, cursor_start, cursor_end, summary_json
        from dfm_private.match_runs
        where run_type = 'daily'
          and status = 'succeeded'
          and cursor_start is not null
          and cursor_end is not null
        order by finished_at desc nulls last, created_at desc
        limit 1
      `,
    ),
  );
}

async function main() {
  const outputPath = process.env.SCORING_PREVIEW_OUTPUT_PATH ?? null;
  const run = await latestSuccessfulDailyRun();
  const activeAes = unwrapSupabaseResult(await listActiveAeTheses()) as ActiveAeRow[];
  const currentVersions = unwrapSupabaseResult(
    await listCurrentAeThesisVersions(activeAes.map((ae) => ae.id)),
  ) as ThesisVersionRow[];
  const currentVersionByAe = new Map(
    currentVersions.map((version) => [version.ae_thesis_id, version.normalized_payload]),
  );

  const [sourceDeals, submissions] = await Promise.all([
    fetchDealsInWindow({ cursorStart: run.cursor_start, cursorEnd: run.cursor_end }),
    fetchNewAeSubmissionsSince(null),
  ]);
  const deals = sourceDeals.map((deal) => enrichDealIndustry(normalizeDeal(deal)));
  const rebuiltByIdentity = rebuildSubmissionHistories(submissions);

  const totals = {
    baseline: { Strong: 0, Moderate: 0, Weak: 0 } as Record<Quality, number>,
    preview: { Strong: 0, Moderate: 0, Weak: 0 } as Record<Quality, number>,
    baselineDeliveries: 0,
    previewDeliveries: 0,
  };
  const missingCurrentVersion: string[] = [];
  const missingSubmissionHistory: string[] = [];
  const perAe: Array<Record<string, unknown>> = [];

  for (const ae of activeAes) {
    const currentThesis = currentVersionByAe.get(ae.id) ?? null;
    if (!currentThesis) {
      missingCurrentVersion.push(ae.ae_name);
      continue;
    }

    const rebuiltThesis = findRebuiltThesis(ae, rebuiltByIdentity);
    if (!rebuiltThesis) {
      missingSubmissionHistory.push(ae.ae_name);
      continue;
    }

    const minimum = normalizeDeliveryMinMatchQuality(ae.delivery_min_match_quality);
    const aeCounts = {
      baseline: { Strong: 0, Moderate: 0, Weak: 0 } as Record<Quality, number>,
      preview: { Strong: 0, Moderate: 0, Weak: 0 } as Record<Quality, number>,
      baselineDeliveries: 0,
      previewDeliveries: 0,
    };

    for (const deal of deals) {
      const baselineScore = scoreLegacy(deal, currentThesis);
      const previewScore = scoreDealAgainstThesis(deal, rebuiltThesis);
      incrementQuality(totals.baseline, baselineScore.matchQuality);
      incrementQuality(totals.preview, previewScore.matchQuality);
      incrementQuality(aeCounts.baseline, baselineScore.matchQuality);
      incrementQuality(aeCounts.preview, previewScore.matchQuality);

      if (shouldCreateClickupDeliveryJob(baselineScore.matchQuality, minimum)) {
        totals.baselineDeliveries += 1;
        aeCounts.baselineDeliveries += 1;
      }
      if (shouldCreateClickupDeliveryJob(previewScore.matchQuality, minimum)) {
        totals.previewDeliveries += 1;
        aeCounts.previewDeliveries += 1;
      }
    }

    perAe.push({
      aeName: ae.ae_name,
      minimum,
      hasClickupDestination: Boolean(ae.clickup_list_id),
      ...aeCounts,
    });
  }

  const comparedAes = perAe.length;
  const result = {
    generatedAt: new Date().toISOString(),
    mode: "read_only_full_scoring_shadow",
    sourceRun: {
      id: run.id,
      cursorStart: run.cursor_start,
      cursorEnd: run.cursor_end,
    },
    population: {
      deals: deals.length,
      activeAes: activeAes.length,
      comparedAes,
      evaluations: deals.length * comparedAes,
      thesisSubmissionRows: submissions.length,
    },
    coverage: {
      missingCurrentVersion,
      missingSubmissionHistory,
      complete: missingCurrentVersion.length === 0 && missingSubmissionHistory.length === 0,
    },
    totals: {
      ...totals,
      deliveryReduction: totals.baselineDeliveries - totals.previewDeliveries,
      deliveryReductionPct:
        totals.baselineDeliveries === 0
          ? 0
          : ((totals.baselineDeliveries - totals.previewDeliveries) / totals.baselineDeliveries) * 100,
    },
    perAe: perAe.sort(
      (a, b) => Number(b.baselineDeliveries) - Number(a.baselineDeliveries),
    ),
  };

  if (outputPath) {
    await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: result.generatedAt,
        mode: result.mode,
        sourceRun: result.sourceRun,
        population: result.population,
        coverage: {
          complete: result.coverage.complete,
          missingCurrentVersionCount: missingCurrentVersion.length,
          missingSubmissionHistoryCount: missingSubmissionHistory.length,
        },
        totals: result.totals,
        outputWritten: Boolean(outputPath),
      },
      null,
      2,
    ),
  );
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);

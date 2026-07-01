import { randomUUID } from "node:crypto";

import { enrichDealIndustry } from "@/lib/dfm/matching/deal-enricher";
import { normalizeDeal } from "@/lib/dfm/matching/deal-normalizer";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import { fetchDealsInWindow } from "@/lib/dfm/providers/airtable-client";
import { fetchNewAeSubmissionsSince } from "@/lib/dfm/providers/google-intake-client";
import { sendErrorNotification, sendSummaryNotification } from "@/lib/dfm/providers/notification-client";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { hoursAgo, toIsoString } from "@/lib/dfm/utils/dates";

type AeReport = {
  aeName: string;
  aeEmail?: string | null;
  clickupListId?: string | null;
  strongMatches: number;
  moderateMatches: number;
  totalMatched: number;
  matches: Array<{
    dealName: string;
    matchQuality: string;
    scorePct: number;
    location?: string | null;
    state?: string | null;
    price?: number | null;
    ebitda?: number | null;
    listingUrl?: string | null;
    criteriaDetails?: Array<{
      criterion: string;
      match: boolean;
      score: number;
      dealValue: string;
      thesisValue: string;
    }>;
  }>;
};

function dedupeLatestSubmissions(
  submissions: Awaited<ReturnType<typeof fetchNewAeSubmissionsSince>>,
) {
  const latestByKey = new Map<string, (typeof submissions)[number]>();

  for (const submission of submissions) {
    const normalized = normalizeAePayload(submission.payload);
    const key = (normalized.aeEmail ?? normalized.aeName).toLowerCase();
    const existing = latestByKey.get(key);
    if (!existing || submission.submittedAt > existing.submittedAt) {
      latestByKey.set(key, submission);
    }
  }

  return Array.from(latestByKey.values());
}

async function main() {
  const runId = randomUUID();
  const lookbackHours = Number(process.env.LIVE_TEST_LOOKBACK_HOURS ?? "24");
  const cursorStart = process.env.LIVE_TEST_CURSOR_START ?? toIsoString(hoursAgo(lookbackHours));
  const cursorEnd = process.env.LIVE_TEST_CURSOR_END ?? toIsoString(new Date());

  logInfo("Starting DFM live test", {
    runId,
    lookbackHours,
    cursorStart,
    cursorEnd,
  });

  try {
    const [deals, rawSubmissions] = await Promise.all([
      fetchDealsInWindow({ cursorStart, cursorEnd }),
      fetchNewAeSubmissionsSince(null),
    ]);

    const submissions = dedupeLatestSubmissions(rawSubmissions);
    const theses = submissions.map((submission) => ({
      submission,
      thesis: normalizeAePayload(submission.payload),
    }));

    const aeReportMap = new Map<string, AeReport>();

    for (const deal of deals) {
      const normalizedDeal = enrichDealIndustry(normalizeDeal(deal));
      for (const { thesis } of theses) {
        const score = scoreDealAgainstThesis(normalizedDeal, thesis);
        if (!score.deliveryEligible) {
          continue;
        }

        const report: AeReport = aeReportMap.get(thesis.aeEmail ?? thesis.aeName) ?? {
          aeName: thesis.aeName,
          aeEmail: thesis.aeEmail ?? null,
          clickupListId: null,
          strongMatches: 0,
          moderateMatches: 0,
          totalMatched: 0,
          matches: [],
        };

        if (score.matchQuality === "Strong") {
          report.strongMatches += 1;
        } else if (score.matchQuality === "Moderate") {
          report.moderateMatches += 1;
        }
        report.totalMatched += 1;
        report.matches.push({
          dealName: normalizedDeal.businessName,
          matchQuality: score.matchQuality,
          scorePct: score.scorePct,
          location: normalizedDeal.location ?? null,
          state: normalizedDeal.state ?? null,
          price: normalizedDeal.price ?? null,
          ebitda: normalizedDeal.ebitda ?? null,
          listingUrl: normalizedDeal.listingUrl ?? null,
          criteriaDetails: score.criteriaDetails,
        });
        aeReportMap.set(thesis.aeEmail ?? thesis.aeName, report);
      }
    }

    const summary = {
      mode: "live_test",
      runId,
      cursorStart,
      cursorEnd,
      fetchedDeals: deals.length,
      activeAes: theses.length,
      activeAesWithCurrentThesis: theses.length,
      aeEvaluations: deals.length * theses.length,
      normalizedDeals: deals.length,
      candidatesCreatedOrUpdated: Array.from(aeReportMap.values()).reduce(
        (sum, ae) => sum + ae.totalMatched,
        0,
      ),
      deliveryJobsCreatedOrEligible: 0,
      generatedAt: new Date().toISOString(),
      totalStrongMatches: Array.from(aeReportMap.values()).reduce((sum, ae) => sum + ae.strongMatches, 0),
      totalModerateMatches: Array.from(aeReportMap.values()).reduce(
        (sum, ae) => sum + ae.moderateMatches,
        0,
      ),
      aesWithMatches: Array.from(aeReportMap.values()).filter((ae) => ae.totalMatched > 0).length,
      aeReports: Array.from(aeReportMap.values())
        .map((ae) => ({
          ...ae,
          matches: ae.matches.sort((a, b) => b.scorePct - a.scorePct).slice(0, 25),
        }))
        .sort((a, b) => b.totalMatched - a.totalMatched),
    };

    logInfo("Sending DFM live test summary notification", {
      runId,
      strong: summary.totalStrongMatches,
      moderate: summary.totalModerateMatches,
      aesWithMatches: summary.aesWithMatches,
    });
    await sendSummaryNotification({ summary });
    logInfo("DFM live test summary notification sent", { runId });

    const outputPath = process.env.LIVE_TEST_OUTPUT_PATH;
    if (outputPath) {
      const serialized = JSON.stringify(summary, null, 2);
      await import("node:fs/promises").then((fs) => fs.writeFile(outputPath, serialized, "utf8"));
      logInfo("Wrote DFM live test output file", { runId, outputPath });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          deals: deals.length,
          theses: theses.length,
          strong: summary.totalStrongMatches,
          moderate: summary.totalModerateMatches,
          aesWithMatches: summary.aesWithMatches,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown live test error";
    logError("DFM live test failed", { runId, message });
    try {
      await sendErrorNotification({
        workflow: "live_test",
        runId,
        message,
        context: {
          cursorStart,
          cursorEnd,
        },
      });
    } catch {
      // Best effort only for the test harness.
    }
    throw error;
  }
}

void main();

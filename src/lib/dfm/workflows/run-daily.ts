import type { BaseRunResult, RunDailyInput } from "@/lib/dfm/domain/types";
import { listCurrentAeThesisVersions } from "@/lib/dfm/db/repositories/ae-thesis-versions";
import { listActiveAeTheses } from "@/lib/dfm/db/repositories/ae-theses";
import { upsertMatchCandidate } from "@/lib/dfm/db/repositories/match-candidates";
import { insertDeliveryJob } from "@/lib/dfm/db/repositories/delivery-jobs";
import { insertRawDealSnapshot, upsertNormalizedDeal } from "@/lib/dfm/db/repositories/deals";
import {
  createMatchRun,
  listOpenDailyRuns,
  updateMatchRunCursorWindow,
  updateMatchRunStatus,
} from "@/lib/dfm/db/repositories/match-runs";
import {
  advanceSyncCursorTimestampMonotonic,
  getSyncCursor,
  upsertSyncCursor,
} from "@/lib/dfm/db/repositories/sync-cursors";
import { enrichDealIndustry } from "@/lib/dfm/matching/deal-enricher";
import {
  normalizeDeliveryMinMatchQuality,
  shouldCreateClickupDeliveryJob,
} from "@/lib/dfm/matching/delivery-threshold";
import { normalizeDeal } from "@/lib/dfm/matching/deal-normalizer";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import { sendErrorNotification, sendSummaryNotification } from "@/lib/dfm/providers/notification-client";
import { fetchDealsInWindow } from "@/lib/dfm/providers/airtable-client";
import { hoursAgo, toIsoString } from "@/lib/dfm/utils/dates";
import { buildClickupDedupeKey } from "@/lib/dfm/utils/idempotency";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";
import { finalizeDailyRunsWorkflow } from "@/lib/dfm/workflows/finalize-daily-runs";
import { processClickupJobsWorkflow } from "@/lib/dfm/workflows/process-clickup-jobs";

type AeReport = {
  aeName: string;
  aeEmail?: string | null;
  clickupListId?: string | null;
  deliveryMinMatchQuality?: string;
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
    multiple?: number | null;
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

const INLINE_CLICKUP_JOB_LIMIT = 1000;

function asOpenRunArray(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = (value as { runs?: unknown }).runs;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}

export async function runDailyWorkflow(input: RunDailyInput): Promise<BaseRunResult> {
  if (!input.force) {
    await finalizeDailyRunsWorkflow({
      skipNotifications: input.skipNotifications,
    });

    const openRunsResult = await listOpenDailyRuns();
    if (openRunsResult.error) {
      throw new Error(openRunsResult.error.message);
    }

    const openRuns = asOpenRunArray(openRunsResult.data);
    if (openRuns.length > 0) {
      const blockingRunIds = openRuns.map((run) => String(run.id)).join(", ");
      throw new Error(`Cannot start a new daily run while unresolved daily runs exist: ${blockingRunIds}`);
    }
  }

  const runRecord = unwrapSupabaseResult(
    await createMatchRun({
      runType: "daily",
      triggerSource: "vercel_cron",
      triggerPayload: input,
      lockKey: "dfm:daily",
    }),
  );

  const runId = runRecord.id as string;
  logInfo("Starting daily DFM workflow", { runId, input });

  try {
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "running"));

    const existingCursorResult = await getSyncCursor("airtable_daily_deals");
    if (existingCursorResult.error) {
      throw new Error(existingCursorResult.error.message);
    }

    const existingCursor = existingCursorResult.data;
    const cursorStart =
      input.cursorStartOverride ??
      existingCursor?.cursor_timestamp ??
      toIsoString(hoursAgo(24));
    const cursorEnd = input.cursorEndOverride ?? toIsoString(new Date());
    const recoverableStartedSummary = {
      mode: "daily",
      dryRun: input.dryRun ?? false,
      cursorStart,
      cursorEnd,
      generatedAt: new Date().toISOString(),
      recoveryState: "started_before_matching",
    };

    unwrapSupabaseResult(
      await updateMatchRunCursorWindow(runId, {
        cursorStart,
        cursorEnd,
        summaryJson: recoverableStartedSummary,
      }),
    );

    const deals = await fetchDealsInWindow({
      cursorStart,
      cursorEnd,
    });

    const activeAes = unwrapSupabaseResult(await listActiveAeTheses());
    const currentVersions = activeAes.length
      ? unwrapSupabaseResult(
          await listCurrentAeThesisVersions(activeAes.map((ae) => String(ae.id))),
        )
      : [];
    const currentVersionMap = new Map(
      currentVersions.map((version) => [String(version.ae_thesis_id), version]),
    );
    const aeReportMap = new Map<string, AeReport>();
    let normalizedDealsCount = 0;
    let candidatesCount = 0;
    let deliveryJobsCount = 0;
    let aeEvaluations = 0;

    for (const deal of deals) {
      const rawDeal = unwrapSupabaseResult(
        await insertRawDealSnapshot({
          airtableRecordId: deal.airtableRecordId,
          sourceHash: `${deal.airtableRecordId}:${deal.sourceUpdatedAt ?? deal.sourceCreatedAt ?? "unknown"}`,
          rawPayload: deal.rawPayload,
          sourceCreatedAt: deal.sourceCreatedAt,
          sourceUpdatedAt: deal.sourceUpdatedAt,
        }),
      );

      const normalizedDeal = enrichDealIndustry(normalizeDeal(deal));
      const normalizedDealRecord = unwrapSupabaseResult(
        await upsertNormalizedDeal({
          airtableRecordId: normalizedDeal.airtableRecordId,
          currentRawId: String(rawDeal.id),
          businessName: normalizedDeal.businessName,
          industry: normalizedDeal.industry ?? null,
          location: normalizedDeal.location ?? null,
          state: normalizedDeal.state ?? null,
          price: normalizedDeal.price ?? null,
          ebitda: normalizedDeal.ebitda ?? null,
          multiple: normalizedDeal.multiple ?? null,
          listingUrl: normalizedDeal.listingUrl ?? null,
          description: normalizedDeal.description ?? null,
          sourceCreatedAt: normalizedDeal.sourceCreatedAt ?? null,
          sourceUpdatedAt: normalizedDeal.sourceUpdatedAt ?? null,
        }),
      );
      normalizedDealsCount += 1;

      for (const ae of activeAes) {
        const currentVersion = currentVersionMap.get(String(ae.id));
        if (!currentVersion) {
          continue;
        }

        const normalizedThesis = currentVersion.normalized_payload as {
          aeName: string;
          aeEmail?: string | null;
          industries: string[];
          geography: string[];
          priceMin?: number | null;
          priceMax?: number | null;
          ebitdaMin?: number | null;
          ebitdaMax?: number | null;
          summary: string;
          normalizationVersion: string;
        };
        const score = scoreDealAgainstThesis(normalizedDeal, normalizedThesis);
        const candidate = unwrapSupabaseResult(
          await upsertMatchCandidate({
            aeThesisId: String(ae.id),
            dealId: String(normalizedDealRecord.id),
            lastRunId: runId,
            scorePct: score.scorePct,
            matchQuality: score.matchQuality,
            criteriaDetails: { criteria: score.criteriaDetails },
            deliveryEligible: score.deliveryEligible,
          }),
        );
        candidatesCount += 1;
        aeEvaluations += 1;

        if (score.deliveryEligible) {
          const report: AeReport = aeReportMap.get(String(ae.id)) ?? {
            aeName: String(ae.ae_name),
            aeEmail: typeof ae.ae_email === "string" ? ae.ae_email : null,
            clickupListId: typeof ae.clickup_list_id === "string" ? ae.clickup_list_id : null,
            deliveryMinMatchQuality: normalizeDeliveryMinMatchQuality(ae.delivery_min_match_quality),
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
            multiple: normalizedDeal.multiple ?? null,
            listingUrl: normalizedDeal.listingUrl ?? null,
            criteriaDetails: score.criteriaDetails,
          });
          aeReportMap.set(String(ae.id), report);
        }

        const qualityAllowedForDelivery =
          score.deliveryEligible &&
          shouldCreateClickupDeliveryJob(score.matchQuality, ae.delivery_min_match_quality);

        if (qualityAllowedForDelivery && ae.clickup_list_id) {
          if (!input.dryRun) {
            unwrapSupabaseResult(
              await insertDeliveryJob({
                runId,
                aeThesisId: String(ae.id),
                dealId: String(normalizedDealRecord.id),
                matchCandidateId: String(candidate.id),
                clickupListId: String(ae.clickup_list_id),
                dedupeKey: buildClickupDedupeKey(String(ae.id), String(normalizedDealRecord.id)),
              }),
            );
          }
          deliveryJobsCount += 1;
        } else if (qualityAllowedForDelivery) {
          deliveryJobsCount += 1;
        }
      }
    }

    const summary = {
      mode: "daily",
      dryRun: input.dryRun ?? false,
      cursorStart,
      cursorEnd,
      fetchedDeals: deals.length,
      activeAes: activeAes.length,
      activeAesWithCurrentThesis: currentVersions.length,
      aeEvaluations,
      normalizedDeals: normalizedDealsCount,
      candidatesCreatedOrUpdated: candidatesCount,
      deliveryJobsCreatedOrEligible: deliveryJobsCount,
      generatedAt: new Date().toISOString(),
      totalStrongMatches: Array.from(aeReportMap.values()).reduce((sum, ae) => sum + ae.strongMatches, 0),
      totalModerateMatches: Array.from(aeReportMap.values()).reduce((sum, ae) => sum + ae.moderateMatches, 0),
      aesWithMatches: Array.from(aeReportMap.values()).filter((ae) => ae.totalMatched > 0).length,
      aeReports: Array.from(aeReportMap.values()).sort((a, b) => b.totalMatched - a.totalMatched),
    };

    if (!input.dryRun) {
      if (deliveryJobsCount === 0) {
        Object.assign(summary, {
          clickupDelivery: {
            claimed: 0,
            sent: 0,
            retryScheduled: 0,
            terminal: 0,
            workerRunId: null,
            mode: "no_delivery_jobs",
          },
        });

        await advanceSyncCursorTimestampMonotonic("airtable_daily_deals", {
          cursorTimestamp: cursorEnd,
          metadata: {
            lastRunId: runId,
            fetchedDeals: deals.length,
            clickupWorkerRunId: null,
          },
        });
      } else if (input.deferDelivery) {
        Object.assign(summary, {
          clickupDelivery: {
            claimed: 0,
            sent: 0,
            retryScheduled: 0,
            terminal: 0,
            workerRunId: null,
            mode: "deferred_queue",
            pending: deliveryJobsCount,
          },
        });

        unwrapSupabaseResult(await updateMatchRunStatus(runId, "partial", summary));
        logInfo("Daily DFM workflow queued ClickUp delivery for deferred worker drain", {
          runId,
          deliveryJobsCount,
          cursorEnd,
        });

        return {
          ok: true,
          runId,
          status: "partial",
          summary,
        };
      } else {
        const deliveryResult = await processClickupJobsWorkflow({
          workerId: "daily-inline",
          maxJobs: INLINE_CLICKUP_JOB_LIMIT,
          dryRun: false,
          strictFailure: true,
          skipNotifications: input.skipNotifications,
        });

        if (deliveryResult.claimed >= INLINE_CLICKUP_JOB_LIMIT) {
          throw new Error(
            `Inline ClickUp delivery hit the ${INLINE_CLICKUP_JOB_LIMIT} job safety limit before draining the queue`,
          );
        }

        Object.assign(summary, {
          clickupDelivery: {
            claimed: deliveryResult.claimed,
            sent: deliveryResult.sent,
            retryScheduled: deliveryResult.retryScheduled,
            terminal: deliveryResult.terminal,
            workerRunId: deliveryResult.runId,
            mode: "inline_strict",
          },
        });

        await advanceSyncCursorTimestampMonotonic("airtable_daily_deals", {
          cursorTimestamp: cursorEnd,
          metadata: {
            lastRunId: runId,
            fetchedDeals: deals.length,
            clickupWorkerRunId: deliveryResult.runId,
          },
        });
      }
    }

    unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", summary));
    if (!input.skipNotifications) {
      try {
        await sendSummaryNotification({
          summary,
        });
      } catch (notificationError) {
        logError("Failed to send daily workflow summary notification", {
          runId,
          notificationError:
            notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
    }

    return {
      ok: true,
      runId,
      status: "succeeded",
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily workflow error";
    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", undefined, {
        message,
      }),
    );
    if (!input.skipNotifications) {
      try {
        await sendErrorNotification({
          workflow: "daily",
          runId,
          message,
          context: {
            input,
          },
        });
      } catch (notificationError) {
        logError("Failed to send daily workflow error notification", {
          runId,
          notificationError:
            notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
    }
    throw error;
  }
}

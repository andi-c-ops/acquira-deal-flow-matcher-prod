import {
  getDeliveryJobIntegrityByRunId,
  listDeliveredMatchRowsByRunId,
  listDeliveryJobStatusCountsByRunId,
} from "@/lib/dfm/db/repositories/delivery-jobs";
import {
  getMatchRunById,
  listPartialDailyRuns,
  listStaleRunningDailyRuns,
  updateMatchRunStatus,
} from "@/lib/dfm/db/repositories/match-runs";
import { advanceSyncCursorTimestampMonotonic } from "@/lib/dfm/db/repositories/sync-cursors";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import {
  sendErrorNotification,
  sendSummaryNotification,
} from "@/lib/dfm/providers/notification-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

type FinalizeDailyRunsInput = {
  skipNotifications?: boolean;
  staleRunningCutoffMs?: number;
};

type DeliveryCounts = Record<string, number>;
type CriteriaDetail = {
  criterion: string;
  match: boolean;
  score: number;
  dealValue: string;
  thesisValue: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toDeliveryCounts(rows: Array<{ status: string; count: number | string }>): DeliveryCounts {
  return rows.reduce<DeliveryCounts>((acc, row) => {
    acc[row.status] = Number(row.count ?? 0);
    return acc;
  }, {});
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (value && typeof value === "object" && "toISOString" in value) {
    const candidate = value as { toISOString?: () => string };
    if (typeof candidate.toISOString === "function") {
      return candidate.toISOString();
    }
  }

  return null;
}

function readSummaryCursor(summary: Record<string, unknown>, run: Record<string, unknown>, key: string) {
  const summaryValue = summary[key];
  if (typeof summaryValue === "string" && summaryValue.length > 0) {
    return summaryValue;
  }

  const runKey = key === "cursorStart" ? "cursor_start" : "cursor_end";
  return readIsoTimestamp(run[runKey]);
}

function normalizeCriteriaDetails(value: unknown): CriteriaDetail[] {
  const candidate = asObject(value);
  const details = Array.isArray(candidate.criteria) ? candidate.criteria : Array.isArray(value) ? value : [];

  return details
    .map((detail) => asObject(detail))
    .map((detail) => ({
      criterion: String(detail.criterion ?? ""),
      match: detail.match === true,
      score: toNumber(detail.score),
      dealValue: String(detail.dealValue ?? ""),
      thesisValue: String(detail.thesisValue ?? ""),
    }))
    .filter((detail) => detail.criterion.length > 0);
}

async function buildSummaryFromDeliveredJobs(
  runId: string,
  run: Record<string, unknown>,
  existingSummary: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const deliveredRows = unwrapSupabaseResult(await listDeliveredMatchRowsByRunId(runId)) as Array<
    Record<string, unknown>
  >;
  const aeReports = new Map<
    string,
    {
      aeName: string;
      aeEmail?: string | null;
      clickupListId?: string | null;
      deliveryMinMatchQuality?: string;
      strongMatches: number;
      moderateMatches: number;
      totalMatched: number;
      matches: Array<Record<string, unknown>>;
    }
  >();
  const dealIds = new Set<string>();

  for (const row of deliveredRows) {
    const aeId = String(row.ae_thesis_id);
    const matchQuality = typeof row.match_quality === "string" ? row.match_quality : "Moderate";
    const report = aeReports.get(aeId) ?? {
      aeName: String(row.ae_name ?? "Unknown AE"),
      aeEmail: typeof row.ae_email === "string" ? row.ae_email : null,
      clickupListId: typeof row.clickup_list_id === "string" ? row.clickup_list_id : null,
      deliveryMinMatchQuality:
        typeof row.delivery_min_match_quality === "string" ? row.delivery_min_match_quality : "Moderate",
      strongMatches: 0,
      moderateMatches: 0,
      totalMatched: 0,
      matches: [],
    };

    if (matchQuality === "Strong") {
      report.strongMatches += 1;
    } else if (matchQuality === "Moderate") {
      report.moderateMatches += 1;
    }
    report.totalMatched += 1;
    report.matches.push({
      dealName: String(row.business_name ?? "Untitled Deal"),
      matchQuality,
      scorePct: toNumber(row.score_pct),
      location: typeof row.location === "string" ? row.location : null,
      state: typeof row.state === "string" ? row.state : null,
      price: row.price == null ? null : toNumber(row.price),
      ebitda: row.ebitda == null ? null : toNumber(row.ebitda),
      multiple: row.multiple == null ? null : toNumber(row.multiple),
      listingUrl: typeof row.listing_url === "string" ? row.listing_url : null,
      criteriaDetails: normalizeCriteriaDetails(row.criteria_details),
    });
    aeReports.set(aeId, report);

    if (row.deal_id) {
      dealIds.add(String(row.deal_id));
    }
  }

  const reports = Array.from(aeReports.values()).sort((a, b) => b.totalMatched - a.totalMatched);
  return {
    ...existingSummary,
    mode: typeof existingSummary.mode === "string" ? existingSummary.mode : "daily",
    cursorStart: readSummaryCursor(existingSummary, run, "cursorStart"),
    cursorEnd: readSummaryCursor(existingSummary, run, "cursorEnd"),
    fetchedDeals: toNumber(existingSummary.fetchedDeals ?? dealIds.size),
    generatedAt:
      typeof existingSummary.generatedAt === "string"
        ? existingSummary.generatedAt
        : new Date().toISOString(),
    totalStrongMatches: reports.reduce((sum, ae) => sum + ae.strongMatches, 0),
    totalModerateMatches: reports.reduce((sum, ae) => sum + ae.moderateMatches, 0),
    aesWithMatches: reports.filter((ae) => ae.totalMatched > 0).length,
    aeReports: reports,
  };
}

function staleCutoffIso(input: FinalizeDailyRunsInput) {
  const cutoffMs = input.staleRunningCutoffMs ?? 6 * 60 * 60 * 1000;
  return new Date(Date.now() - cutoffMs).toISOString();
}

async function recoverStaleRunningDailyRuns(input: FinalizeDailyRunsInput) {
  const staleRunsResult = await listStaleRunningDailyRuns(staleCutoffIso(input));
  if (staleRunsResult.error) {
    throw new Error(staleRunsResult.error.message);
  }

  const staleRuns = Array.isArray(staleRunsResult.data?.runs)
    ? (staleRunsResult.data.runs as Array<Record<string, unknown>>)
    : [];

  let recovered = 0;
  let stillUnsafe = 0;
  let resumedAsPartial = 0;

  for (const staleRun of staleRuns) {
    const runId = String(staleRun.id);
    const existingSummary = asObject(staleRun.summary_json);
    const cursorEnd = readSummaryCursor(existingSummary, staleRun, "cursorEnd");
    const integrity = unwrapSupabaseResult(await getDeliveryJobIntegrityByRunId(runId)) as Record<
      string,
      unknown
    >;
    const jobs = toNumber(integrity.jobs);
    const receipts = toNumber(integrity.receipts);
    const distinctTaskIds = toNumber(integrity.distinct_task_ids);
    const nonSent = toNumber(integrity.non_sent);
    const recoveredAt = new Date().toISOString();
    const baseSummary = await buildSummaryFromDeliveredJobs(runId, staleRun, existingSummary);
    const summary: Record<string, unknown> = {
      ...baseSummary,
      recoveryState: "stale_running_recovered",
      recoveredAt,
      originalStartedAt: staleRun.started_at ?? null,
      originalCreatedAt: staleRun.created_at ?? null,
      clickupDelivery: {
        mode: "stale_running_integrity_check",
        jobs,
        receipts,
        distinctTaskIds,
        nonSent,
      },
    };

    if (jobs > 0 && cursorEnd && nonSent > 0) {
      unwrapSupabaseResult(await updateMatchRunStatus(runId, "partial", summary));
      resumedAsPartial += 1;
      logInfo("Stale daily run recovered as partial for worker drain", {
        runId,
        jobs,
        receipts,
        distinctTaskIds,
        nonSent,
      });
      continue;
    }

    if (jobs > 0 && cursorEnd && receipts === jobs && receipts === distinctTaskIds && nonSent === 0) {
      await advanceSyncCursorTimestampMonotonic("airtable_daily_deals", {
        cursorTimestamp: cursorEnd,
        metadata: {
          lastRunId: runId,
          fetchedDeals: summary.fetchedDeals ?? null,
          finalizedAt: recoveredAt,
          recoveredFrom: "stale_running",
        },
      });

      unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", summary));
      recovered += 1;

      if (!input.skipNotifications) {
        try {
          await sendSummaryNotification({
            summary,
          });
        } catch (notificationError) {
          logError("Failed to send stale daily recovery summary notification", {
            runId,
            notificationError:
              notificationError instanceof Error ? notificationError.message : String(notificationError),
          });
        }
      }
      continue;
    }

    if (nonSent > 0 || receipts !== jobs || receipts !== distinctTaskIds) {
      stillUnsafe += 1;
      logInfo("Stale daily run is not safe to auto-clear yet", {
        runId,
        jobs,
        receipts,
        distinctTaskIds,
        nonSent,
      });
      continue;
    }

    const failedSummary = {
      ...summary,
      recoveredAt,
      cursorPolicy:
        "Cursor was not advanced. The next daily run must restart from the last successful cursor and rely on delivery dedupe.",
    };
    const message =
      "Daily run became stale while running and had no summary cursor. Marked failed without advancing cursor so the next run can safely replay from the last successful cursor.";

    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", failedSummary, {
        message,
      }),
    );
    recovered += 1;

    if (!input.skipNotifications) {
      try {
        await sendErrorNotification({
          workflow: "daily_stale_recovery",
          runId,
          message,
          context: {
            summary: failedSummary,
          },
        });
      } catch (notificationError) {
        logError("Failed to send stale daily recovery notification", {
          runId,
          notificationError:
            notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
    }
  }

  return {
    recovered,
    stillUnsafe,
    resumedAsPartial,
    staleRunsSeen: staleRuns.length,
  };
}

export async function finalizeDailyRunsWorkflow(input: FinalizeDailyRunsInput = {}) {
  const staleRunningRecovery = await recoverStaleRunningDailyRuns(input);
  const partialRunsResult = await listPartialDailyRuns();
  if (partialRunsResult.error) {
    throw new Error(partialRunsResult.error.message);
  }

  const partialRuns = Array.isArray(partialRunsResult.data?.runs)
    ? (partialRunsResult.data.runs as Array<Record<string, unknown>>)
    : [];

  let finalized = 0;
  let failed = 0;
  let stillPending = 0;

  for (const partialRun of partialRuns) {
    const runId = String(partialRun.id);
    const runRecord = unwrapSupabaseResult(await getMatchRunById(runId));
    const summary = await buildSummaryFromDeliveredJobs(runId, runRecord, asObject(runRecord.summary_json));
    const triggerPayload = asObject(runRecord.trigger_payload);
    const suppressSummaryNotification =
      summary.suppressSummaryNotification === true ||
      triggerPayload.suppressSummaryNotification === true ||
      triggerPayload.skipNotifications === true;
    const counts = toDeliveryCounts(
      unwrapSupabaseResult(await listDeliveryJobStatusCountsByRunId(runId)) as Array<{
        status: string;
        count: number | string;
      }>,
    );

    const sent = counts.sent ?? 0;
    const pending = counts.pending ?? 0;
    const processing = counts.processing ?? 0;
    const retryScheduled = counts.retry_scheduled ?? 0;
    const terminal = counts.failed_terminal ?? 0;
    const cancelled = counts.cancelled ?? 0;
    const totalJobs = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const nextSummary = {
      ...summary,
      clickupDelivery: {
        mode: "deferred_worker",
        sent,
        pending,
        processing,
        retryScheduled,
        terminal,
        cancelled,
        totalJobs,
      },
    };

    if (pending > 0 || processing > 0 || retryScheduled > 0) {
      stillPending += 1;
      logInfo("Daily run still waiting on ClickUp delivery drain", {
        runId,
        sent,
        pending,
        processing,
        retryScheduled,
      });
      continue;
    }

    if (terminal > 0) {
      unwrapSupabaseResult(
        await updateMatchRunStatus(runId, "failed", nextSummary, {
          message: `Daily run has ${terminal} terminal ClickUp delivery failures`,
        }),
      );
      failed += 1;

      if (!input.skipNotifications) {
        try {
          await sendErrorNotification({
            workflow: "daily_finalize",
            runId,
            message: `Daily run has ${terminal} terminal ClickUp delivery failures`,
            context: {
              summary: nextSummary,
            },
          });
        } catch (notificationError) {
          logError("Failed to send daily finalization error notification", {
            runId,
            notificationError:
              notificationError instanceof Error ? notificationError.message : String(notificationError),
          });
        }
      }
      continue;
    }

    const cursorEnd =
      typeof summary.cursorEnd === "string" && summary.cursorEnd.length > 0 ? summary.cursorEnd : null;

    if (!cursorEnd) {
      throw new Error(`Daily run ${runId} cannot be finalized because summary.cursorEnd is missing`);
    }

    await advanceSyncCursorTimestampMonotonic("airtable_daily_deals", {
      cursorTimestamp: cursorEnd,
      metadata: {
        lastRunId: runId,
        fetchedDeals: summary.fetchedDeals ?? null,
        finalizedAt: new Date().toISOString(),
      },
    });

    unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", nextSummary));
    finalized += 1;

    if (!input.skipNotifications && !suppressSummaryNotification) {
      try {
        await sendSummaryNotification({
          summary: nextSummary,
        });
        Object.assign(nextSummary, {
          reportEmail: {
            status: "sent",
            attemptedAt: new Date().toISOString(),
          },
        });
        unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", nextSummary));
      } catch (notificationError) {
        const message = notificationError instanceof Error ? notificationError.message : String(notificationError);
        Object.assign(nextSummary, {
          reportEmail: {
            status: "failed",
            attemptedAt: new Date().toISOString(),
            error: message,
          },
        });
        unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", nextSummary));
        logError("Failed to send deferred daily summary notification", {
          runId,
          notificationError: message,
        });
      }
    }
  }

  return {
    finalized,
    failed,
    stillPending,
    partialRunsSeen: partialRuns.length,
    staleRunningRecovery,
  };
}

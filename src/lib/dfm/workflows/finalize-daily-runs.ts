import {
  getDeliveryJobIntegrityByRunId,
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

  for (const staleRun of staleRuns) {
    const runId = String(staleRun.id);
    const integrity = unwrapSupabaseResult(await getDeliveryJobIntegrityByRunId(runId)) as Record<
      string,
      unknown
    >;
    const jobs = toNumber(integrity.jobs);
    const receipts = toNumber(integrity.receipts);
    const distinctTaskIds = toNumber(integrity.distinct_task_ids);
    const nonSent = toNumber(integrity.non_sent);

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

    const recoveredAt = new Date().toISOString();
    const summary = {
      mode: "stale_running_recovery",
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
      cursorPolicy:
        "Cursor was not advanced. The next daily run must restart from the last successful cursor and rely on delivery dedupe.",
    };
    const message =
      "Daily run became stale while running and had no summary cursor. Marked failed without advancing cursor so the next run can safely replay from the last successful cursor.";

    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", summary, {
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
            summary,
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
    const summary = asObject(runRecord.summary_json);
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
      } catch (notificationError) {
        logError("Failed to send deferred daily summary notification", {
          runId,
          notificationError:
            notificationError instanceof Error ? notificationError.message : String(notificationError),
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

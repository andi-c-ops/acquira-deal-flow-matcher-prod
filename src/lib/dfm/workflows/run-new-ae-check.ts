import type { BaseRunResult, RunNewAeCheckInput } from "@/lib/dfm/domain/types";
import { createMatchRun, updateMatchRunStatus } from "@/lib/dfm/db/repositories/match-runs";
import { getSyncCursor, upsertSyncCursor } from "@/lib/dfm/db/repositories/sync-cursors";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import { sendErrorNotification } from "@/lib/dfm/providers/notification-client";
import { fetchNewAeSubmissionWindow } from "@/lib/dfm/providers/google-intake-client";
import { hoursAgo, toIsoString } from "@/lib/dfm/utils/dates";
import { runNewAeBackfillWorkflow } from "@/lib/dfm/workflows/run-new-ae-backfill";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

export async function runNewAeCheckWorkflow(input: RunNewAeCheckInput): Promise<BaseRunResult> {
  const runRecord = unwrapSupabaseResult(
    await createMatchRun({
      runType: "new_ae_backfill",
      triggerSource: "vercel_cron",
      triggerPayload: input,
      lockKey: "dfm:new-ae-check",
    }),
  );

  const runId = String(runRecord.id);
  logInfo("Starting new AE daily check workflow", { runId, input });

  try {
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "running"));

    const cursorResult = await getSyncCursor("google_new_ae_submission");
    if (cursorResult.error) {
      throw new Error(cursorResult.error.message);
    }

    const cursor = cursorResult.data;
    const lookbackStart = cursor?.cursor_timestamp ?? toIsoString(hoursAgo(24));
    const submissionWindow = await fetchNewAeSubmissionWindow(lookbackStart);
    const submissions = submissionWindow.submissions;
    let processed = 0;
    let latestTimestamp = cursor?.cursor_timestamp ?? null;

    if (!input.dryRun) {
      for (const submission of submissions) {
        await runNewAeBackfillWorkflow({
          source: "google_sheets_daily_check",
          submissionKey: submission.submissionKey,
          submittedAt: submission.submittedAt,
          payload: submission.payload,
        });
        processed += 1;
        latestTimestamp = submission.submittedAt;
      }
    } else {
      latestTimestamp = submissions.at(-1)?.submittedAt ?? latestTimestamp;
    }

    if (!input.dryRun && latestTimestamp) {
      unwrapSupabaseResult(
        await upsertSyncCursor("google_new_ae_submission", {
          cursorTimestamp: latestTimestamp,
          metadata: {
            lastRunId: runId,
            processed,
          },
        }),
      );
    }

    const summary = {
      mode: "new_ae_daily_check",
      dryRun: input.dryRun ?? false,
      lookbackStart,
      sheetDiagnostics: submissionWindow.diagnostics,
      submissionsFound: submissions.length,
      submissionsProcessed: processed,
      submissionsWouldProcess: input.dryRun ? submissions.length : undefined,
      lastSubmissionTimestamp: latestTimestamp,
    };
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", summary));

    return {
      ok: true,
      runId,
      status: "succeeded",
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown new AE check workflow error";
    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", undefined, {
        message,
      }),
    );
    try {
      await sendErrorNotification({
        workflow: "new_ae_daily_check",
        runId,
        message,
        context: {
          input,
        },
      });
    } catch (notificationError) {
      logError("Failed to send new AE daily check error notification", {
        runId,
        notificationError:
          notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }
    throw error;
  }
}

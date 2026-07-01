import type { BaseRunResult, ProcessClickupJobsInput } from "@/lib/dfm/domain/types";
import { getAeThesisById } from "@/lib/dfm/db/repositories/ae-theses";
import { getMatchCandidateById } from "@/lib/dfm/db/repositories/match-candidates";
import {
  getDeliveryJobById,
  listPendingDeliveryJobs,
  updateDeliveryJobStatus,
} from "@/lib/dfm/db/repositories/delivery-jobs";
import { getNormalizedDealById } from "@/lib/dfm/db/repositories/deals";
import { createMatchRun, updateMatchRunStatus } from "@/lib/dfm/db/repositories/match-runs";
import {
  getDeliveryReceiptByJobId,
  insertDeliveryReceipt,
} from "@/lib/dfm/db/repositories/delivery-receipts";
import { classifyDeliveryFailure } from "@/lib/dfm/jobs/classify-delivery-failure";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import { createClickupDealTask } from "@/lib/dfm/providers/clickup-client";
import { sendErrorNotification } from "@/lib/dfm/providers/notification-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";
import { finalizeDailyRunsWorkflow } from "@/lib/dfm/workflows/finalize-daily-runs";

function formatKeyMetrics(input: {
  industry?: string | null;
  location?: string | null;
  state?: string | null;
  price?: number | string | null;
  ebitda?: number | string | null;
}) {
  return [
    input.industry ? `Industry: ${input.industry}` : null,
    input.location || input.state
      ? `Location: ${[input.location, input.state].filter(Boolean).join(", ")}`
      : null,
    input.price != null ? `Asking Price: ${String(input.price)}` : null,
    input.ebitda != null ? `Cash Flow: ${String(input.ebitda)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function coerceNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildClickupDealDescription(input: {
  aeName: string;
  dealName: string;
  matchQuality: string;
  scorePct?: number | string | null;
  industry?: string | null;
  location?: string | null;
  state?: string | null;
  price?: number | string | null;
  ebitda?: number | string | null;
  listingUrl?: string | null;
}) {
  const keyMetrics = formatKeyMetrics(input);

  return [
    "Deal Name",
    input.dealName,
    "",
    "Link",
    input.listingUrl ?? "N/A",
    "",
    "Key Metrics",
    keyMetrics || "N/A",
    "",
    "Match Summary",
    `AE: ${input.aeName}`,
    `Match Quality: ${input.matchQuality}`,
    input.scorePct != null ? `Score: ${String(input.scorePct)}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function processClickupJobsWorkflow(
  input: ProcessClickupJobsInput,
): Promise<
  BaseRunResult & {
    claimed: number;
    sent: number;
    retryScheduled: number;
    terminal: number;
  }
> {
  const runRecord = unwrapSupabaseResult(
    await createMatchRun({
      runType: "reconciliation",
      triggerSource: "internal_worker",
      triggerPayload: input,
      lockKey: "dfm:clickup-worker",
    }),
  );
  const runId = runRecord.id as string;
  try {
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "running"));
    logInfo("Starting ClickUp job processing workflow", { runId, input });

    const jobs = unwrapSupabaseResult(await listPendingDeliveryJobs(input.maxJobs ?? 10));
    let sent = 0;
    let retryScheduled = 0;
    let terminal = 0;

    for (const job of jobs) {
      const jobId = String(job.id);

      if (input.dryRun) {
        continue;
      }

      try {
        unwrapSupabaseResult(
          await updateDeliveryJobStatus(jobId, "processing", {
            claimed_by: input.workerId,
            claimed_at: new Date().toISOString(),
          }),
        );

        const existingReceiptResult = await getDeliveryReceiptByJobId(jobId);
        if (existingReceiptResult.error) {
          throw new Error(existingReceiptResult.error.message);
        }
        if (existingReceiptResult.data) {
          unwrapSupabaseResult(
            await updateDeliveryJobStatus(jobId, "sent", {
              sent_at: existingReceiptResult.data.sent_at ?? new Date().toISOString(),
            }),
          );
          sent += 1;
          continue;
        }

        const freshJob = unwrapSupabaseResult(await getDeliveryJobById(jobId));
        const ae = unwrapSupabaseResult(await getAeThesisById(String(freshJob.ae_thesis_id)));
        const deal = unwrapSupabaseResult(await getNormalizedDealById(String(freshJob.deal_id)));
        const candidate =
          freshJob.match_candidate_id != null
            ? unwrapSupabaseResult(await getMatchCandidateById(String(freshJob.match_candidate_id)))
            : null;

        const description = buildClickupDealDescription({
          aeName: String(ae.ae_name),
          dealName: String(deal.business_name),
          matchQuality: candidate ? String(candidate.match_quality) : "Moderate",
          scorePct: candidate ? candidate.score_pct : "Unknown",
          industry: typeof deal.industry === "string" ? deal.industry : null,
          location: typeof deal.location === "string" ? deal.location : null,
          state: typeof deal.state === "string" ? deal.state : null,
          price: deal.price,
          ebitda: deal.ebitda,
          listingUrl: typeof deal.listing_url === "string" ? deal.listing_url : null,
        });

        const task = await createClickupDealTask({
          aeName: String(ae.ae_name),
          dealName: String(deal.business_name),
          matchQuality: candidate ? String(candidate.match_quality) : "Moderate",
          scorePct: candidate ? Number(candidate.score_pct) : 0,
          description,
          clickupListId: String(job.clickup_list_id),
          businessDescription: typeof deal.description === "string" ? deal.description : null,
          cashFlow: coerceNumericValue(deal.ebitda),
          dealLink: typeof deal.listing_url === "string" ? deal.listing_url : null,
          industry: typeof deal.industry === "string" ? deal.industry : null,
          location: typeof deal.location === "string" ? deal.location : null,
          multiple: coerceNumericValue(deal.multiple),
          purchasePrice: coerceNumericValue(deal.price),
          state: typeof deal.state === "string" ? deal.state : null,
          dryRun: input.dryRun,
        });

        unwrapSupabaseResult(
          await insertDeliveryReceipt({
            jobId,
            clickupTaskId: task.taskId,
            clickupTaskUrl: task.taskUrl,
            providerResponseJson: task.providerResponse,
          }),
        );

        unwrapSupabaseResult(
          await updateDeliveryJobStatus(jobId, "sent", {
            sent_at: new Date().toISOString(),
          }),
        );
        sent += 1;
      } catch (error) {
        const classification = classifyDeliveryFailure(error);
        if (input.strictFailure) {
          unwrapSupabaseResult(
            await updateDeliveryJobStatus(jobId, "failed_terminal", {
              last_error: classification.reason,
            }),
          );
          terminal += 1;
          throw new Error(`ClickUp delivery failed for job ${jobId}: ${classification.reason}`);
        }

        if (classification.disposition === "terminal") {
          unwrapSupabaseResult(
            await updateDeliveryJobStatus(jobId, "failed_terminal", {
              last_error: classification.reason,
            }),
          );
          terminal += 1;
        } else {
          unwrapSupabaseResult(
            await updateDeliveryJobStatus(jobId, "retry_scheduled", {
              next_attempt_at: new Date(
                Date.now() + (classification.retryDelayMs ?? 5 * 60 * 1000),
              ).toISOString(),
              last_error: classification.reason,
            }),
          );
          retryScheduled += 1;
        }
      }
    }

    const summary = {
      mode: "clickup_worker",
      workerId: input.workerId,
      dryRun: input.dryRun ?? false,
      strictFailure: input.strictFailure ?? false,
      claimed: jobs.length,
      sent,
      retryScheduled,
      terminal,
    };
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", summary));
    await finalizeDailyRunsWorkflow({
      skipNotifications: input.skipNotifications,
    });

    return {
      ok: true,
      runId,
      status: "succeeded",
      claimed: jobs.length,
      sent,
      retryScheduled,
      terminal,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ClickUp worker workflow error";
    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", undefined, {
        message,
      }),
    );
    if (!input.skipNotifications) {
      try {
        await sendErrorNotification({
          workflow: "clickup_worker",
          runId,
          message,
          context: {
            input,
          },
        });
      } catch (notificationError) {
        logError("Failed to send ClickUp worker error notification", {
          runId,
          notificationError:
            notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
    }
    throw error;
  }
}

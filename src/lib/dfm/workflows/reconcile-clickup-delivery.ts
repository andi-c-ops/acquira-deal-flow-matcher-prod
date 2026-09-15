import { getAeThesisById } from "@/lib/dfm/db/repositories/ae-theses";
import {
  getDeliveryJobById,
  updateDeliveryJobStatus,
} from "@/lib/dfm/db/repositories/delivery-jobs";
import { getNormalizedDealById } from "@/lib/dfm/db/repositories/deals";
import {
  getDeliveryReceiptByJobId,
  insertDeliveryReceipt,
} from "@/lib/dfm/db/repositories/delivery-receipts";
import { getMatchCandidateById } from "@/lib/dfm/db/repositories/match-candidates";
import { getClickupTask } from "@/lib/dfm/providers/clickup-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";
import { finalizeDailyRunsWorkflow } from "@/lib/dfm/workflows/finalize-daily-runs";

export interface ReconcileClickupDeliveryInput {
  jobId: string;
  taskId: string;
  skipNotifications?: boolean;
}

export interface ReconcileClickupDeliveryResult {
  ok: true;
  jobId: string;
  taskId: string;
  runId: string;
  status: "sent";
  alreadyReconciled: boolean;
  finalization: Awaited<ReturnType<typeof finalizeDailyRunsWorkflow>>;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function expectedTaskName(input: {
  dealName: string;
  matchQuality: string;
}) {
  return `[${input.matchQuality}] ${input.dealName}`;
}

export async function reconcileClickupDeliveryJob(
  input: ReconcileClickupDeliveryInput,
): Promise<ReconcileClickupDeliveryResult> {
  const job = unwrapSupabaseResult(await getDeliveryJobById(input.jobId)) as Record<string, unknown> | null;
  if (!job) {
    throw new Error(`Delivery job ${input.jobId} was not found`);
  }

  const existingReceipt = await getDeliveryReceiptByJobId(input.jobId);
  if (existingReceipt.error) {
    throw new Error(existingReceipt.error.message);
  }
  if (existingReceipt.data) {
    if (String(existingReceipt.data.clickup_task_id) !== input.taskId) {
      throw new Error(
        `Delivery job ${input.jobId} already has a receipt for a different ClickUp task`,
      );
    }

    unwrapSupabaseResult(
      await updateDeliveryJobStatus(input.jobId, "sent", {
        sent_at: existingReceipt.data.sent_at ?? new Date().toISOString(),
      }),
    );

    const finalization = await finalizeDailyRunsWorkflow({
      skipNotifications: input.skipNotifications,
    });
    return {
      ok: true,
      jobId: input.jobId,
      taskId: input.taskId,
      runId: String(job.run_id),
      status: "sent",
      alreadyReconciled: true,
      finalization,
    };
  }

  if (job.status !== "processing") {
    throw new Error(
      `Delivery job ${input.jobId} is ${String(job.status)}, not processing; no reclaim was applied`,
    );
  }

  const ae = unwrapSupabaseResult(await getAeThesisById(String(job.ae_thesis_id))) as Record<string, unknown>;
  const deal = unwrapSupabaseResult(await getNormalizedDealById(String(job.deal_id))) as Record<string, unknown>;
  const candidate =
    job.match_candidate_id != null
      ? (unwrapSupabaseResult(
          await getMatchCandidateById(String(job.match_candidate_id)),
        ) as Record<string, unknown>)
      : null;
  const matchQuality = candidate ? String(candidate.match_quality) : "Moderate";
  const expectedName = expectedTaskName({
    dealName: String(deal.business_name),
    matchQuality,
  });

  const task = await getClickupTask(input.taskId);
  if (task.listId !== String(job.clickup_list_id)) {
    throw new Error(
      `ClickUp task ${input.taskId} is in list ${task.listId ?? "unknown"}, expected ${String(job.clickup_list_id)}`,
    );
  }
  if (normalize(task.taskName) !== normalize(expectedName)) {
    throw new Error(
      `ClickUp task ${input.taskId} is named ${JSON.stringify(task.taskName)}, expected ${JSON.stringify(expectedName)}`,
    );
  }

  const reconciledAt = new Date().toISOString();
  unwrapSupabaseResult(
    await insertDeliveryReceipt({
      jobId: input.jobId,
      clickupTaskId: task.taskId,
      clickupTaskUrl: task.taskUrl,
      providerResponseJson: {
        source: "operator_controlled_reconciliation",
        reconciledExistingTask: true,
        verifiedAt: reconciledAt,
        listId: task.listId,
        taskName: task.taskName,
      },
    }),
  );
  unwrapSupabaseResult(
    await updateDeliveryJobStatus(input.jobId, "sent", {
      sent_at: reconciledAt,
      last_error: null,
      claimed_by: "operator-controlled-reconciliation",
      claimed_at: reconciledAt,
    }),
  );

  const finalization = await finalizeDailyRunsWorkflow({
    skipNotifications: input.skipNotifications,
  });
  return {
    ok: true,
    jobId: input.jobId,
    taskId: task.taskId,
    runId: String(job.run_id),
    status: "sent",
    alreadyReconciled: false,
    finalization,
  };
}

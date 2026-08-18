import type { BaseRunResult, RunNewAeBackfillInput } from "@/lib/dfm/domain/types";
import { clearCurrentAeThesisVersions, insertAeThesisVersion } from "@/lib/dfm/db/repositories/ae-thesis-versions";
import {
  findActiveAeThesisByEmail,
  refreshAeThesisSubmission,
  updateAeLatestVersion,
  upsertAeThesis,
} from "@/lib/dfm/db/repositories/ae-theses";
import { upsertMatchCandidate } from "@/lib/dfm/db/repositories/match-candidates";
import { listActiveNormalizedDeals } from "@/lib/dfm/db/repositories/deals";
import { createMatchRun, updateMatchRunStatus } from "@/lib/dfm/db/repositories/match-runs";
import { shouldCreateClickupDeliveryJob } from "@/lib/dfm/matching/delivery-threshold";
import { scoreDealAgainstThesis } from "@/lib/dfm/matching/scorer";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";
import { logError, logInfo } from "@/lib/dfm/observability/logger";
import { sendErrorNotification } from "@/lib/dfm/providers/notification-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

export async function runNewAeBackfillWorkflow(
  input: RunNewAeBackfillInput,
): Promise<BaseRunResult & { aeThesisId: string }> {
  const runRecord = unwrapSupabaseResult(
    await createMatchRun({
      runType: "new_ae_backfill",
      triggerSource: input.source,
      triggerPayload: input,
      lockKey: `dfm:ae:${input.submissionKey}`,
    }),
  );

  const runId = runRecord.id as string;
  try {
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "running"));

    const normalized = normalizeAePayload(input.payload);
    const existingAeResult = await findActiveAeThesisByEmail(normalized.aeEmail);
    if (existingAeResult.error) {
      throw new Error(existingAeResult.error.message);
    }
    const existingAe = existingAeResult.data;
    const aeRecord = existingAe
      ? unwrapSupabaseResult(
          await refreshAeThesisSubmission(String(existingAe.id), {
            aeName: normalized.aeName,
            aeEmail: normalized.aeEmail,
            submittedAt: input.submittedAt,
          }),
        )
      : unwrapSupabaseResult(
          await upsertAeThesis({
            externalSubmissionKey: input.submissionKey,
            aeName: normalized.aeName,
            aeEmail: normalized.aeEmail,
            submittedAt: input.submittedAt,
          }),
        );

    const aeThesisId = aeRecord.id as string;
    logInfo("Starting new AE backfill workflow", { runId, aeThesisId, input });

    await clearCurrentAeThesisVersions(aeThesisId);
    const versionRecord = unwrapSupabaseResult(
      await insertAeThesisVersion({
        aeThesisId,
        rawPayload: input.payload,
        normalizedPayload: normalized as unknown as Record<string, unknown>,
        submittedAt: input.submittedAt,
        normalizationVersion: normalized.normalizationVersion,
      }),
    );
    unwrapSupabaseResult(await updateAeLatestVersion(aeThesisId, String(versionRecord.id)));

    const activeDeals = unwrapSupabaseResult(await listActiveNormalizedDeals());
    let candidatesCreatedOrUpdated = 0;
    let deliveryJobsCreatedOrEligible = 0;
    let deliveryJobsCreated = 0;

    for (const deal of activeDeals) {
      const score = scoreDealAgainstThesis(
        {
          airtableRecordId: String(deal.airtable_record_id),
          businessName: String(deal.business_name),
          industry: typeof deal.industry === "string" ? deal.industry : null,
          location: typeof deal.location === "string" ? deal.location : null,
          state: typeof deal.state === "string" ? deal.state : null,
          price: typeof deal.price === "number" ? deal.price : null,
          ebitda: typeof deal.ebitda === "number" ? deal.ebitda : null,
          multiple: typeof deal.multiple === "number" ? deal.multiple : null,
          listingUrl: typeof deal.listing_url === "string" ? deal.listing_url : null,
          description: typeof deal.description === "string" ? deal.description : null,
          sourceCreatedAt:
            typeof deal.source_created_at === "string" ? deal.source_created_at : null,
          sourceUpdatedAt:
            typeof deal.source_updated_at === "string" ? deal.source_updated_at : null,
        },
        normalized,
      );

      const candidate = unwrapSupabaseResult(
        await upsertMatchCandidate({
          aeThesisId,
          dealId: String(deal.id),
          lastRunId: runId,
          scorePct: score.scorePct,
          matchQuality: score.matchQuality,
          criteriaDetails: { criteria: score.criteriaDetails },
          deliveryEligible: score.deliveryEligible,
        }),
      );
      candidatesCreatedOrUpdated += 1;

      const qualityAllowedForFutureDailyDelivery =
        score.deliveryEligible &&
        shouldCreateClickupDeliveryJob(score.matchQuality, aeRecord.delivery_min_match_quality);

      if (qualityAllowedForFutureDailyDelivery) {
        deliveryJobsCreatedOrEligible += 1;
      }
    }

    const summary = {
      mode: "new_ae_backfill",
      source: input.source,
      submissionKey: input.submissionKey,
      aeThesisId,
      thesisVersionId: String(versionRecord.id),
      normalizedSummary: normalized.summary,
      activeDealsEvaluated: activeDeals.length,
      candidatesCreatedOrUpdated,
      deliveryJobsCreatedOrEligible,
      deliveryJobsCreated,
      deliveryPolicy: "new_thesis_prepares_candidates_only_daily_run_delivers",
    };
    unwrapSupabaseResult(await updateMatchRunStatus(runId, "succeeded", summary));

    return {
      ok: true,
      runId,
      aeThesisId,
      status: "succeeded",
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown new AE backfill workflow error";
    unwrapSupabaseResult(
      await updateMatchRunStatus(runId, "failed", undefined, {
        message,
      }),
    );
    try {
      await sendErrorNotification({
        workflow: "new_ae_backfill",
        runId,
        message,
        context: {
          input,
        },
      });
    } catch (notificationError) {
      logError("Failed to send new AE backfill error notification", {
        runId,
        notificationError:
          notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }
    throw error;
  }
}

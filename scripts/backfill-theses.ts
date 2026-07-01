import { fetchNewAeSubmissionsSince } from "@/lib/dfm/providers/google-intake-client";
import { normalizeAePayload } from "@/lib/dfm/matching/thesis-normalizer";
import { runNewAeBackfillWorkflow } from "@/lib/dfm/workflows/run-new-ae-backfill";

function dedupeLatestSubmissions(
  submissions: Awaited<ReturnType<typeof fetchNewAeSubmissionsSince>>,
) {
  const latestByKey = new Map<string, (typeof submissions)[number]>();

  for (const submission of submissions) {
    const normalized = normalizeAePayload(submission.payload);
    const identity = (normalized.aeEmail ?? normalized.aeName).trim().toLowerCase();
    const existing = latestByKey.get(identity);
    if (!existing || submission.submittedAt > existing.submittedAt) {
      latestByKey.set(identity, submission);
    }
  }

  return Array.from(latestByKey.values()).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

async function main() {
  const dryRun = readBooleanEnv("THESIS_BACKFILL_DRY_RUN", true);
  const since = process.env.THESIS_BACKFILL_SINCE ?? null;

  const submissions = await fetchNewAeSubmissionsSince(since);
  const latestSubmissions = dedupeLatestSubmissions(submissions);

  const summary = {
    dryRun,
    sourceRows: submissions.length,
    uniqueAes: latestSubmissions.length,
    succeeded: 0,
    failed: 0,
    failures: [] as Array<{ submissionKey: string; message: string }>,
  };

  for (const submission of latestSubmissions) {
    if (dryRun) {
      const normalized = normalizeAePayload(submission.payload);
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            submissionKey: submission.submissionKey,
            submittedAt: submission.submittedAt,
            aeName: normalized.aeName,
            aeEmail: normalized.aeEmail,
            summary: normalized.summary,
          },
          null,
          2,
        ),
      );
      summary.succeeded += 1;
      continue;
    }

    try {
      const result = await runNewAeBackfillWorkflow({
        source: "manual_production_backfill",
        submissionKey: submission.submissionKey,
        submittedAt: submission.submittedAt,
        payload: submission.payload,
      });
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            runId: result.runId,
            aeThesisId: result.aeThesisId,
            submissionKey: submission.submissionKey,
            submittedAt: submission.submittedAt,
          },
          null,
          2,
        ),
      );
      summary.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.failures.push({
        submissionKey: submission.submissionKey,
        message,
      });
      console.error(
        JSON.stringify(
          {
            ok: false,
            submissionKey: submission.submissionKey,
            submittedAt: submission.submittedAt,
            message,
          },
          null,
          2,
        ),
      );
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

void main();

import { closePool } from "@/lib/dfm/db/client";
import { runDailyWorkflow } from "@/lib/dfm/workflows/run-daily";

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function readPositiveIntEnv(name: string, defaultValue: number) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseRequiredIso(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be a valid ISO timestamp`);
  }

  return parsed;
}

async function main() {
  const dryRun = readBooleanEnv("CHUNKED_RECOVERY_DRY_RUN", true);
  const skipNotifications = readBooleanEnv("CHUNKED_RECOVERY_SKIP_NOTIFICATIONS", true);
  const chunkMinutes = readPositiveIntEnv("CHUNKED_RECOVERY_CHUNK_MINUTES", 1);
  const maxChunks = process.env.CHUNKED_RECOVERY_MAX_CHUNKS
    ? readPositiveIntEnv("CHUNKED_RECOVERY_MAX_CHUNKS", 1)
    : null;
  const overlapMs = readPositiveIntEnv("CHUNKED_RECOVERY_OVERLAP_MS", 1000);

  const overallStart = parseRequiredIso("CHUNKED_RECOVERY_CURSOR_START");
  const overallEnd = parseRequiredIso("CHUNKED_RECOVERY_CURSOR_END");

  if (overallStart >= overallEnd) {
    throw new Error("CHUNKED_RECOVERY_CURSOR_START must be before CHUNKED_RECOVERY_CURSOR_END");
  }

  const chunkMs = chunkMinutes * 60 * 1000;
  const summary = {
    dryRun,
    skipNotifications,
    chunkMinutes,
    overlapMs,
    overallStart: overallStart.toISOString(),
    overallEnd: overallEnd.toISOString(),
    chunksRun: 0,
    chunksSucceeded: 0,
    chunksFailed: 0,
    totalFetchedDeals: 0,
    totalCandidatesCreatedOrUpdated: 0,
    totalDeliveryJobsCreatedOrEligible: 0,
    chunkSummaries: [] as Array<{
      chunkIndex: number;
      cursorStart: string;
      cursorEnd: string;
      ok: boolean;
      runId?: string;
      fetchedDeals?: number;
      candidatesCreatedOrUpdated?: number;
      deliveryJobsCreatedOrEligible?: number;
      error?: string;
    }>,
  };

  let chunkStart = new Date(overallStart);
  let chunkIndex = 0;

  while (chunkStart < overallEnd) {
    if (maxChunks && chunkIndex >= maxChunks) {
      break;
    }

    const rawChunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, overallEnd.getTime()));
    const chunkEnd = new Date(
      rawChunkEnd.getTime() === overallEnd.getTime()
        ? rawChunkEnd.getTime()
        : rawChunkEnd.getTime() + overlapMs,
    );

    chunkIndex += 1;
    summary.chunksRun += 1;

    try {
      const result = await runDailyWorkflow({
        dryRun,
        force: true,
        skipNotifications,
        cursorStartOverride: chunkStart.toISOString(),
        cursorEndOverride: chunkEnd.toISOString(),
      });

      if (!result.ok) {
        throw new Error(`Chunk ${chunkIndex} returned non-ok result`);
      }

      const fetchedDeals = Number(result.summary?.fetchedDeals ?? 0);
      const candidatesCreatedOrUpdated = Number(result.summary?.candidatesCreatedOrUpdated ?? 0);
      const deliveryJobsCreatedOrEligible = Number(
        result.summary?.deliveryJobsCreatedOrEligible ?? 0,
      );

      summary.chunksSucceeded += 1;
      summary.totalFetchedDeals += fetchedDeals;
      summary.totalCandidatesCreatedOrUpdated += candidatesCreatedOrUpdated;
      summary.totalDeliveryJobsCreatedOrEligible += deliveryJobsCreatedOrEligible;
      summary.chunkSummaries.push({
        chunkIndex,
        cursorStart: chunkStart.toISOString(),
        cursorEnd: chunkEnd.toISOString(),
        ok: true,
        runId: result.runId,
        fetchedDeals,
        candidatesCreatedOrUpdated,
        deliveryJobsCreatedOrEligible,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.chunksFailed += 1;
      summary.chunkSummaries.push({
        chunkIndex,
        cursorStart: chunkStart.toISOString(),
        cursorEnd: chunkEnd.toISOString(),
        ok: false,
        error: message,
      });
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = 1;
      return;
    }

    chunkStart = rawChunkEnd;
  }

  console.log(JSON.stringify(summary, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

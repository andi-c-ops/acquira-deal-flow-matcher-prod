import type { BaseRunResult, RunBacklogRecoveryInput } from "@/lib/dfm/domain/types";
import { listOpenDailyRuns } from "@/lib/dfm/db/repositories/match-runs";
import { getSyncCursor } from "@/lib/dfm/db/repositories/sync-cursors";
import { logInfo } from "@/lib/dfm/observability/logger";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";
import { finalizeDailyRunsWorkflow } from "@/lib/dfm/workflows/finalize-daily-runs";
import { runDailyWorkflow } from "@/lib/dfm/workflows/run-daily";

const DEFAULT_WINDOW_SECONDS = 10;
const DEFAULT_OVERLAP_MS = 1_000;
const DEFAULT_MIN_LAG_SECONDS = 15 * 60;
const CURSOR_KEY = "airtable_daily_deals";

function envFlagEnabled(name: string) {
  const value = process.env[name];
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function asOpenRunArray(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = (value as { runs?: unknown }).runs;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}

function readCursorTimestamp(value: unknown): string | null {
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

function isoFromMs(value: number) {
  return new Date(value).toISOString();
}

export async function runBacklogRecoveryWorkflow(input: RunBacklogRecoveryInput = {}): Promise<
  BaseRunResult & {
    skipped?: boolean;
    reason?: string;
    cursorStart?: string | null;
    cursorEnd?: string | null;
    openRunIds?: string[];
  }
> {
  const enabled = envFlagEnabled("DFM_BACKLOG_RECOVERY_ENABLED");
  if (!enabled && !input.force) {
    return {
      ok: true,
      runId: "backlog-recovery-disabled",
      status: "succeeded",
      skipped: true,
      reason: "backlog_recovery_disabled",
      summary: {
        mode: "backlog_recovery",
        enabled,
      },
    };
  }

  await finalizeDailyRunsWorkflow({
    skipNotifications: input.skipNotifications ?? true,
  });

  const openRuns = asOpenRunArray(unwrapSupabaseResult(await listOpenDailyRuns()));
  if (openRuns.length > 0) {
    const openRunIds = openRuns.map((run) => String(run.id));
    return {
      ok: true,
      runId: "backlog-recovery-waiting",
      status: "succeeded",
      skipped: true,
      reason: "open_daily_run_exists",
      openRunIds,
      summary: {
        mode: "backlog_recovery",
        openRunIds,
      },
    };
  }

  const cursor = unwrapSupabaseResult(await getSyncCursor(CURSOR_KEY));
  const cursorTimestamp = readCursorTimestamp(cursor?.cursor_timestamp);
  if (!cursorTimestamp) {
    return {
      ok: true,
      runId: "backlog-recovery-missing-cursor",
      status: "succeeded",
      skipped: true,
      reason: "missing_airtable_daily_deals_cursor",
      cursorStart: null,
      cursorEnd: null,
      summary: {
        mode: "backlog_recovery",
      },
    };
  }

  const cursorMs = new Date(cursorTimestamp).getTime();
  const maxCursorEndMs = input.maxCursorEndOverride
    ? new Date(input.maxCursorEndOverride).getTime()
    : Date.now();
  if (!Number.isFinite(cursorMs) || !Number.isFinite(maxCursorEndMs)) {
    throw new Error("Backlog recovery cursor timestamps must be valid ISO timestamps");
  }

  const minLagMs = (input.minLagSeconds ?? DEFAULT_MIN_LAG_SECONDS) * 1000;
  const lagMs = maxCursorEndMs - cursorMs;
  if (lagMs <= minLagMs) {
    return {
      ok: true,
      runId: "backlog-recovery-current",
      status: "succeeded",
      skipped: true,
      reason: "cursor_within_min_lag",
      cursorStart: cursorTimestamp,
      cursorEnd: isoFromMs(maxCursorEndMs),
      summary: {
        mode: "backlog_recovery",
        cursorStart: cursorTimestamp,
        maxCursorEnd: isoFromMs(maxCursorEndMs),
        minLagSeconds: input.minLagSeconds ?? DEFAULT_MIN_LAG_SECONDS,
        lagSeconds: Math.floor(lagMs / 1000),
      },
    };
  }

  const windowMs = (input.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
  const overlapMs = input.overlapMs ?? DEFAULT_OVERLAP_MS;
  const cursorStart = isoFromMs(Math.max(0, cursorMs - overlapMs));
  const cursorEnd = isoFromMs(Math.min(cursorMs + windowMs, maxCursorEndMs));

  logInfo("Starting backlog recovery daily chunk", {
    cursorTimestamp,
    cursorStart,
    cursorEnd,
    windowSeconds: input.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
    overlapMs,
  });

  return runDailyWorkflow({
    dryRun: input.dryRun ?? false,
    force: false,
    skipNotifications: input.skipNotifications ?? true,
    deferDelivery: true,
    cursorStartOverride: cursorStart,
    cursorEndOverride: cursorEnd,
  });
}

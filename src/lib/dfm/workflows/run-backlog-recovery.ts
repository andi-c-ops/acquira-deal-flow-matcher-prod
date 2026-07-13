import type { BaseRunResult, RunBacklogRecoveryInput } from "@/lib/dfm/domain/types";
import { listOpenDailyRuns } from "@/lib/dfm/db/repositories/match-runs";
import {
  advanceSyncCursorTimestampMonotonic,
  getSyncCursor,
} from "@/lib/dfm/db/repositories/sync-cursors";
import { logInfo } from "@/lib/dfm/observability/logger";
import { countDealsInWindow } from "@/lib/dfm/providers/airtable-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";
import { finalizeDailyRunsWorkflow } from "@/lib/dfm/workflows/finalize-daily-runs";
import { runDailyWorkflow } from "@/lib/dfm/workflows/run-daily";

const DEFAULT_WINDOW_SECONDS = 10;
const DEFAULT_PROBE_WINDOW_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_DEALS_PER_RUN = 6;
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

async function chooseRecoveryWindow(input: {
  cursorMs: number;
  maxCursorEndMs: number;
  minWindowSeconds: number;
  probeWindowSeconds: number;
  maxDealsPerRun: number;
}) {
  let windowMs = Math.min(
    input.probeWindowSeconds * 1000,
    Math.max(0, input.maxCursorEndMs - input.cursorMs),
  );
  const minWindowMs = input.minWindowSeconds * 1000;
  let selectedCount = 0;

  while (windowMs > 0) {
    const cursorStart = isoFromMs(input.cursorMs);
    const cursorEnd = isoFromMs(Math.min(input.cursorMs + windowMs, input.maxCursorEndMs));
    const count = await countDealsInWindow({
      cursorStart,
      cursorEnd,
      stopAfter: input.maxDealsPerRun + 1,
    });

    if (count === 0) {
      return {
        cursorStart,
        cursorEnd,
        dealCount: 0,
        windowSeconds: Math.ceil(windowMs / 1000),
      };
    }

    selectedCount = count;
    if (count <= input.maxDealsPerRun || windowMs <= minWindowMs) {
      return {
        cursorStart,
        cursorEnd,
        dealCount: count,
        windowSeconds: Math.ceil(windowMs / 1000),
      };
    }

    windowMs = Math.max(minWindowMs, Math.floor(windowMs / 2));
  }

  return {
    cursorStart: isoFromMs(input.cursorMs),
    cursorEnd: isoFromMs(input.cursorMs),
    dealCount: selectedCount,
    windowSeconds: 0,
  };
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

  const minWindowSeconds = input.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const overlapMs = input.overlapMs ?? DEFAULT_OVERLAP_MS;
  const maxDealsPerRun = input.maxDealsPerRun ?? DEFAULT_MAX_DEALS_PER_RUN;
  const window = await chooseRecoveryWindow({
    cursorMs,
    maxCursorEndMs,
    minWindowSeconds,
    probeWindowSeconds: input.probeWindowSeconds ?? DEFAULT_PROBE_WINDOW_SECONDS,
    maxDealsPerRun,
  });

  if (window.dealCount === 0) {
    unwrapSupabaseResult(
      await advanceSyncCursorTimestampMonotonic(CURSOR_KEY, {
        cursorTimestamp: window.cursorEnd,
        metadata: {
          mode: "backlog_recovery_empty_window",
          cursorStart: window.cursorStart,
          cursorEnd: window.cursorEnd,
          advancedAt: new Date().toISOString(),
        },
      }),
    );

    return {
      ok: true,
      runId: "backlog-recovery-empty-window",
      status: "succeeded",
      skipped: true,
      reason: "empty_airtable_window",
      cursorStart: window.cursorStart,
      cursorEnd: window.cursorEnd,
      summary: {
        mode: "backlog_recovery",
        cursorStart: window.cursorStart,
        cursorEnd: window.cursorEnd,
        dealCount: 0,
        windowSeconds: window.windowSeconds,
      },
    };
  }

  const cursorStart = isoFromMs(Math.max(0, new Date(window.cursorStart).getTime() - overlapMs));
  const cursorEnd = window.cursorEnd;

  logInfo("Starting backlog recovery daily chunk", {
    cursorTimestamp,
    cursorStart,
    cursorEnd,
    dealCount: window.dealCount,
    windowSeconds: window.windowSeconds,
    maxDealsPerRun,
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

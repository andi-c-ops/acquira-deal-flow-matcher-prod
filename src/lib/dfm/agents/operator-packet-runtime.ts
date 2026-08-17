import { getEnv } from "@/lib/dfm/config/env";
import { closePool, queryMany } from "@/lib/dfm/db/client";
import {
  listStaleClickupDeals,
  listStaleAirtableDeals,
} from "@/lib/dfm/db/repositories/stale-deals";
import { listActiveAeTheses } from "@/lib/dfm/db/repositories/ae-theses";
import { listCurrentAeThesisVersions } from "@/lib/dfm/db/repositories/ae-thesis-versions";
import { listAeCoverageReviewRows } from "@/lib/dfm/db/repositories/coverage-review";
import { getSyncCursor } from "@/lib/dfm/db/repositories/sync-cursors";
import { loadClickupEngagementSnapshot } from "@/lib/dfm/providers/google-drive-engagement-snapshot";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

import {
  buildOperatorAgentPacket,
  type OperatorPacketCursor,
  type OperatorPacketCoverageAe,
  type OperatorPacketDeliveryStateInput,
  type OperatorPacketRun,
  type OperatorPacketStaleDeal,
} from "@/lib/dfm/agents/operator-packet";

type MatchRunRow = {
  id: string;
  run_type: string;
  status: string;
  created_at: Date | string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  cursor_start: Date | string | null;
  cursor_end: Date | string | null;
  summary_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
};

type DeliveryCountRow = {
  status: string;
  count: string | number;
};

type CurrentAeVersionRow = {
  ae_thesis_id: string;
  normalized_payload: Record<string, unknown> | null;
};

type ClickupActivitySnapshotRow = {
  ae_thesis_id: string;
  recently_updated_deals_14_days: string | number;
  recently_updated_deals_30_days: string | number;
  last_clickup_activity_at: Date | string | null;
  observed_at: Date | string;
};

function asClickupActivitySnapshotRows(snapshot: Awaited<ReturnType<typeof loadClickupEngagementSnapshot>>) {
  if (!snapshot) return [];
  return snapshot.rows.map((row) => ({
    ae_thesis_id: row.aeThesisId,
    recently_updated_deals_14_days: row.recentlyUpdatedDeals14Days,
    recently_updated_deals_30_days: row.recentlyUpdatedDeals30Days,
    last_clickup_activity_at: row.lastClickupActivityAt,
    observed_at: snapshot.observedAt,
  }));
}

function readIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function asRun(row: MatchRunRow | null): OperatorPacketRun | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    runType: row.run_type as OperatorPacketRun["runType"],
    status: row.status as OperatorPacketRun["status"],
    createdAt: readIso(row.created_at),
    startedAt: readIso(row.started_at),
    finishedAt: readIso(row.finished_at),
    cursorStart: readIso(row.cursor_start),
    cursorEnd: readIso(row.cursor_end),
    summary: row.summary_json ?? {},
    error: row.error_json ?? null,
  };
}

function asCursor(row: Record<string, unknown> | null, key: string): OperatorPacketCursor | null {
  if (!row) {
    return null;
  }

  return {
    key,
    cursorTimestamp:
      typeof row.cursor_timestamp === "string"
        ? row.cursor_timestamp
        : row.cursor_timestamp instanceof Date
          ? row.cursor_timestamp.toISOString()
          : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

async function getLatestRun(runType: string) {
  const result = await queryMany<MatchRunRow>(
    `
      select *
      from dfm_private.match_runs
      where run_type = $1::dfm_private.run_type
      order by created_at desc
      limit 1
    `,
    [runType],
  );

  return asRun(result.error ? null : (result.data?.[0] ?? null));
}

function buildDeliveryState(rows: DeliveryCountRow[]): OperatorPacketDeliveryStateInput {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.status, Number(row.count ?? 0));
  }

  const pending = counts.get("pending") ?? 0;
  const processing = counts.get("processing") ?? 0;
  const retryScheduled = counts.get("retry_scheduled") ?? 0;
  const sent = counts.get("sent") ?? 0;
  const failedTerminal = counts.get("failed_terminal") ?? 0;
  const cancelled = counts.get("cancelled") ?? 0;

  return {
    pending,
    processing,
    retryScheduled,
    sent,
    failedTerminal,
    cancelled,
    total: pending + processing + retryScheduled + sent + failedTerminal + cancelled,
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readTotalCount<T extends { total_count: string | number }>(rows: T[] | null | undefined) {
  return rows && rows.length > 0 ? toNumber(rows[0]?.total_count) : 0;
}

function buildStaleAirtableSamples(
  rows: Awaited<ReturnType<typeof listStaleAirtableDeals>>["data"] | null | undefined,
): OperatorPacketStaleDeal[] {
  return (rows ?? []).map((row) => ({
    label: `${row.business_name} | ${row.airtable_record_id}`,
    detail: `Airtable-side normalized deal has been locally untouched for ${toNumber(row.days_stale)} days.`,
    daysStale: toNumber(row.days_stale),
    link: row.listing_url ?? null,
    lastTouchedAt: readIso(row.last_touched_at),
  }));
}

function buildStaleClickupSamples(
  rows: Awaited<ReturnType<typeof listStaleClickupDeals>>["data"] | null | undefined,
): OperatorPacketStaleDeal[] {
  return (rows ?? []).map((row) => ({
    label: `${row.ae_name} | ${row.business_name}`,
    detail: `Deal Flow Matcher delivery records show this ClickUp-delivered deal has had no recorded delivery activity for ${toNumber(row.days_stale)} days.`,
    daysStale: toNumber(row.days_stale),
    link: row.clickup_task_url,
    lastTouchedAt: readIso(row.last_touched_at),
  }));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function hasNumericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function buildCoverageDiagnosis(input: {
  aeName: string;
  clickupListId: string | null;
  hasCurrentVersion: boolean;
  deliveryMinMatchQuality: "Strong" | "Moderate";
  deliveredLast7Days: number;
  deliveredLast30Days: number;
  activeStrongCandidates: number;
  activeModerateCandidates: number;
  industryCount: number;
  geographyCount: number;
  hasPriceRange: boolean;
  hasEbitdaRange: boolean;
}) {
  if (!input.clickupListId) {
    return {
      diagnosis: "Routing setup incomplete",
      recommendation: "Map this AE to the correct ClickUp Deals list before reviewing sourcing quality.",
    };
  }

  if (!input.hasCurrentVersion) {
    return {
      diagnosis: "Current thesis missing",
      recommendation: "Refresh this AE's thesis so the matcher is scoring against the latest criteria.",
    };
  }

  if (
    input.deliveryMinMatchQuality === "Strong" &&
    input.activeStrongCandidates === 0 &&
    input.activeModerateCandidates > 0
  ) {
    return {
      diagnosis: "Strong-only threshold is limiting delivery",
      recommendation: "Review whether this AE should stay Strong-only or allow Moderate matches.",
    };
  }

  const strictCriteriaSignals = [
    input.industryCount > 0 && input.industryCount <= 2,
    input.geographyCount > 0 && input.geographyCount <= 2,
    input.hasPriceRange,
    input.hasEbitdaRange,
  ].filter(Boolean).length;

  const activeDeliverableCandidates =
    input.deliveryMinMatchQuality === "Strong"
      ? input.activeStrongCandidates
      : input.activeStrongCandidates + input.activeModerateCandidates;

  if (activeDeliverableCandidates === 0 && strictCriteriaSignals >= 3) {
    return {
      diagnosis: "Criteria may be too narrow",
      recommendation:
        "Review industry, geography, price, and EBITDA filters first because the current thesis is highly constrained and has no active deliverable matches.",
    };
  }

  if (activeDeliverableCandidates <= 2 && input.deliveredLast30Days <= 2) {
    return {
      diagnosis: "Sourcing may be thin for this thesis",
      recommendation:
        "Check whether the current Airtable inventory is light for this niche before changing the thesis.",
    };
  }

  if (input.deliveredLast7Days === 0 && input.deliveredLast30Days < 3) {
    return {
      diagnosis: "Low recent deal flow needs review",
      recommendation:
        "Compare this AE's thesis against recent Airtable intake and decide whether to widen criteria or improve sourcing.",
    };
  }

  return {
    diagnosis: "Coverage looks acceptable",
    recommendation: "No immediate change is needed from this weekly review.",
  };
}

function buildCoverageReview(input: {
  activeAes: Array<Record<string, unknown>>;
  currentVersions: CurrentAeVersionRow[];
  engagementSnapshots: ClickupActivitySnapshotRow[];
  rows: Array<{
    ae_thesis_id: string;
    delivered_last_7_days: string | number;
    delivered_last_30_days: string | number;
    active_strong_candidates: string | number;
    active_moderate_candidates: string | number;
  }>;
}) {
  const lowMatchThreshold = 1;
  const reviewThreshold30Days = 3;
  const rowMap = new Map(input.rows.map((row) => [String(row.ae_thesis_id), row]));
  const versionMap = new Map(input.currentVersions.map((row) => [String(row.ae_thesis_id), row]));
  const engagementSnapshotMap = new Map(
    input.engagementSnapshots.map((snapshot) => [String(snapshot.ae_thesis_id), snapshot]),
  );
  const newestSnapshotAt = input.engagementSnapshots
    .map((snapshot) => readIso(snapshot.observed_at))
    .filter((value): value is string => typeof value === "string")
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  const snapshotCurrent =
    newestSnapshotAt !== null && Date.now() - new Date(newestSnapshotAt).getTime() <= 30 * 60 * 60 * 1000;

  const flaggedAes: OperatorPacketCoverageAe[] = [];
  let noCurrentThesisCount = 0;
  let noClickupDestinationCount = 0;
  let zeroMatchLast7DaysCount = 0;

  for (const ae of input.activeAes) {
    const aeThesisId = String(ae.id);
    const row = rowMap.get(aeThesisId);
    const version = versionMap.get(aeThesisId);
    const normalizedPayload =
      version?.normalized_payload && typeof version.normalized_payload === "object"
        ? version.normalized_payload
        : null;

    const industries = readStringArray(normalizedPayload?.industries);
    const geography = readStringArray(normalizedPayload?.geography);
    const hasPriceRange =
      hasNumericValue(normalizedPayload?.priceMin) || hasNumericValue(normalizedPayload?.priceMax);
    const hasEbitdaRange =
      hasNumericValue(normalizedPayload?.ebitdaMin) || hasNumericValue(normalizedPayload?.ebitdaMax);

    const deliveryMinMatchQuality =
      ae.delivery_min_match_quality === "Strong" ? "Strong" : "Moderate";
    const deliveredLast7Days = toNumber(row?.delivered_last_7_days);
    const deliveredLast30Days = toNumber(row?.delivered_last_30_days);
    const activeStrongCandidates = toNumber(row?.active_strong_candidates);
    const activeModerateCandidates = toNumber(row?.active_moderate_candidates);
    const activeDeliverableCandidates =
      deliveryMinMatchQuality === "Strong"
        ? activeStrongCandidates
        : activeStrongCandidates + activeModerateCandidates;
    const clickupListId = readString(ae.clickup_list_id);
    const hasCurrentVersion = Boolean(version);
    const engagementSnapshot = engagementSnapshotMap.get(aeThesisId);
    const engagementKnown = Boolean(clickupListId && engagementSnapshot && snapshotCurrent);
    const recentlyUpdatedDeals14Days = engagementKnown
      ? toNumber(engagementSnapshot?.recently_updated_deals_14_days)
      : 0;
    const recentlyUpdatedDeals30Days = engagementKnown
      ? toNumber(engagementSnapshot?.recently_updated_deals_30_days)
      : 0;
    const recentClickupActivity = engagementKnown
      ? readIso(engagementSnapshot?.last_clickup_activity_at)
      : null;

    if (!hasCurrentVersion) {
      noCurrentThesisCount += 1;
    }

    if (!clickupListId) {
      noClickupDestinationCount += 1;
    }

    if (deliveredLast7Days === 0) {
      zeroMatchLast7DaysCount += 1;
    }

    const isUnderserved =
      deliveredLast7Days < lowMatchThreshold || deliveredLast30Days < reviewThreshold30Days;

    if (!isUnderserved) {
      continue;
    }

    const diagnosis = buildCoverageDiagnosis({
      aeName: String(ae.ae_name ?? "Unknown AE"),
      clickupListId,
      hasCurrentVersion,
      deliveryMinMatchQuality,
      deliveredLast7Days,
      deliveredLast30Days,
      activeStrongCandidates,
      activeModerateCandidates,
      industryCount: industries.length,
      geographyCount: geography.length,
      hasPriceRange,
      hasEbitdaRange,
    });

    flaggedAes.push({
      aeThesisId,
      aeName: String(ae.ae_name ?? "Unknown AE"),
      aeEmail: readString(ae.ae_email),
      deliveryMinMatchQuality,
      engagementStatus: !engagementKnown
        ? "unknown"
        : recentlyUpdatedDeals14Days > 0
          ? "active_recently"
          : "inactive_recently",
      recentlyUpdatedDeals14Days,
      recentlyUpdatedDeals30Days,
      lastClickupActivityAt: recentClickupActivity,
      deliveredLast7Days,
      deliveredLast30Days,
      activeStrongCandidates,
      activeModerateCandidates,
      activeDeliverableCandidates,
      thesisSummary: (() => {
        const fallbackSummary = [
          industries.length ? `Industries: ${industries.join(", ")}` : null,
          geography.length ? `Geography: ${geography.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        return (readString(normalizedPayload?.summary) ?? fallbackSummary) || "Current thesis summary unavailable";
      })(),
      diagnosis: diagnosis.diagnosis,
      recommendation: diagnosis.recommendation,
    });
  }

  flaggedAes.sort((a, b) => {
    if (a.deliveredLast7Days !== b.deliveredLast7Days) {
      return a.deliveredLast7Days - b.deliveredLast7Days;
    }

    if (a.deliveredLast30Days !== b.deliveredLast30Days) {
      return a.deliveredLast30Days - b.deliveredLast30Days;
    }

    return a.aeName.localeCompare(b.aeName);
  });

  return {
    windowDays: 7 as const,
    lowMatchThreshold,
    reviewThreshold30Days,
    totalActiveAes: input.activeAes.length,
    underservedAeCount: flaggedAes.length,
    zeroMatchLast7DaysCount,
    noCurrentThesisCount,
    noClickupDestinationCount,
    engagementSnapshot: {
      status: snapshotCurrent ? ("current" as const) : ("stale_or_unavailable" as const),
      observedAt: newestSnapshotAt,
      expectedRefresh: "Every 6 hours by the scheduled ClickUp engagement snapshot.",
    },
    flaggedAes: flaggedAes.slice(0, 12),
  };
}

export async function loadOperatorAgentPacket() {
  getEnv();

  const staleThresholdDays = 90;
  const activeAes = await listActiveAeTheses();
  const activeAeRows = unwrapSupabaseResult(activeAes);

  const [
    dailyRun,
    newAeRun,
    clickupRun,
    currentVersions,
    coverageRows,
    engagementSnapshot,
    airtableCursorResult,
    googleCursorResult,
    deliveryCounts,
    staleAirtableResult,
    staleClickupResult,
  ] =
    await Promise.all([
      getLatestRun("daily"),
      getLatestRun("new_ae_backfill"),
      getLatestRun("reconciliation"),
      listCurrentAeThesisVersions(
        activeAeRows.map((ae) => String(ae.id)),
      ),
      listAeCoverageReviewRows(),
      loadClickupEngagementSnapshot(),
      getSyncCursor("airtable_daily_deals"),
      getSyncCursor("google_new_ae_submission"),
      queryMany<DeliveryCountRow>(
        `
          select status::text as status, count(*)::int as count
          from dfm_private.clickup_delivery_jobs
          group by status
        `,
      ),
      listStaleAirtableDeals(staleThresholdDays, 5),
      listStaleClickupDeals(staleThresholdDays, 5),
    ]);

  const currentVersionRows = unwrapSupabaseResult(currentVersions) as CurrentAeVersionRow[];
  const coverageReviewRows = unwrapSupabaseResult(coverageRows);
  const engagementSnapshotRows = asClickupActivitySnapshotRows(engagementSnapshot);

  return buildOperatorAgentPacket({
    generatedAt: new Date().toISOString(),
    timezone: "America/New_York",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    latestRuns: {
      daily: dailyRun,
      newAeCheck: newAeRun,
      clickupWorker: clickupRun,
    },
    cursors: {
      airtableDailyDeals: asCursor(
        airtableCursorResult.error ? null : (airtableCursorResult.data as Record<string, unknown> | null),
        "airtable_daily_deals",
      ),
      googleNewAeSubmission: asCursor(
        googleCursorResult.error ? null : (googleCursorResult.data as Record<string, unknown> | null),
        "google_new_ae_submission",
      ),
    },
    delivery: buildDeliveryState(unwrapSupabaseResult(deliveryCounts)),
    staleDeals: {
      thresholdDays: staleThresholdDays,
      clickupCount: readTotalCount(staleClickupResult.data),
      airtableCount: readTotalCount(staleAirtableResult.data),
      clickupSamples: buildStaleClickupSamples(staleClickupResult.data),
      airtableSamples: buildStaleAirtableSamples(staleAirtableResult.data),
      basis: "local_workflow_timestamps",
    },
    coverageReview: buildCoverageReview({
      activeAes: activeAeRows,
      currentVersions: currentVersionRows,
      engagementSnapshots: engagementSnapshotRows,
      rows: coverageReviewRows,
    }),
  });
}

export async function closeOperatorAgentPacketRuntime() {
  await closePool();
}

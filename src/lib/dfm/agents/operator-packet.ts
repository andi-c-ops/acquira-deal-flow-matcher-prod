type RunType = "daily" | "new_ae_backfill" | "reconciliation" | "manual_replay";
type RunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
type CursorReason =
  | "ready"
  | "no_daily_run"
  | "daily_run_not_succeeded"
  | "missing_cursor_end";
type EmailStatus =
  | "unknown"
  | "not_sent_yet"
  | "not_sent_due_to_failure"
  | "failed"
  | "sent"
  | "sent_or_attempted";

export type OperatorPacketRun = {
  id: string;
  runType: RunType;
  status: RunStatus;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  cursorStart: string | null;
  cursorEnd: string | null;
  summary: Record<string, unknown>;
  error?: Record<string, unknown> | null;
};

export type OperatorPacketCursor = {
  key: string;
  cursorTimestamp: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OperatorPacketDeliveryStateInput = {
  pending: number;
  processing: number;
  retryScheduled: number;
  sent: number;
  failedTerminal: number;
  cancelled: number;
  total: number;
};

export type OperatorPacketReceiptIntegrityInput = {
  jobs: number;
  receipts: number;
  distinctTaskIds: number;
  nonSentJobs: number;
};

export type OperatorPacketStaleDeal = {
  label: string;
  detail: string;
  daysStale: number;
  link: string | null;
  lastTouchedAt: string | null;
};

export type OperatorPacketStaleDealsInput = {
  thresholdDays: number;
  clickupCount: number;
  airtableCount: number;
  clickupSamples: OperatorPacketStaleDeal[];
  airtableSamples: OperatorPacketStaleDeal[];
  basis: "local_workflow_timestamps" | "mixed_live_clickup_and_local_airtable";
};

export type OperatorPacketCoverageAe = {
  aeThesisId: string;
  aeName: string;
  aeEmail: string | null;
  deliveryMinMatchQuality: "Strong" | "Moderate";
  engagementStatus: "active_recently" | "inactive_recently" | "unknown";
  recentlyUpdatedDeals14Days: number;
  recentlyUpdatedDeals30Days: number;
  lastClickupActivityAt: string | null;
  deliveredLast7Days: number;
  deliveredLast30Days: number;
  activeStrongCandidates: number;
  activeModerateCandidates: number;
  activeDeliverableCandidates: number;
  thesisSummary: string;
  diagnosis: string;
  recommendation: string;
};

export type OperatorPacketCoverageReviewInput = {
  windowDays: 7;
  lowMatchThreshold: number;
  reviewThreshold30Days: number;
  totalActiveAes: number;
  underservedAeCount: number;
  zeroMatchLast7DaysCount: number;
  noCurrentThesisCount: number;
  noClickupDestinationCount: number;
  engagementSnapshot: {
    status: "current" | "stale_or_unavailable";
    observedAt: string | null;
    expectedRefresh: string;
  };
  flaggedAes: OperatorPacketCoverageAe[];
};

export type BuildOperatorAgentPacketInput = {
  generatedAt: string;
  timezone: string;
  environment: string;
  latestRuns: {
    daily: OperatorPacketRun | null;
    newAeCheck: OperatorPacketRun | null;
    clickupWorker: OperatorPacketRun | null;
  };
  cursors: {
    airtableDailyDeals: OperatorPacketCursor | null;
    googleNewAeSubmission: OperatorPacketCursor | null;
  };
  delivery: OperatorPacketDeliveryStateInput;
  receiptIntegrity: OperatorPacketReceiptIntegrityInput | null;
  staleDeals: OperatorPacketStaleDealsInput;
  coverageReview: OperatorPacketCoverageReviewInput;
};

export type OperatorAgentPacket = {
  workflowContext: {
    serviceName: string;
    environment: string;
    generatedAt: string;
    timezone: string;
    schedules: {
      newAeCheckEastern: string;
      dailyRunEastern: string;
    };
  };
  latestRuns: {
    daily: OperatorPacketRun | null;
    newAeCheck: OperatorPacketRun | null;
    clickupWorker: OperatorPacketRun | null;
  };
  cursorState: {
    airtableDailyDeals: OperatorPacketCursor | null;
    googleNewAeSubmission: OperatorPacketCursor | null;
    cursorAdvanceAllowed: boolean;
    reason: CursorReason;
    expectedBehavior: string;
  };
  deliveryState: OperatorPacketDeliveryStateInput & {
    outstanding: number;
    latestDailyDeliveryMode: string | null;
  };
  receiptState: OperatorPacketReceiptIntegrityInput & {
    runId: string | null;
    parityConfirmed: boolean;
    status: "verified" | "not_required" | "pending" | "mismatch" | "unavailable";
    expectedBehavior: string;
  };
  staleDealState: OperatorPacketStaleDealsInput;
  coverageReview: OperatorPacketCoverageReviewInput;
  emailState: {
    expected: boolean;
    status: EmailStatus;
    subjectLinePreview: string | null;
    lastError: string | null;
  };
  referenceRules: {
    deliveryPath: "daily_run_only";
    thesisPath: "new_thesis_prepares_jobs_only";
    cursorRule: "advance_only_after_successful_delivery";
  };
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readSummaryCount(summary: Record<string, unknown>, key: string) {
  return toNumber(summary[key]);
}

function buildEmailSubjectPreview(run: OperatorPacketRun | null) {
  if (!run) {
    return null;
  }

  const strong = readSummaryCount(run.summary, "totalStrongMatches");
  const moderate = readSummaryCount(run.summary, "totalModerateMatches");
  const aes = readSummaryCount(run.summary, "aesWithMatches");
  const date = run.createdAt ? new Date(run.createdAt) : null;
  const month = date
    ? date.toLocaleString("en-US", {
        month: "short",
        timeZone: "America/New_York",
      })
    : "Unknown";
  const day = date
    ? date.toLocaleString("en-US", {
        day: "numeric",
        timeZone: "America/New_York",
      })
    : "Unknown";

  return `Deal Flow Report | ${month} ${day} | ${strong} strong, ${moderate} moderate (${aes} AEs)`;
}

function deriveCursorState(
  daily: OperatorPacketRun | null,
  airtableCursor: OperatorPacketCursor | null,
  googleCursor: OperatorPacketCursor | null,
) {
  if (!daily) {
    return {
      airtableDailyDeals: airtableCursor,
      googleNewAeSubmission: googleCursor,
      cursorAdvanceAllowed: false,
      reason: "no_daily_run" as const,
      expectedBehavior: "Keep the Airtable cursor parked at the last successful run until a daily run succeeds.",
    };
  }

  if (daily.status !== "succeeded") {
    return {
      airtableDailyDeals: airtableCursor,
      googleNewAeSubmission: googleCursor,
      cursorAdvanceAllowed: false,
      reason: "daily_run_not_succeeded" as const,
      expectedBehavior:
        "Do not move the Airtable cursor forward while the daily run is queued, running, partial, failed, or cancelled.",
    };
  }

  if (!daily.cursorEnd && typeof daily.summary.cursorEnd !== "string") {
    return {
      airtableDailyDeals: airtableCursor,
      googleNewAeSubmission: googleCursor,
      cursorAdvanceAllowed: false,
      reason: "missing_cursor_end" as const,
      expectedBehavior: "Do not advance the Airtable cursor unless the succeeded daily run has a cursor end timestamp.",
    };
  }

  return {
    airtableDailyDeals: airtableCursor,
    googleNewAeSubmission: googleCursor,
    cursorAdvanceAllowed: true,
    reason: "ready" as const,
    expectedBehavior: "The Airtable cursor may advance because the latest daily run succeeded and has a cursor end timestamp.",
  };
}

function deriveEmailState(daily: OperatorPacketRun | null) {
  if (!daily) {
    return {
      expected: false,
      status: "unknown" as const,
      subjectLinePreview: null,
      lastError: null,
    };
  }

  const reportEmail = asObject(daily.summary.reportEmail);
  const reportEmailStatus = typeof reportEmail.status === "string" ? reportEmail.status : null;
  const reportEmailError = typeof reportEmail.error === "string" ? reportEmail.error : null;

  if (reportEmailStatus === "sent") {
    return {
      expected: true,
      status: "sent" as const,
      subjectLinePreview: buildEmailSubjectPreview(daily),
      lastError: null,
    };
  }

  if (reportEmailStatus === "failed") {
    return {
      expected: true,
      status: "failed" as const,
      subjectLinePreview: buildEmailSubjectPreview(daily),
      lastError: reportEmailError,
    };
  }

  if (daily.status === "succeeded") {
    return {
      expected: true,
      status: "sent_or_attempted" as const,
      subjectLinePreview: buildEmailSubjectPreview(daily),
      lastError: null,
    };
  }

  if (daily.status === "failed" || daily.status === "cancelled") {
    return {
      expected: true,
      status: "not_sent_due_to_failure" as const,
      subjectLinePreview: buildEmailSubjectPreview(daily),
      lastError: null,
    };
  }

  return {
    expected: true,
    status: "not_sent_yet" as const,
    subjectLinePreview: buildEmailSubjectPreview(daily),
    lastError: null,
  };
}

function deriveReceiptState(
  daily: OperatorPacketRun | null,
  integrity: OperatorPacketReceiptIntegrityInput | null,
): OperatorAgentPacket["receiptState"] {
  if (!daily) {
    return {
      runId: null,
      jobs: 0,
      receipts: 0,
      distinctTaskIds: 0,
      nonSentJobs: 0,
      parityConfirmed: false,
      status: "unavailable",
      expectedBehavior: "Receipt parity cannot be checked until a daily run exists.",
    };
  }

  if (!integrity) {
    return {
      runId: daily.id,
      jobs: 0,
      receipts: 0,
      distinctTaskIds: 0,
      nonSentJobs: 0,
      parityConfirmed: false,
      status: "unavailable",
      expectedBehavior: "Treat the run as unverified until job-to-receipt integrity is available.",
    };
  }

  const parityConfirmed =
    integrity.jobs === integrity.receipts &&
    integrity.receipts === integrity.distinctTaskIds &&
    integrity.nonSentJobs === 0;

  if (integrity.jobs === 0 && parityConfirmed) {
    return {
      runId: daily.id,
      ...integrity,
      parityConfirmed: true,
      status: "not_required",
      expectedBehavior: "No delivery jobs were created, so no delivery receipts are required.",
    };
  }

  if (parityConfirmed) {
    return {
      runId: daily.id,
      ...integrity,
      parityConfirmed: true,
      status: "verified",
      expectedBehavior: "Every delivery job has one distinct ClickUp receipt and no job remains unsent.",
    };
  }

  const stillRunning = ["queued", "running", "partial"].includes(daily.status);

  return {
    runId: daily.id,
    ...integrity,
    parityConfirmed: false,
    status: stillRunning ? "pending" : "mismatch",
    expectedBehavior: stillRunning
      ? "Keep the run open until every delivery job has one distinct ClickUp receipt."
      : "Do not close the run as fully healthy until job, receipt, and distinct task counts match with no unsent jobs.",
  };
}

function readLatestDailyDeliveryMode(daily: OperatorPacketRun | null) {
  if (!daily) {
    return null;
  }

  const clickupDelivery =
    daily.summary.clickupDelivery &&
    typeof daily.summary.clickupDelivery === "object" &&
    !Array.isArray(daily.summary.clickupDelivery)
      ? (daily.summary.clickupDelivery as Record<string, unknown>)
      : null;

  return typeof clickupDelivery?.mode === "string" ? clickupDelivery.mode : null;
}

export function buildOperatorAgentPacket(
  input: BuildOperatorAgentPacketInput,
): OperatorAgentPacket {
  const cursorState = deriveCursorState(
    input.latestRuns.daily,
    input.cursors.airtableDailyDeals,
    input.cursors.googleNewAeSubmission,
  );
  const emailState = deriveEmailState(input.latestRuns.daily);
  const receiptState = deriveReceiptState(input.latestRuns.daily, input.receiptIntegrity);

  return {
    workflowContext: {
      serviceName: "deal-flow-matcher",
      environment: input.environment,
      generatedAt: input.generatedAt,
      timezone: input.timezone,
      schedules: {
        newAeCheckEastern: "07:00 AM America/New_York",
        dailyRunEastern: "09:30 AM America/New_York",
      },
    },
    latestRuns: input.latestRuns,
    cursorState,
    deliveryState: {
      ...input.delivery,
      outstanding:
        input.delivery.pending + input.delivery.processing + input.delivery.retryScheduled,
      latestDailyDeliveryMode: readLatestDailyDeliveryMode(input.latestRuns.daily),
    },
    receiptState,
    staleDealState: input.staleDeals,
    coverageReview: input.coverageReview,
    emailState,
    referenceRules: {
      deliveryPath: "daily_run_only",
      thesisPath: "new_thesis_prepares_jobs_only",
      cursorRule: "advance_only_after_successful_delivery",
    },
  };
}

export type RunType = "daily" | "new_ae_backfill" | "reconciliation" | "manual_replay";
export type RunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
export type JobStatus =
  | "pending"
  | "processing"
  | "sent"
  | "retry_scheduled"
  | "failed_terminal"
  | "cancelled";

export interface BaseRunResult {
  ok: boolean;
  runId: string;
  status: RunStatus;
  summary?: Record<string, unknown>;
}

export interface RunDailyInput {
  dryRun?: boolean;
  force?: boolean;
  cursorStartOverride?: string | null;
  cursorEndOverride?: string | null;
  skipNotifications?: boolean;
  deferDelivery?: boolean;
}

export interface RunReconcileInput {
  dryRun?: boolean;
  maxJobs?: number;
}

export interface RunNewAeBackfillInput {
  source: string;
  submissionKey: string;
  submittedAt: string;
  payload: Record<string, unknown>;
}

export interface RunNewAeCheckInput {
  dryRun?: boolean;
  force?: boolean;
}

export interface RunReplayInput {
  runId?: string;
  aeThesisId?: string;
  lookbackDays?: number;
  dryRun?: boolean;
  mode: "recompute_and_redeliver" | "ae_backfill";
}

export interface ProcessClickupJobsInput {
  workerId: string;
  maxJobs?: number;
  dryRun?: boolean;
  strictFailure?: boolean;
  skipNotifications?: boolean;
}

export interface RunBacklogRecoveryInput {
  dryRun?: boolean;
  force?: boolean;
  skipNotifications?: boolean;
  windowSeconds?: number;
  probeWindowSeconds?: number;
  maxDealsPerRun?: number;
  overlapMs?: number;
  minLagSeconds?: number;
  maxCursorEndOverride?: string | null;
}

export interface NormalizedAeThesis {
  aeName: string;
  aeEmail?: string | null;
  industries: string[];
  geography: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  ebitdaMin?: number | null;
  ebitdaMax?: number | null;
  summary: string;
  normalizationVersion: string;
}

export interface NormalizedDeal {
  airtableRecordId: string;
  businessName: string;
  industry?: string | null;
  location?: string | null;
  state?: string | null;
  price?: number | null;
  ebitda?: number | null;
  multiple?: number | null;
  listingUrl?: string | null;
  description?: string | null;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
}

export interface MatchCriterionDetail {
  criterion: string;
  match: boolean;
  score: number;
  dealValue: string;
  thesisValue: string;
}

export interface MatchScore {
  scorePct: number;
  matchQuality: "Strong" | "Moderate" | "Weak";
  deliveryEligible: boolean;
  criteriaDetails: MatchCriterionDetail[];
}

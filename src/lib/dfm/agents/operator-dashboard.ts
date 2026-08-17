import type { OperatorAgentPacket } from "@/lib/dfm/agents/operator-packet";

type AlertTone = "good" | "warning" | "danger";

export type OperatorDashboardViewModel = {
  hero: {
    statusLabel: string;
    summaryLine: string;
    generatedAt: string;
    quickFacts: Array<{
      label: string;
      value: string;
    }>;
  };
  runControl: {
    label: string;
    detail: string;
    tone: AlertTone;
    checks: Array<{
      label: string;
      value: string;
      detail: string;
      tone: AlertTone;
    }>;
  };
  alerts: Array<{
    title: string;
    detail: string;
    tone: AlertTone;
  }>;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  latestRuns: Array<{
    label: string;
    status: string;
    runId: string | null;
    when: string;
  }>;
  coverageReview: {
    title: string;
    ruleLabel: string;
    metrics: Array<{
      label: string;
      value: string;
    }>;
    flaggedAes: Array<{
      label: string;
      detail: string;
      lastTouched: string;
      link: string | null;
    }>;
  };
  staleDeals: {
    thresholdLabel: string;
    basisLabel: string;
    metrics: Array<{
      label: string;
      value: string;
    }>;
    clickupSamples: Array<{
      label: string;
      detail: string;
      lastTouched: string;
      link: string | null;
    }>;
    airtableSamples: Array<{
      label: string;
      detail: string;
      lastTouched: string;
      link: string | null;
    }>;
  };
  archiveCandidates: {
    title: string;
    ruleLabel: string;
    metrics: Array<{
      label: string;
      value: string;
    }>;
    clickupCandidates: Array<{
      label: string;
      detail: string;
      lastTouched: string;
      link: string | null;
    }>;
    airtableCandidates: Array<{
      label: string;
      detail: string;
      lastTouched: string;
      link: string | null;
    }>;
  };
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
}

function buildSummaryLine(packet: OperatorAgentPacket) {
  const dailySummary = packet.latestRuns.daily?.summary ?? {};
  const fetchedDeals = toNumber(dailySummary.fetchedDeals);
  const strong = toNumber(dailySummary.totalStrongMatches);
  const moderate = toNumber(dailySummary.totalModerateMatches);
  const aes = toNumber(dailySummary.aesWithMatches);

  return `${fetchedDeals} deals fetched, ${strong} strong, ${moderate} moderate, ${aes} AEs matched`;
}

function readLatestDeliveryMode(packet: OperatorAgentPacket) {
  const mode = packet.deliveryState.latestDailyDeliveryMode;

  if (!mode) {
    return "Not available";
  }

  if (mode === "stale_running_integrity_check") {
    return "Recovered after timeout";
  }

  if (mode === "deferred_worker") {
    return "Deferred worker delivery";
  }

  if (mode === "inline_strict") {
    return "Inline strict delivery";
  }

  if (mode === "no_delivery_jobs") {
    return "No delivery jobs";
  }

  return mode;
}

function buildStatusLabel(packet: OperatorAgentPacket) {
  if (packet.emailState.status === "failed" || packet.deliveryState.failedTerminal > 0) {
    return "Action needed";
  }

  if (!packet.cursorState.cursorAdvanceAllowed || packet.deliveryState.outstanding > 0) {
    return "Action needed";
  }

  return "Healthy";
}

function emailLabel(packet: OperatorAgentPacket) {
  if (packet.emailState.status === "sent") return "Sent";
  if (packet.emailState.status === "failed") return "Failed";
  if (packet.emailState.status === "sent_or_attempted") return "Unverified";
  if (packet.emailState.status === "not_sent_due_to_failure") return "Blocked";
  if (packet.emailState.status === "not_sent_yet") return "Pending";
  return "Unknown";
}

function emailTone(packet: OperatorAgentPacket): AlertTone {
  if (packet.emailState.status === "sent") return "good";
  if (packet.emailState.status === "failed" || packet.emailState.status === "not_sent_due_to_failure") return "danger";
  return "warning";
}

function runTone(status: string | undefined): AlertTone {
  return status === "succeeded" ? "good" : status === "failed" || status === "cancelled" ? "danger" : "warning";
}

function buildRunControl(packet: OperatorAgentPacket): OperatorDashboardViewModel["runControl"] {
  const emailFailed = packet.emailState.status === "failed";
  const emailUnverified = packet.emailState.status === "sent_or_attempted" || packet.emailState.status === "unknown";
  const runStatus = packet.latestRuns.daily?.status ?? "missing";
  const runProblem = runStatus !== "succeeded";
  const deliveryProblem = packet.deliveryState.failedTerminal > 0 || packet.deliveryState.outstanding > 0;
  const cursorProblem = !packet.cursorState.cursorAdvanceAllowed;

  const blocker = emailFailed
    ? packet.emailState.lastError ?? "The daily report could not be sent."
    : packet.deliveryState.failedTerminal > 0
      ? `${packet.deliveryState.failedTerminal} ClickUp delivery job(s) failed.`
    : packet.deliveryState.outstanding > 0
        ? `${packet.deliveryState.outstanding} ClickUp delivery job(s) are still processing.`
        : emailUnverified
          ? "This historical run has no persisted report-email receipt, so email delivery cannot be confirmed."
        : runProblem
          ? "Today’s daily run has not completed successfully."
          : cursorProblem
            ? "The Airtable cursor is safely parked until the run can complete."
            : "Today’s scheduled workflow completed with a clear delivery queue.";

  return {
    label: emailFailed || emailUnverified || runProblem || deliveryProblem || cursorProblem ? "Attention required" : "Today is complete",
    detail: blocker,
    tone: emailFailed || packet.deliveryState.failedTerminal > 0 ? "danger" : emailUnverified || runProblem || deliveryProblem || cursorProblem ? "warning" : "good",
    checks: [
      {
        label: "9:30 AM daily run",
        value: runStatus,
        detail: packet.latestRuns.daily?.createdAt ? `Started ${formatTimestamp(packet.latestRuns.daily.createdAt)}` : "No daily run record is available.",
        tone: runTone(runStatus),
      },
      {
        label: "Report email",
        value: emailLabel(packet),
        detail: packet.emailState.lastError ?? packet.emailState.subjectLinePreview ?? "No report email has been recorded yet.",
        tone: emailTone(packet),
      },
      {
        label: "Airtable cursor",
        value: packet.cursorState.cursorAdvanceAllowed ? "Safe" : "Parked",
        detail: packet.cursorState.airtableDailyDeals?.cursorTimestamp
          ? `Last safe cursor: ${formatTimestamp(packet.cursorState.airtableDailyDeals.cursorTimestamp)}`
          : "No Airtable cursor is recorded.",
        tone: packet.cursorState.cursorAdvanceAllowed ? "good" : "warning",
      },
      {
        label: "ClickUp delivery",
        value: packet.deliveryState.outstanding > 0 ? `${packet.deliveryState.outstanding} open` : "Clear",
        detail: `${packet.deliveryState.sent} sent, ${packet.deliveryState.failedTerminal} terminal failure(s).`,
        tone: packet.deliveryState.failedTerminal > 0 ? "danger" : packet.deliveryState.outstanding > 0 ? "warning" : "good",
      },
      {
        label: "Next scheduled checks",
        value: "7:00 AM and 9:30 AM ET",
        detail: "New thesis check at 7:00 AM. Daily deal run at 9:30 AM.",
        tone: "good",
      },
    ],
  };
}

function buildAlerts(packet: OperatorAgentPacket) {
  const alerts: OperatorDashboardViewModel["alerts"] = [];

  if (!packet.cursorState.cursorAdvanceAllowed) {
    alerts.push({
      title: "Cursor is safely parked",
      detail: packet.cursorState.expectedBehavior,
      tone: "warning",
    });
  } else {
    alerts.push({
      title: "Cursor can move",
      detail: packet.cursorState.expectedBehavior,
      tone: "good",
    });
  }

  if (packet.deliveryState.outstanding > 0) {
    alerts.push({
      title: "Delivery queue still has work",
      detail: `${packet.deliveryState.outstanding} delivery jobs are still pending, processing, or waiting for retry.`,
      tone: "warning",
    });
  } else if (packet.deliveryState.failedTerminal > 0) {
    alerts.push({
      title: "Terminal delivery failures detected",
      detail: `${packet.deliveryState.failedTerminal} delivery jobs ended in a terminal failure state.`,
      tone: "danger",
    });
  } else {
    alerts.push({
      title: "Delivery queue is clear",
      detail: "No delivery jobs are waiting in the queue right now.",
      tone: "good",
    });
  }

  if (packet.emailState.status === "not_sent_yet") {
    alerts.push({
      title: "Report email has not gone out yet",
      detail: "The daily run has not fully completed, so the summary email is not expected yet.",
      tone: "warning",
    });
  } else if (packet.emailState.status === "not_sent_due_to_failure") {
    alerts.push({
      title: "Report email was blocked by failure",
      detail: "The run did not end cleanly, so a normal daily report should not be treated as sent.",
      tone: "danger",
    });
  } else if (packet.emailState.status === "failed") {
    alerts.push({
      title: "Report email failed",
      detail: packet.emailState.lastError ?? "The daily run completed, but the report email could not be sent.",
      tone: "danger",
    });
  } else if (packet.emailState.status === "sent") {
    alerts.push({
      title: "Report email sent",
      detail: packet.emailState.subjectLinePreview ?? "The daily report was sent after the completed run.",
      tone: "good",
    });
  } else if (packet.emailState.status === "sent_or_attempted") {
    alerts.push({
      title: "Report email should be available",
      detail: packet.emailState.subjectLinePreview
        ? `Expected subject: ${packet.emailState.subjectLinePreview}`
        : "The daily report was sent or attempted from the succeeded run.",
      tone: "good",
    });
  }

  if (packet.coverageReview.underservedAeCount > 0) {
    alerts.push({
      title: "Some AEs may be under-served",
      detail: `${packet.coverageReview.underservedAeCount} active AEs are below the current weekly or 30-day match thresholds and should be reviewed.`,
      tone: "warning",
    });
  }

  if (packet.coverageReview.engagementSnapshot.status !== "current") {
    alerts.push({
      title: "ClickUp engagement snapshot needs refresh",
      detail: "Coverage and delivery counts are current, but recent ClickUp deal-work activity is unavailable until the scheduled snapshot succeeds.",
      tone: "warning",
    });
  }

  return alerts;
}

export function buildOperatorDashboardViewModel(
  packet: OperatorAgentPacket,
): OperatorDashboardViewModel {
  return {
    hero: {
      statusLabel: buildStatusLabel(packet),
      summaryLine: buildSummaryLine(packet),
      generatedAt: formatTimestamp(packet.workflowContext.generatedAt),
      quickFacts: [
        {
          label: "Daily run",
          value: packet.latestRuns.daily?.status ?? "missing",
        },
        {
          label: "Cursor",
          value: packet.cursorState.cursorAdvanceAllowed ? "Safe to advance" : "Safely parked",
        },
        {
          label: "Delivery mode",
          value: readLatestDeliveryMode(packet),
        },
        {
          label: "Report",
          value:
            packet.emailState.status === "sent_or_attempted"
              ? "Sent or attempted"
              : packet.emailState.status === "not_sent_due_to_failure"
                ? "Blocked by failure"
                : "Not sent yet",
        },
      ],
    },
    runControl: buildRunControl(packet),
    alerts: buildAlerts(packet),
    metrics: [
      { label: "Pending delivery", value: String(packet.deliveryState.pending) },
      { label: "Processing delivery", value: String(packet.deliveryState.processing) },
      { label: "Retry scheduled", value: String(packet.deliveryState.retryScheduled) },
      { label: "Sent jobs", value: String(packet.deliveryState.sent) },
      { label: "Terminal failures", value: String(packet.deliveryState.failedTerminal) },
      {
        label: "Airtable daily cursor",
        value: packet.cursorState.airtableDailyDeals?.cursorTimestamp
          ? formatTimestamp(packet.cursorState.airtableDailyDeals.cursorTimestamp)
          : "Not set",
      },
    ],
    latestRuns: [
      {
        label: "Daily run",
        status: packet.latestRuns.daily?.status ?? "missing",
        runId: packet.latestRuns.daily?.id ?? null,
        when: formatTimestamp(packet.latestRuns.daily?.createdAt ?? null),
      },
      {
        label: "New AE check",
        status: packet.latestRuns.newAeCheck?.status ?? "missing",
        runId: packet.latestRuns.newAeCheck?.id ?? null,
        when: formatTimestamp(packet.latestRuns.newAeCheck?.createdAt ?? null),
      },
      {
        label: "ClickUp worker",
        status: packet.latestRuns.clickupWorker?.status ?? "missing",
        runId: packet.latestRuns.clickupWorker?.id ?? null,
        when: formatTimestamp(packet.latestRuns.clickupWorker?.createdAt ?? null),
      },
    ],
    coverageReview: {
      title: "AE coverage review",
      ruleLabel: `Weekly review flag: fewer than ${packet.coverageReview.lowMatchThreshold} delivered matches in ${packet.coverageReview.windowDays} days or fewer than ${packet.coverageReview.reviewThreshold30Days} delivered matches in 30 days.`,
      metrics: [
        {
          label: "Active AEs reviewed",
          value: String(packet.coverageReview.totalActiveAes),
        },
        {
          label: "Flagged under-served AEs",
          value: String(packet.coverageReview.underservedAeCount),
        },
        {
          label: "Zero matches in 7 days",
          value: String(packet.coverageReview.zeroMatchLast7DaysCount),
        },
        {
          label: "Missing current thesis",
          value: String(packet.coverageReview.noCurrentThesisCount),
        },
        {
          label: "Missing ClickUp destination",
          value: String(packet.coverageReview.noClickupDestinationCount),
        },
      ],
      flaggedAes: packet.coverageReview.flaggedAes.map((item) => ({
        label: item.aeName,
        detail: `${item.diagnosis}. ClickUp engagement: ${item.engagementStatus === "active_recently" ? `${item.recentlyUpdatedDeals14Days} deal tasks updated in the last 14 days` : item.engagementStatus === "inactive_recently" ? "no recent ClickUp deal activity in the last 14 days" : "not yet available from the scheduled snapshot"}. 7-day deliveries: ${item.deliveredLast7Days}. 30-day deliveries: ${item.deliveredLast30Days}. Active deliverable matches now: ${item.activeDeliverableCandidates}. ${item.recommendation}`,
        lastTouched:
          item.lastClickupActivityAt
            ? `Last ClickUp activity: ${formatTimestamp(item.lastClickupActivityAt)} | ${item.thesisSummary}`
            : `Last ClickUp activity: Not available | ${item.thesisSummary}`,
        link: null,
      })),
    },
    staleDeals: {
      thresholdLabel: `${packet.staleDealState.thresholdDays}-day stale review`,
      basisLabel:
        packet.staleDealState.basis === "mixed_live_clickup_and_local_airtable"
          ? "ClickUp counts come from live task timestamps in AE Deals lists. Airtable counts still come from Deal Flow Matcher timestamps."
          : packet.staleDealState.basis === "local_workflow_timestamps"
            ? "Based on Deal Flow Matcher timestamps, not confirmed human activity inside ClickUp."
            : "Basis not available.",
      metrics: [
        {
          label: "Stale ClickUp-delivered deals",
          value: String(packet.staleDealState.clickupCount),
        },
        {
          label: "Stale Airtable deals",
          value: String(packet.staleDealState.airtableCount),
        },
      ],
      clickupSamples: packet.staleDealState.clickupSamples.map((item) => ({
        label: item.label,
        detail: item.detail,
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
      airtableSamples: packet.staleDealState.airtableSamples.map((item) => ({
        label: item.label,
        detail: item.detail,
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
    },
    archiveCandidates: {
      title: "Archive candidate review",
      ruleLabel:
        "Read-only review list. Candidates are 90-plus-day stale records based on Deal Flow Matcher timestamps and still require manual approval before any archive or delete action.",
      metrics: [
        {
          label: "ClickUp archive candidates",
          value: String(packet.staleDealState.clickupCount),
        },
        {
          label: "Airtable archive candidates",
          value: String(packet.staleDealState.airtableCount),
        },
      ],
      clickupCandidates: packet.staleDealState.clickupSamples.map((item) => ({
        label: item.label,
        detail: "Candidate for manual ClickUp archive review only.",
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
      airtableCandidates: packet.staleDealState.airtableSamples.map((item) => ({
        label: item.label,
        detail: "Candidate for manual Airtable archive review only.",
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
    },
  };
}

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

function humanizeOperatorText(value: string) {
  return value
    .replaceAll("Airtable cursor", "new-deals checkpoint")
    .replaceAll("delivery jobs", "tasks")
    .replaceAll("receipts", "task confirmations")
    .replaceAll("ClickUp tasks", "tasks");
}

function buildSummaryLine(packet: OperatorAgentPacket) {
  const dailySummary = packet.latestRuns.daily?.summary ?? {};
  const fetchedDeals = toNumber(dailySummary.fetchedDeals);
  const strong = toNumber(dailySummary.totalStrongMatches);
  const moderate = toNumber(dailySummary.totalModerateMatches);
  const aes = toNumber(dailySummary.aesWithMatches);

  return `${fetchedDeals} deals reviewed, ${strong} high-confidence matches, ${moderate} possible matches, ${aes} entrepreneurs matched`;
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
    return "Tasks sent in the background";
  }

  if (mode === "inline_strict") {
    return "Tasks sent before finishing";
  }

  if (mode === "no_delivery_jobs") {
    return "No tasks to send";
  }

  return mode;
}

function buildStatusLabel(packet: OperatorAgentPacket) {
  if (
    packet.emailState.status === "failed" ||
    packet.deliveryState.failedTerminal > 0 ||
    packet.receiptState.status === "mismatch"
  ) {
    return "Action needed";
  }

  if (
    !packet.cursorState.cursorAdvanceAllowed ||
    packet.deliveryState.outstanding > 0 ||
    packet.receiptState.status === "unavailable" ||
    packet.receiptState.status === "pending"
  ) {
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

function runStatusLabel(status: string | undefined) {
  switch (status ?? "missing") {
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "running":
      return "In progress";
    case "queued":
      return "Queued";
    case "missing":
      return "Not available";
    default:
      return (status ?? "Not available").replaceAll("_", " ");
  }
}

function buildRunControl(packet: OperatorAgentPacket): OperatorDashboardViewModel["runControl"] {
  const emailFailed = packet.emailState.status === "failed";
  const emailUnverified = packet.emailState.status === "sent_or_attempted" || packet.emailState.status === "unknown";
  const runStatus = packet.latestRuns.daily?.status ?? "missing";
  const runProblem = runStatus !== "succeeded";
  const deliveryProblem = packet.deliveryState.failedTerminal > 0 || packet.deliveryState.outstanding > 0;
  const receiptProblem = !packet.receiptState.parityConfirmed;
  const cursorProblem = !packet.cursorState.cursorAdvanceAllowed;

  const blocker = emailFailed
    ? packet.emailState.lastError ?? "The daily report could not be sent."
    : packet.receiptState.status === "mismatch"
      ? `${packet.receiptState.receipts} task confirmations exist for ${packet.receiptState.jobs} tasks.`
    : packet.deliveryState.failedTerminal > 0
      ? `${packet.deliveryState.failedTerminal} tasks could not be sent to ClickUp.`
    : packet.deliveryState.outstanding > 0
        ? `${packet.deliveryState.outstanding} tasks are still being sent to ClickUp.`
        : emailUnverified
          ? "There is no saved confirmation that the report email was delivered."
        : runProblem
          ? "Today’s daily run has not completed successfully."
          : cursorProblem
            ? "The new-deals checkpoint is safely paused until the run can complete."
            : receiptProblem
              ? humanizeOperatorText(packet.receiptState.expectedBehavior)
              : "Today’s scheduled workflow completed. All task confirmations are in place.";

  return {
    label: emailFailed || emailUnverified || runProblem || deliveryProblem || cursorProblem || receiptProblem ? "Attention required" : "Today is complete",
    detail: blocker,
    tone: emailFailed || packet.deliveryState.failedTerminal > 0 || packet.receiptState.status === "mismatch" ? "danger" : emailUnverified || runProblem || deliveryProblem || cursorProblem || receiptProblem ? "warning" : "good",
    checks: [
      {
        label: "9:30 AM daily run",
        value: runStatusLabel(runStatus),
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
        label: "New-deals checkpoint",
        value: packet.cursorState.cursorAdvanceAllowed ? "Safe" : "Parked",
        detail: packet.cursorState.airtableDailyDeals?.cursorTimestamp
          ? `Last checkpoint: ${formatTimestamp(packet.cursorState.airtableDailyDeals.cursorTimestamp)}`
          : "No new-deals checkpoint is recorded.",
        tone: packet.cursorState.cursorAdvanceAllowed ? "good" : "warning",
      },
      {
        label: "Tasks sent to ClickUp",
        value: packet.deliveryState.outstanding > 0 ? `${packet.deliveryState.outstanding} open` : "Clear",
        detail: `${packet.deliveryState.sent} sent, ${packet.deliveryState.failedTerminal} not delivered.`,
        tone: packet.deliveryState.failedTerminal > 0 ? "danger" : packet.deliveryState.outstanding > 0 ? "warning" : "good",
      },
      {
        label: "Task confirmations",
        value:
          packet.receiptState.status === "not_required"
            ? "Not required"
            : packet.receiptState.parityConfirmed
              ? `${packet.receiptState.receipts}/${packet.receiptState.jobs} verified`
              : `${packet.receiptState.receipts}/${packet.receiptState.jobs}`,
        detail: humanizeOperatorText(packet.receiptState.expectedBehavior),
        tone:
          packet.receiptState.status === "mismatch"
            ? "danger"
            : packet.receiptState.parityConfirmed
              ? "good"
              : "warning",
      },
      {
        label: "Next scheduled checks",
        value: "7:00 AM and 9:30 AM ET",
        detail: "New investment-focus check at 7:00 AM. Daily deal run at 9:30 AM.",
        tone: "good",
      },
    ],
  };
}

function buildAlerts(packet: OperatorAgentPacket) {
  const alerts: OperatorDashboardViewModel["alerts"] = [];

  if (!packet.cursorState.cursorAdvanceAllowed) {
    alerts.push({
      title: "New-deals checkpoint is paused",
      detail: humanizeOperatorText(packet.cursorState.expectedBehavior),
      tone: "warning",
    });
  } else {
    alerts.push({
      title: "New-deals checkpoint can move",
      detail: humanizeOperatorText(packet.cursorState.expectedBehavior),
      tone: "good",
    });
  }

  if (packet.deliveryState.outstanding > 0) {
    alerts.push({
      title: "Tasks are still being sent",
      detail: `${packet.deliveryState.outstanding} tasks are still waiting, processing, or scheduled to retry.`,
      tone: "warning",
    });
  } else if (packet.deliveryState.failedTerminal > 0) {
    alerts.push({
      title: "Some tasks could not be delivered",
      detail: `${packet.deliveryState.failedTerminal} tasks could not be delivered.`,
      tone: "danger",
    });
  } else {
    alerts.push({
      title: "All tasks have been sent",
      detail: "No tasks are waiting to be sent right now.",
      tone: "good",
    });
  }

  if (packet.receiptState.status === "mismatch") {
    alerts.push({
      title: "Task confirmations do not match",
      detail: packet.receiptState.expectedBehavior.replaceAll("delivery jobs", "tasks").replaceAll("receipts", "confirmations"),
      tone: "danger",
    });
  } else if (packet.receiptState.status === "unavailable") {
    alerts.push({
      title: "Task confirmation evidence is unavailable",
      detail: humanizeOperatorText(packet.receiptState.expectedBehavior),
      tone: "warning",
    });
  } else if (packet.receiptState.status === "verified") {
    alerts.push({
      title: "Task confirmations verified",
      detail: `${packet.receiptState.receipts} confirmations match ${packet.receiptState.jobs} tasks and ${packet.receiptState.distinctTaskIds} distinct ClickUp tasks.`,
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
      title: "Some entrepreneurs may need more coverage",
      detail: `${packet.coverageReview.underservedAeCount} active entrepreneurs are below the current weekly or 30-day match thresholds and should be reviewed.`,
      tone: "warning",
    });
  }

  if (packet.coverageReview.engagementSnapshot.status !== "current") {
    alerts.push({
      title: "Recent task activity needs a refresh",
      detail: "Coverage and delivery counts are current, but recent task activity is unavailable until the scheduled check succeeds.",
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
          value: runStatusLabel(packet.latestRuns.daily?.status),
        },
        {
          label: "New-deals checkpoint",
          value: packet.cursorState.cursorAdvanceAllowed ? "Safe to advance" : "Safely parked",
        },
        {
          label: "Task delivery",
          value: readLatestDeliveryMode(packet),
        },
        {
          label: "Report",
          value: emailLabel(packet),
        },
      ],
    },
    runControl: buildRunControl(packet),
    alerts: buildAlerts(packet),
    metrics: [
      { label: "Tasks waiting to be sent", value: String(packet.deliveryState.pending) },
      { label: "Tasks being sent", value: String(packet.deliveryState.processing) },
      { label: "Tasks scheduled to try again", value: String(packet.deliveryState.retryScheduled) },
      { label: "Tasks sent", value: String(packet.deliveryState.sent) },
      { label: "Tasks not delivered", value: String(packet.deliveryState.failedTerminal) },
      {
        label: "New-deals checkpoint",
        value: packet.cursorState.airtableDailyDeals?.cursorTimestamp
          ? formatTimestamp(packet.cursorState.airtableDailyDeals.cursorTimestamp)
          : "Not set",
      },
    ],
    latestRuns: [
      {
        label: "Daily run",
        status: runStatusLabel(packet.latestRuns.daily?.status),
        runId: packet.latestRuns.daily?.id ?? null,
        when: formatTimestamp(packet.latestRuns.daily?.createdAt ?? null),
      },
      {
        label: "New entrepreneur check",
        status: runStatusLabel(packet.latestRuns.newAeCheck?.status),
        runId: packet.latestRuns.newAeCheck?.id ?? null,
        when: formatTimestamp(packet.latestRuns.newAeCheck?.createdAt ?? null),
      },
      {
        label: "Task delivery check",
        status: runStatusLabel(packet.latestRuns.clickupWorker?.status),
        runId: packet.latestRuns.clickupWorker?.id ?? null,
        when: formatTimestamp(packet.latestRuns.clickupWorker?.createdAt ?? null),
      },
    ],
    coverageReview: {
      title: "Acquisition Entrepreneur coverage review",
      ruleLabel: `Flag for review when an entrepreneur has fewer than ${packet.coverageReview.lowMatchThreshold} delivered matches in ${packet.coverageReview.windowDays} days or fewer than ${packet.coverageReview.reviewThreshold30Days} delivered matches in 30 days.`,
      metrics: [
        {
          label: "Entrepreneurs reviewed",
          value: String(packet.coverageReview.totalActiveAes),
        },
        {
          label: "Entrepreneurs needing review",
          value: String(packet.coverageReview.underservedAeCount),
        },
        {
          label: "Zero matches in 7 days",
          value: String(packet.coverageReview.zeroMatchLast7DaysCount),
        },
        {
          label: "Missing current investment focus",
          value: String(packet.coverageReview.noCurrentThesisCount),
        },
        {
          label: "Missing task destination",
          value: String(packet.coverageReview.noClickupDestinationCount),
        },
      ],
      flaggedAes: packet.coverageReview.flaggedAes.map((item) => ({
        label: item.aeName,
        detail: `${item.diagnosis}. Recent task activity: ${item.engagementStatus === "active_recently" ? `${item.recentlyUpdatedDeals14Days} deal tasks updated in the last 14 days` : item.engagementStatus === "inactive_recently" ? "no recent deal-task activity in the last 14 days" : "not yet available from the scheduled snapshot"}. 7-day deliveries: ${item.deliveredLast7Days}. 30-day deliveries: ${item.deliveredLast30Days}. Active matches now: ${item.activeDeliverableCandidates}. ${item.recommendation}`,
        lastTouched:
          item.lastClickupActivityAt
            ? `Last task activity: ${formatTimestamp(item.lastClickupActivityAt)} | Investment focus: ${item.thesisSummary}`
            : `Last task activity: Not available | Investment focus: ${item.thesisSummary}`,
        link: null,
      })),
    },
    staleDeals: {
      thresholdLabel: `Deals with no activity for ${packet.staleDealState.thresholdDays}+ days`,
      basisLabel:
        packet.staleDealState.basis === "mixed_live_clickup_and_local_airtable"
          ? "Task counts use recent task updates. Source counts use Deal Flow Matcher timestamps. These may not reflect conversations or work outside the recorded systems."
          : packet.staleDealState.basis === "local_workflow_timestamps"
            ? "Based on recorded Deal Flow Matcher timestamps, which may not reflect conversations or work outside the system."
            : "The review basis is not available.",
      metrics: [
        {
          label: "Deals with no recent task update",
          value: String(packet.staleDealState.clickupCount),
        },
        {
          label: "Deals with no recent source update",
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
      title: "Records to review before archiving",
      ruleLabel:
        "Read-only list of records with no recorded activity for 90+ days. Nothing is archived or deleted without manual approval.",
      metrics: [
        {
          label: "Task records to review",
          value: String(packet.staleDealState.clickupCount),
        },
        {
          label: "Source records to review",
          value: String(packet.staleDealState.airtableCount),
        },
      ],
      clickupCandidates: packet.staleDealState.clickupSamples.map((item) => ({
        label: item.label,
        detail: "Candidate for manual task archive review only.",
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
      airtableCandidates: packet.staleDealState.airtableSamples.map((item) => ({
        label: item.label,
        detail: "Candidate for manual source archive review only.",
        lastTouched: formatTimestamp(item.lastTouchedAt),
        link: item.link,
      })),
    },
  };
}

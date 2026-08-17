import test from "node:test";
import assert from "node:assert/strict";

import { buildOperatorDashboardViewModel } from "../../src/lib/dfm/agents/operator-dashboard";
import type { OperatorAgentPacket } from "../../src/lib/dfm/agents/operator-packet";

test("buildOperatorDashboardViewModel includes stale-deal counts and samples", () => {
  const packet: OperatorAgentPacket = {
    workflowContext: {
      serviceName: "deal-flow-matcher",
      environment: "production",
      generatedAt: "2026-08-12T13:00:00.000Z",
      timezone: "America/New_York",
      schedules: {
        newAeCheckEastern: "07:00 AM America/New_York",
        dailyRunEastern: "09:30 AM America/New_York",
      },
    },
    latestRuns: {
      daily: null,
      newAeCheck: null,
      clickupWorker: null,
    },
    cursorState: {
      airtableDailyDeals: null,
      googleNewAeSubmission: null,
      cursorAdvanceAllowed: false,
      reason: "no_daily_run",
      expectedBehavior: "Keep the Airtable cursor parked.",
    },
    deliveryState: {
      pending: 0,
      processing: 0,
      retryScheduled: 0,
      sent: 12,
      failedTerminal: 0,
      cancelled: 0,
      total: 12,
      outstanding: 0,
      latestDailyDeliveryMode: "inline",
    },
    staleDealState: {
      thresholdDays: 90,
      clickupCount: 3,
      airtableCount: 7,
      basis: "mixed_live_clickup_and_local_airtable",
      clickupSamples: [
        {
          label: "AE One | Deal One",
          detail: "Live ClickUp task has been untouched for 120 days.",
          daysStale: 120,
          link: "https://app.clickup.com/t/abc123",
          lastTouchedAt: "2026-04-01T12:00:00.000Z",
        },
      ],
      airtableSamples: [
        {
          label: "Deal Two | rec123",
          detail: "Airtable-side normalized deal has been locally untouched for 101 days.",
          daysStale: 101,
          link: "https://example.com/deal-two",
          lastTouchedAt: "2026-05-03T12:00:00.000Z",
        },
      ],
    },
    coverageReview: {
      windowDays: 7,
      lowMatchThreshold: 1,
      reviewThreshold30Days: 3,
      totalActiveAes: 34,
      underservedAeCount: 4,
      zeroMatchLast7DaysCount: 8,
      noCurrentThesisCount: 1,
      noClickupDestinationCount: 2,
      engagementSnapshot: {
        status: "current",
        observedAt: "2026-08-12T11:45:00.000Z",
        expectedRefresh: "Every 6 hours by the scheduled ClickUp engagement snapshot.",
      },
      flaggedAes: [
        {
          aeThesisId: "ae-1",
          aeName: "AE One",
          aeEmail: "ae1@example.com",
          deliveryMinMatchQuality: "Moderate",
          engagementStatus: "inactive_recently",
          recentlyUpdatedDeals14Days: 0,
          recentlyUpdatedDeals30Days: 1,
          lastClickupActivityAt: "2026-08-01T12:00:00.000Z",
          deliveredLast7Days: 0,
          deliveredLast30Days: 1,
          activeStrongCandidates: 0,
          activeModerateCandidates: 0,
          activeDeliverableCandidates: 0,
          thesisSummary: "Industries: HVAC | Geography: Texas",
          diagnosis: "Criteria may be too narrow",
          recommendation: "Review core filters first.",
        },
      ],
    },
    emailState: {
      expected: false,
      status: "unknown",
      subjectLinePreview: null,
    },
    referenceRules: {
      deliveryPath: "daily_run_only",
      thesisPath: "new_thesis_prepares_jobs_only",
      cursorRule: "advance_only_after_successful_delivery",
    },
  };

  const view = buildOperatorDashboardViewModel(packet);

  assert.equal(view.coverageReview.metrics[0]?.value, "34");
  assert.equal(view.coverageReview.metrics[1]?.value, "4");
  assert.match(view.coverageReview.ruleLabel, /fewer than 1 delivered matches in 7 days/);
  assert.equal(view.coverageReview.flaggedAes[0]?.label, "AE One");
  assert.match(view.coverageReview.flaggedAes[0]?.detail, /Criteria may be too narrow/);
  assert.match(view.coverageReview.flaggedAes[0]?.detail ?? "", /no recent ClickUp deal activity/);
  assert.match(view.coverageReview.flaggedAes[0]?.lastTouched ?? "", /Last ClickUp activity:/);
  assert.equal(view.staleDeals.thresholdLabel, "90-day stale review");
  assert.equal(view.staleDeals.metrics[0]?.value, "3");
  assert.equal(view.staleDeals.metrics[1]?.value, "7");
  assert.equal(view.staleDeals.clickupSamples[0]?.label, "AE One | Deal One");
  assert.match(view.staleDeals.basisLabel, /ClickUp counts come from live task timestamps/);
  assert.equal(view.archiveCandidates.metrics[0]?.value, "3");
  assert.equal(view.archiveCandidates.metrics[1]?.value, "7");
  assert.equal(
    view.archiveCandidates.clickupCandidates[0]?.detail,
    "Candidate for manual ClickUp archive review only.",
  );
});

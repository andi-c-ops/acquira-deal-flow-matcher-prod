import test from "node:test";
import assert from "node:assert/strict";

import { buildOperatorAgentPacket } from "../../src/lib/dfm/agents/operator-packet";

test("buildOperatorAgentPacket derives email and cursor guardrails from live-style run summaries", () => {
  const packet = buildOperatorAgentPacket({
    generatedAt: "2026-08-12T12:00:00.000Z",
    timezone: "America/New_York",
    environment: "production",
    latestRuns: {
      daily: {
        id: "daily-1",
        runType: "daily",
        status: "partial",
        createdAt: "2026-08-12T09:30:00.000Z",
        startedAt: "2026-08-12T09:30:05.000Z",
        finishedAt: null,
        cursorStart: "2026-08-11T13:30:00.000Z",
        cursorEnd: "2026-08-12T13:30:00.000Z",
        summary: {
          mode: "daily",
          fetchedDeals: 8,
          activeAes: 34,
          activeAesWithCurrentThesis: 34,
          deliveryJobsCreatedOrEligible: 5,
          totalStrongMatches: 2,
          totalModerateMatches: 3,
          aesWithMatches: 4,
          clickupDelivery: {
            mode: "deferred_queue",
            pending: 5,
          },
        },
      },
      newAeCheck: {
        id: "new-ae-1",
        runType: "new_ae_backfill",
        status: "succeeded",
        createdAt: "2026-08-12T07:00:00.000Z",
        startedAt: "2026-08-12T07:00:03.000Z",
        finishedAt: "2026-08-12T07:00:18.000Z",
        cursorStart: null,
        cursorEnd: null,
        summary: {
          mode: "new_ae_daily_check",
          submissionsFound: 1,
          submissionsProcessed: 1,
        },
      },
      clickupWorker: {
        id: "worker-1",
        runType: "reconciliation",
        status: "succeeded",
        createdAt: "2026-08-12T09:40:00.000Z",
        startedAt: "2026-08-12T09:40:01.000Z",
        finishedAt: "2026-08-12T09:41:10.000Z",
        cursorStart: null,
        cursorEnd: null,
        summary: {
          mode: "clickup_worker",
          claimed: 5,
          sent: 5,
          retryScheduled: 0,
          terminal: 0,
        },
      },
    },
    cursors: {
      airtableDailyDeals: {
        key: "airtable_daily_deals",
        cursorTimestamp: "2026-08-11T13:30:00.000Z",
        metadata: {
          lastRunId: "daily-0",
        },
      },
      googleNewAeSubmission: {
        key: "google_new_ae_submission",
        cursorTimestamp: "2026-08-12T06:59:59.000Z",
        metadata: {
          lastRunId: "new-ae-0",
        },
      },
    },
    delivery: {
      pending: 5,
      processing: 0,
      retryScheduled: 0,
      sent: 0,
      failedTerminal: 0,
      cancelled: 0,
      total: 5,
    },
    staleDeals: {
      thresholdDays: 90,
      clickupCount: 1,
      airtableCount: 2,
      clickupSamples: [
        {
          label: "AE One | Deal One",
          detail: "Delivered to ClickUp and locally untouched for 90 days.",
          daysStale: 90,
          link: "https://app.clickup.com/t/abc",
          lastTouchedAt: "2026-05-14T12:00:00.000Z",
        },
      ],
      airtableSamples: [
        {
          label: "Deal Two | rec123",
          detail: "Airtable-side normalized deal has been locally untouched for 95 days.",
          daysStale: 95,
          link: "https://example.com/listing",
          lastTouchedAt: "2026-05-09T12:00:00.000Z",
        },
      ],
      basis: "mixed_live_clickup_and_local_airtable",
    },
    coverageReview: {
      windowDays: 7,
      lowMatchThreshold: 1,
      reviewThreshold30Days: 3,
      totalActiveAes: 34,
      underservedAeCount: 2,
      zeroMatchLast7DaysCount: 5,
      noCurrentThesisCount: 1,
      noClickupDestinationCount: 1,
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
          engagementStatus: "active_recently",
          recentlyUpdatedDeals14Days: 2,
          recentlyUpdatedDeals30Days: 4,
          lastClickupActivityAt: "2026-08-11T12:00:00.000Z",
          deliveredLast7Days: 0,
          deliveredLast30Days: 1,
          activeStrongCandidates: 0,
          activeModerateCandidates: 1,
          activeDeliverableCandidates: 1,
          thesisSummary: "Industries: HVAC | Geography: Texas",
          diagnosis: "Sourcing may be thin for this thesis",
          recommendation: "Check inventory before changing the thesis.",
        },
      ],
    },
  });

  assert.equal(packet.cursorState.cursorAdvanceAllowed, false);
  assert.equal(packet.cursorState.reason, "daily_run_not_succeeded");
  assert.equal(packet.emailState.status, "not_sent_yet");
  assert.equal(packet.emailState.expected, true);
  assert.equal(packet.deliveryState.pending, 5);
  assert.equal(packet.staleDealState.thresholdDays, 90);
  assert.equal(packet.staleDealState.clickupCount, 1);
  assert.equal(packet.coverageReview.underservedAeCount, 2);
  assert.equal(packet.coverageReview.flaggedAes[0]?.recentlyUpdatedDeals14Days, 2);
  assert.equal(packet.latestRuns.daily?.summary.fetchedDeals, 8);
  assert.equal(packet.referenceRules.deliveryPath, "daily_run_only");
});

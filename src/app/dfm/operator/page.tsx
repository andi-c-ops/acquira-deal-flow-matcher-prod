import { ArchiveCandidateReview } from "@/app/dfm/operator/archive-candidate-review";
import { ControlRoomPanel, ControlRoomTabs } from "@/app/dfm/operator/control-room-tabs";
import { ExpandableReviewCard } from "@/app/dfm/operator/expandable-review-card";
import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";
import { buildOperatorDashboardViewModel } from "@/lib/dfm/agents/operator-dashboard";
import { hasOperatorSession } from "@/lib/dfm/auth/operator-session";
import { probeAirtableCredential } from "@/lib/dfm/providers/airtable-client";

function toneClass(tone: "good" | "warning" | "danger") {
  if (tone === "good") {
    return {
      background: "var(--success-soft)",
      borderColor: "var(--success)",
      color: "var(--success)",
    };
  }

  if (tone === "danger") {
    return {
      background: "var(--danger-soft)",
      borderColor: "var(--danger)",
      color: "var(--danger)",
    };
  }

  return {
    background: "var(--warn-soft)",
    borderColor: "var(--warn)",
    color: "var(--warn)",
  };
}

function factPillStyle() {
  return {
    borderRadius: "18px",
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    padding: "14px 16px",
    backdropFilter: "blur(10px)",
  } as const;
}

function normalizeAeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function summaryCount(summary: Record<string, unknown>, key: string) {
  const value = Number(summary[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export default async function OperatorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dedupe?: string; probe?: string }>;
}) {
  const sessionOk = await hasOperatorSession();
  const params = await searchParams;

  if (!sessionOk) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "560px",
            background: "linear-gradient(160deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
            border: "1px solid var(--line)",
            borderRadius: "28px",
            padding: "32px",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Deal Flow Matcher
          </p>
          <h1 style={{ margin: "10px 0 12px", fontSize: "2.35rem", lineHeight: 1.02, color: "var(--heading)", fontWeight: 900 }}>
            Deal Flow Control Room
          </h1>
          <p style={{ margin: "0 0 18px", color: "var(--muted)", lineHeight: 1.7, fontWeight: 300 }}>
            Enter the internal DFM secret to open the live run-health view in your browser.
          </p>
          <div
            style={{
              marginBottom: "18px",
              borderRadius: "18px",
              background: "rgba(2, 6, 23, 0.94)",
              border: "1px solid rgba(37,99,235,0.18)",
              padding: "16px 16px 18px",
              color: "#CBD5E1",
              lineHeight: 1.65,
            }}
          >
            <p style={{ margin: 0, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.75rem", fontWeight: 700 }}>
              If you are in ChatGPT Work
            </p>
            <p style={{ margin: "10px 0 0" }}>
              This browser view does not bypass the protected operator secret. Open this page in an authorized browser, copy the live operator summary from the Control Room, then paste that summary into ChatGPT Work or Codex.
            </p>
          </div>
          <form action="/api/dfm/internal/operator-session" method="post">
            <input type="hidden" name="returnTo" value="/dfm/operator" />
            <label style={{ display: "grid", gap: "8px", marginBottom: "14px" }}>
              <span style={{ fontWeight: 700 }}>Internal secret</span>
              <input
                type="password"
                name="secret"
                required
                style={{
                  width: "100%",
                  borderRadius: "14px",
                  border: "1px solid var(--line)",
                  padding: "14px 16px",
                  fontSize: "1rem",
                  background: "#fff",
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                border: "none",
                borderRadius: "999px",
                background: "var(--accent)",
                color: "#fff",
                padding: "14px 20px",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open protected Control Room
            </button>
          </form>
          {params.error === "unauthorized" ? (
            <p style={{ margin: "14px 0 0", color: "var(--danger)" }}>
              That secret did not match the current internal DFM secret.
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (params.probe === "airtable") {
    let probeResult: Awaited<ReturnType<typeof probeAirtableCredential>> | null = null;
    let probeError = false;

    try {
      probeResult = await probeAirtableCredential();
    } catch {
      probeError = true;
    }

    const status = probeError ? "configuration_error" : probeResult?.status ?? "unreachable";
    const healthy = probeResult?.ok === true;

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "640px",
            background: "linear-gradient(160deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
            border: "1px solid var(--line)",
            borderRadius: "28px",
            padding: "32px",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Deal Flow Matcher
          </p>
          <h1 style={{ margin: "10px 0 12px", fontSize: "2.1rem", lineHeight: 1.05, color: "var(--heading)", fontWeight: 900 }}>
            Airtable credential probe
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.65 }}>
            One minimal, read-only request was executed from the Vercel Production runtime. No record data, cursor, run, delivery, or report state was returned or changed.
          </p>
          <div
            style={{
              ...toneClass(healthy ? "good" : "danger"),
              marginTop: "22px",
              border: "1px solid",
              borderRadius: "18px",
              padding: "18px",
            }}
          >
            <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.78rem", fontWeight: 700 }}>
              Result
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "1.35rem", fontWeight: 900 }}>{status}</p>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Checked: {probeResult?.checkedAt ?? new Date().toISOString()}
              {probeResult?.httpStatus ? ` | HTTP ${probeResult.httpStatus}` : ""}
            </p>
          </div>
          <p style={{ margin: "18px 0 0", color: "var(--muted)", lineHeight: 1.55, fontSize: "0.92rem" }}>
            The credential remained inside Vercel. This page exposes only the redacted outcome.
          </p>
          <p style={{ margin: "18px 0 0" }}>
            <a href="/dfm/operator" style={{ color: "var(--accent)", fontWeight: 700 }}>
              Return to Control Room
            </a>
          </p>
        </section>
      </main>
    );
  }

  let packet;
  try {
    packet = await loadOperatorAgentPacket();
  } finally {
    await closeOperatorAgentPacketRuntime();
  }
  const view = buildOperatorDashboardViewModel(packet);
  const duplicateCleanup = (() => {
    const flaggedAes = packet.coverageReview.flaggedAes;

    for (const archiveCandidate of flaggedAes) {
      if (
        archiveCandidate.deliveryMinMatchQuality !== "Moderate" ||
        archiveCandidate.diagnosis !== "Routing setup incomplete"
      ) {
        continue;
      }

      const retainedThesis = flaggedAes.find(
        (item) =>
          item.aeThesisId !== archiveCandidate.aeThesisId &&
          item.deliveryMinMatchQuality === "Strong" &&
          normalizeAeName(item.aeName) === normalizeAeName(archiveCandidate.aeName),
      );

      if (retainedThesis) {
        return { archiveCandidate, retainedThesis };
      }
    }

    return null;
  })();
  const latestDailySummary = packet.latestRuns.daily?.summary ?? {};
  const dailyReportMetrics = [
    { label: "New deals reviewed", value: summaryCount(latestDailySummary, "fetchedDeals") },
    { label: "High-confidence matches", value: summaryCount(latestDailySummary, "totalStrongMatches") },
    { label: "Possible matches", value: summaryCount(latestDailySummary, "totalModerateMatches") },
    { label: "Entrepreneurs matched", value: summaryCount(latestDailySummary, "aesWithMatches") },
    { label: "ClickUp tasks prepared", value: summaryCount(latestDailySummary, "deliveryJobsCreatedOrEligible") },
  ];

  return (
    <main className="control-room-shell" style={{ padding: "24px", maxWidth: "1180px", margin: "0 auto" }}>
      <ControlRoomTabs snapshot={view.hero.generatedAt}>
        <ControlRoomPanel id="today">
      <section
        className="control-room-hero"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(239,246,255,0.98) 100%)",
          border: "1px solid var(--line)",
          borderRadius: "32px",
          padding: "30px",
          boxShadow: "0 24px 72px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "520px",
            height: "520px",
            borderRadius: "999px",
            background: "rgba(225, 180, 107, 0.17)",
            filter: "blur(110px)",
            top: "-250px",
            left: "-160px",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "520px",
            height: "520px",
            borderRadius: "999px",
            background: "rgba(70, 149, 192, 0.11)",
            filter: "blur(110px)",
            top: "-250px",
            right: "-160px",
          }}
        />
        <div className="control-room-hero-top" style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Deal Flow Matcher
            </p>
            <h2 className="control-room-hero-title" style={{ margin: "10px 0 10px", fontSize: "clamp(2.6rem, 5vw, 4.2rem)", lineHeight: 0.95, color: "var(--heading)", fontWeight: 900 }}>
              Today at a glance
            </h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontWeight: 300, fontSize: "1.08rem" }}>{view.hero.summaryLine}</p>
            <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              One protected view for today’s run, task delivery, entrepreneur coverage, and items needing review.
            </p>
          </div>
          <div className="control-room-status" style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-block",
                borderRadius: "999px",
                padding: "10px 14px",
                background:
                  view.hero.statusLabel === "Healthy"
                    ? "var(--success-soft)"
                    : view.hero.statusLabel === "Delivery error"
                      ? "var(--danger-soft)"
                      : "var(--warn-soft)",
                color:
                  view.hero.statusLabel === "Healthy"
                    ? "var(--success)"
                    : view.hero.statusLabel === "Delivery error"
                      ? "var(--danger)"
                      : "var(--warn)",
                fontWeight: 700,
              }}
            >
              {view.hero.statusLabel}
            </div>
            <p style={{ margin: "12px 0 0", color: "var(--muted)" }}>Snapshot: {view.hero.generatedAt}</p>
          </div>
        </div>
        <div
          className="control-room-quick-facts"
          style={{
            position: "relative",
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginTop: "22px",
          }}
        >
          {view.hero.quickFacts.map((fact) => (
            <div key={fact.label} className="control-room-quick-fact" style={factPillStyle()}>
              <p
                style={{
                  margin: 0,
                  color: "var(--subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                }}
              >
                {fact.label}
              </p>
              <p style={{ margin: "8px 0 0", color: "var(--heading)", fontSize: "1rem", fontWeight: 700 }}>
                {fact.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="control-room-run-control"
        style={{
          ...toneClass(view.runControl.tone),
          marginTop: "20px",
          border: "1px solid",
          borderRadius: "24px",
          padding: "20px",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.78rem", fontWeight: 700 }}>
              Today’s outcome
            </p>
            <h2 style={{ margin: "8px 0 8px", fontSize: "1.5rem", lineHeight: 1.05 }}>{view.runControl.label}</h2>
            <p style={{ margin: 0, lineHeight: 1.55, maxWidth: "760px" }}>{view.runControl.detail}</p>
          </div>
          <span
            style={{
              border: "1px solid currentColor",
              borderRadius: "999px",
              padding: "9px 13px",
              fontWeight: 700,
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
            }}
          >
            Internal view
          </span>
        </div>
        <div
          className="control-room-checks"
          style={{
            display: "grid",
            gap: "10px",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            marginTop: "18px",
          }}
        >
          {view.runControl.checks.map((check) => (
            <article
              key={check.label}
              className="control-room-check"
              style={{
                background: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(148, 163, 184, 0.24)",
                borderRadius: "16px",
                padding: "14px",
                color: "var(--ink)",
              }}
            >
              <p style={{ margin: 0, color: "var(--subtle)", fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {check.label}
              </p>
              <p style={{ margin: "8px 0 5px", color: toneClass(check.tone).color, fontSize: "1.1rem", fontWeight: 900 }}>
                {check.value}
              </p>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.4 }}>{check.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="control-room-metrics" style={{ marginTop: "20px", display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {view.metrics.map((metric) => (
          <article
            key={metric.label}
            className="control-room-metric"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
              border: "1px solid var(--line)",
              borderRadius: "22px",
              padding: "18px",
              boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
            }}
          >
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>{metric.label}</p>
            <h2 style={{ margin: "10px 0 0", fontSize: "1.75rem", color: "var(--heading)" }}>{metric.value}</h2>
          </article>
        ))}
      </section>

      <section
        className="control-room-report"
        style={{
          marginTop: "20px",
          background: "linear-gradient(140deg, #1d2a35 0%, #2b6f91 100%)",
          border: "1px solid rgba(70,149,192,0.26)",
          borderRadius: "24px",
          padding: "22px",
          color: "#F8FAFC",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "var(--brand-blue-soft)", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.74rem", fontWeight: 800 }}>
              Latest report
            </p>
            <h2 style={{ margin: "8px 0 6px", fontSize: "1.45rem" }}>Daily Deal Report</h2>
            <p style={{ margin: 0, color: "#e5f1f6", lineHeight: 1.5 }}>
              {view.hero.statusLabel === "Healthy" ? "Report evidence is complete for the latest successful daily run." : "Review the evidence state before treating this report as complete."}
            </p>
          </div>
          <span
            style={{
              borderRadius: "999px",
              padding: "8px 12px",
              background: view.runControl.tone === "good" ? "rgba(52,211,153,0.16)" : "rgba(251,191,36,0.16)",
              color: view.runControl.tone === "good" ? "#6EE7B7" : "#FCD34D",
              fontWeight: 800,
              fontSize: "0.82rem",
            }}
          >
            {view.hero.quickFacts.find((fact) => fact.label === "Report")?.value ?? "Unknown"}
          </span>
        </div>
        <div className="control-room-report-metrics" style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: "20px" }}>
          {dailyReportMetrics.map((metric) => (
            <div key={metric.label} className="control-room-report-metric" style={{ borderTop: "1px solid rgba(148,163,184,0.22)", paddingTop: "12px" }}>
              <p style={{ margin: 0, color: "#d1e3eb", fontSize: "0.78rem" }}>{metric.label}</p>
              <p style={{ margin: "6px 0 0", fontSize: "1.5rem", fontWeight: 900 }}>{metric.value}</p>
            </div>
          ))}
        </div>
      </section>
        </ControlRoomPanel>

        <ControlRoomPanel id="evidence">

      <section className="control-room-secondary-grid" style={{ marginTop: "20px", display: "grid", gap: "16px", gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)" }}>
        <div style={{ display: "grid", gap: "16px" }}>
          {view.alerts.map((alert) => (
            <article
              key={alert.title}
              className={`control-room-alert tone-${alert.tone}`}
              style={{
                ...toneClass(alert.tone),
                border: "1px solid",
                borderRadius: "22px",
                padding: "18px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{alert.title}</h3>
              <p style={{ margin: "8px 0 0", lineHeight: 1.6 }}>{alert.detail}</p>
            </article>
          ))}
        </div>

        <aside
          className="control-room-secondary-card"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
            border: "1px solid var(--line)",
            borderRadius: "22px",
            padding: "20px",
            boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontSize: "0.8rem" }}>
            Run history
          </p>
          <h2 style={{ margin: "8px 0 16px" }}>Latest runs</h2>
          <div style={{ display: "grid", gap: "14px" }}>
            {view.latestRuns.map((run) => (
              <div key={run.label} style={{ paddingBottom: "14px", borderBottom: "1px solid var(--line)" }}>
                <p style={{ margin: 0, fontWeight: 700, color: "var(--heading)" }}>{run.label}</p>
                <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                  Outcome: {run.status}
                </p>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                  Reference: {run.runId ?? "Not available"}
                </p>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                  Started: {run.when}
                </p>
              </div>
            ))}
          </div>
          <form action="/api/dfm/internal/operator-session" method="post" style={{ marginTop: "16px" }}>
            <input type="hidden" name="action" value="logout" />
            <button
              type="submit"
              style={{
                border: "1px solid var(--line)",
                borderRadius: "999px",
                background: "#fff",
                color: "var(--ink)",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        </aside>
      </section>

        </ControlRoomPanel>

        <ControlRoomPanel id="coverage">

      <section
        className="control-room-coverage"
        style={{
          marginTop: "20px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
          border: "1px solid var(--line)",
          borderRadius: "22px",
          padding: "20px",
          display: "grid",
          gap: "18px",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Weekly entrepreneur coverage
            </p>
            <h2 style={{ margin: "8px 0 8px", fontSize: "1.38rem", lineHeight: 1.05 }}>{view.coverageReview.title}</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, fontSize: "0.94rem", maxWidth: "720px" }}>
              {view.coverageReview.ruleLabel}
            </p>
          </div>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {view.coverageReview.metrics.map((metric) => (
              <article
                key={metric.label}
                style={{
                  background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
                  border: "1px solid var(--line)",
                  borderRadius: "18px",
                  padding: "14px",
                  minWidth: "150px",
                }}
              >
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>{metric.label}</p>
                <h3 style={{ margin: "8px 0 0", fontSize: "1.35rem" }}>{metric.value}</h3>
              </article>
            ))}
          </div>
        </div>

        <ExpandableReviewCard
          className="coverage-review-card"
          title="Entrepreneurs needing coverage review"
          countLabel="Flagged for manual investigation"
          countValue={view.coverageReview.metrics[1]?.value ?? "0"}
          emptyMessage="No entrepreneurs are currently below the coverage thresholds."
          items={view.coverageReview.flaggedAes}
          openLabel="Flagged entrepreneurs"
          linkLabel="Open"
          accent="blue"
          disclosureMode="per-item"
        />
      </section>

        </ControlRoomPanel>

        <ControlRoomPanel id="exceptions">

      {params.dedupe === "success" ? (
        <section
          className="control-room-dedupe-notice"
          style={{
            ...toneClass("good"),
            marginTop: "20px",
            border: "1px solid",
            borderRadius: "22px",
            padding: "18px",
          }}
        >
          <strong>Duplicate record archived.</strong> The high-confidence routed investment focus remains active. No ClickUp tasks or new-deals checkpoint were changed.
        </section>
      ) : null}

      {duplicateCleanup ? (
        <section
          className="control-room-dedupe"
          style={{
            marginTop: "20px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
            border: "1px solid var(--line)",
            borderRadius: "22px",
            padding: "20px",
            boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Duplicate record cleanup
          </p>
          <h2 style={{ margin: "8px 0", fontSize: "1.38rem", lineHeight: 1.05 }}>
            Keep the high-confidence routing for {duplicateCleanup.retainedThesis.aeName}
          </h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, maxWidth: "760px" }}>
            This archives the duplicate possible-match record with no task destination. The active high-confidence record stays in place. Any unsent duplicate tasks are cancelled first. Existing ClickUp tasks and the new-deals checkpoint are not changed.
          </p>
          <form action="/api/dfm/internal/ae-theses/deactivate-duplicate" method="post" style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
            <input type="hidden" name="archiveAeThesisId" value={duplicateCleanup.archiveCandidate.aeThesisId} />
            <input type="hidden" name="retainAeThesisId" value={duplicateCleanup.retainedThesis.aeThesisId} />
            <label style={{ display: "flex", gap: "10px", alignItems: "start", color: "var(--ink)", lineHeight: 1.45 }}>
              <input type="checkbox" name="confirmation" value="ARCHIVE_DUPLICATE" required style={{ marginTop: "3px" }} />
              I confirm that the possible-match duplicate should be archived and the high-confidence routed record should remain active.
            </label>
            <div>
              <button
                type="submit"
                style={{
                  border: "none",
                  borderRadius: "999px",
                  background: "var(--danger)",
                  color: "#fff",
                  padding: "11px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
              Archive possible-match duplicate
              </button>
            </div>
          </form>
          {params.dedupe && params.dedupe !== "success" ? (
            <p style={{ margin: "14px 0 0", color: "var(--danger)", lineHeight: 1.5 }}>
              The cleanup was not applied. The records no longer matched the required safe pattern, or the request was not authorized.
            </p>
          ) : null}
        </section>
      ) : null}

      <section
        className="control-room-stale-review"
        style={{
          marginTop: "20px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
          border: "1px solid var(--line)",
          borderRadius: "22px",
          padding: "20px",
          display: "grid",
          gap: "18px",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Deals needing review
            </p>
            <h2 style={{ margin: "8px 0 8px", fontSize: "1.38rem", lineHeight: 1.05 }}>{view.staleDeals.thresholdLabel}</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, fontSize: "0.94rem", maxWidth: "720px" }}>{view.staleDeals.basisLabel}</p>
          </div>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))" }}>
            {view.staleDeals.metrics.map((metric) => (
              <article
                key={metric.label}
                style={{
                  background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
                  border: "1px solid var(--line)",
                  borderRadius: "18px",
                  padding: "14px",
                  minWidth: "160px",
                }}
              >
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>{metric.label}</p>
                <h3 style={{ margin: "8px 0 0", fontSize: "1.35rem" }}>{metric.value}</h3>
              </article>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <ExpandableReviewCard
            title="Deals with no recent task update"
            countLabel="Task review queue"
            countValue={view.staleDeals.metrics[0]?.value ?? "0"}
            emptyMessage="No deals without a recent task update were found in the current review window."
            items={view.staleDeals.clickupSamples}
            openLabel="Task examples"
            linkLabel="Open task"
            accent="teal"
          />

          <ExpandableReviewCard
            title="Deals with no recent source update"
            countLabel="Source review queue"
            countValue={view.staleDeals.metrics[1]?.value ?? "0"}
            emptyMessage="No deals without a recent source update were found in the current review window."
            items={view.staleDeals.airtableSamples}
            openLabel="Source examples"
            linkLabel="Open source record"
            accent="blue"
          />
        </div>
      </section>

      <ArchiveCandidateReview view={view.archiveCandidates} />
        </ControlRoomPanel>
      </ControlRoomTabs>
    </main>
  );
}

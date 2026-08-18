import { ArchiveCandidateReview } from "@/app/dfm/operator/archive-candidate-review";
import { ExpandableReviewCard } from "@/app/dfm/operator/expandable-review-card";
import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";
import { buildOperatorDashboardViewModel } from "@/lib/dfm/agents/operator-dashboard";
import { hasOperatorSession } from "@/lib/dfm/auth/operator-session";

function toneClass(tone: "good" | "warning" | "danger") {
  if (tone === "good") {
    return {
      background: "var(--accent-soft)",
      borderColor: "var(--accent)",
      color: "var(--accent)",
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

export default async function OperatorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dedupe?: string }>;
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
            Operator dashboard
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
              This browser view does not bypass the protected operator secret. Open this page in an authorized browser, copy the live operator summary from the dashboard, then paste that summary into ChatGPT Work or Codex.
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
              Open dashboard
            </button>
          </form>
          <p style={{ margin: "14px 0 0" }}>
            <a href="https://acquira-deal-flow-control-room.andicunanan2024.chatgpt.site" style={{ color: "var(--accent)", fontWeight: 700 }}>
              Open Deal Flow Control Room
            </a>
          </p>
          {params.error === "unauthorized" ? (
            <p style={{ margin: "14px 0 0", color: "var(--danger)" }}>
              That secret did not match the current internal DFM secret.
            </p>
          ) : null}
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

  return (
    <main style={{ padding: "24px", maxWidth: "1180px", margin: "0 auto" }}>
      <section
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
            background: "rgba(78, 164, 211, 0.16)",
            filter: "blur(120px)",
            top: "-240px",
            left: "-140px",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "520px",
            height: "520px",
            borderRadius: "999px",
            background: "rgba(79, 70, 229, 0.12)",
            filter: "blur(120px)",
            top: "-240px",
            right: "-140px",
          }}
        />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Deal Flow Matcher
            </p>
            <h1 style={{ margin: "10px 0 10px", fontSize: "clamp(2.6rem, 5vw, 4.2rem)", lineHeight: 0.95, color: "var(--heading)", fontWeight: 900 }}>
              Operator dashboard
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontWeight: 300, fontSize: "1.08rem" }}>{view.hero.summaryLine}</p>
            <p style={{ margin: "12px 0 0" }}>
              <a href="https://acquira-deal-flow-control-room.andicunanan2024.chatgpt.site" style={{ color: "var(--accent)", fontWeight: 700 }}>
                Open Deal Flow Control Room
              </a>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-block",
                borderRadius: "999px",
                padding: "10px 14px",
                background:
                  view.hero.statusLabel === "Healthy"
                    ? "var(--accent-soft)"
                    : view.hero.statusLabel === "Delivery error"
                      ? "var(--danger-soft)"
                      : "var(--warn-soft)",
                color:
                  view.hero.statusLabel === "Healthy"
                    ? "var(--accent)"
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
          style={{
            position: "relative",
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginTop: "22px",
          }}
        >
          {view.hero.quickFacts.map((fact) => (
            <div key={fact.label} style={factPillStyle()}>
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
              Run Control
            </p>
            <h2 style={{ margin: "8px 0 8px", fontSize: "1.5rem", lineHeight: 1.05 }}>{view.runControl.label}</h2>
            <p style={{ margin: 0, lineHeight: 1.55, maxWidth: "760px" }}>{view.runControl.detail}</p>
          </div>
          <a
            href="https://acquira-deal-flow-control-room.andicunanan2024.chatgpt.site"
            style={{
              border: "1px solid currentColor",
              borderRadius: "999px",
              padding: "9px 13px",
              fontWeight: 700,
              fontSize: "0.9rem",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open Control Room
          </a>
        </div>
        <div
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

      <section style={{ marginTop: "20px", display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {view.metrics.map((metric) => (
          <article
            key={metric.label}
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

      <section style={{ marginTop: "20px", display: "grid", gap: "16px", gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)" }}>
        <div style={{ display: "grid", gap: "16px" }}>
          {view.alerts.map((alert) => (
            <article
              key={alert.title}
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
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
            border: "1px solid var(--line)",
            borderRadius: "22px",
            padding: "20px",
            boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontSize: "0.8rem" }}>
            Timeline
          </p>
          <h2 style={{ margin: "8px 0 16px" }}>Latest runs</h2>
          <div style={{ display: "grid", gap: "14px" }}>
            {view.latestRuns.map((run) => (
              <div key={run.label} style={{ paddingBottom: "14px", borderBottom: "1px solid var(--line)" }}>
                <p style={{ margin: 0, fontWeight: 700, color: "var(--heading)" }}>{run.label}</p>
                <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                  Status: {run.status}
                </p>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                  Run ID: {run.runId ?? "Not available"}
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

      <section
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
              Weekly AE Coverage Review
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
          title="AEs that need coverage review"
          countLabel="Flagged for manual investigation"
          countValue={view.coverageReview.metrics[1]?.value ?? "0"}
          emptyMessage="No AEs are currently below the weekly coverage review thresholds."
          items={view.coverageReview.flaggedAes}
          openLabel="Flagged AEs"
          linkLabel="Open"
          accent="blue"
        />
      </section>

      {params.dedupe === "success" ? (
        <section
          style={{
            ...toneClass("good"),
            marginTop: "20px",
            border: "1px solid",
            borderRadius: "22px",
            padding: "18px",
          }}
        >
          <strong>Duplicate record archived.</strong> The Strong-only routed thesis remains active. No ClickUp tasks or Airtable cursor were changed.
        </section>
      ) : null}

      {duplicateCleanup ? (
        <section
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
            Duplicate AE Record Cleanup
          </p>
          <h2 style={{ margin: "8px 0", fontSize: "1.38rem", lineHeight: 1.05 }}>
            Keep the Strong-only routing for {duplicateCleanup.retainedThesis.aeName}
          </h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, maxWidth: "760px" }}>
            This archives the duplicate Moderate record with no ClickUp destination. The active Strong-only routed record stays in place. Any unsent duplicate jobs are cancelled first. Existing ClickUp tasks and the Airtable cursor are not changed.
          </p>
          <form action="/api/dfm/internal/ae-theses/deactivate-duplicate" method="post" style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
            <input type="hidden" name="archiveAeThesisId" value={duplicateCleanup.archiveCandidate.aeThesisId} />
            <input type="hidden" name="retainAeThesisId" value={duplicateCleanup.retainedThesis.aeThesisId} />
            <label style={{ display: "flex", gap: "10px", alignItems: "start", color: "var(--ink)", lineHeight: 1.45 }}>
              <input type="checkbox" name="confirmation" value="ARCHIVE_DUPLICATE" required style={{ marginTop: "3px" }} />
              I confirm that the Moderate, unrouted duplicate should be archived and the Strong-only routed record should remain active.
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
                Archive Moderate duplicate
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
              Stale Deal Review
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
            title="Stale ClickUp-delivered deals"
            countLabel="Live stale-task review"
            countValue={view.staleDeals.metrics[0]?.value ?? "0"}
            emptyMessage="No stale ClickUp-delivered deals found in the current sample window."
            items={view.staleDeals.clickupSamples}
            openLabel="ClickUp samples"
            linkLabel="Open task"
            accent="teal"
          />

          <ExpandableReviewCard
            title="Stale Airtable deals"
            countLabel="Airtable stale record review"
            countValue={view.staleDeals.metrics[1]?.value ?? "0"}
            emptyMessage="No stale Airtable deals found in the current sample window."
            items={view.staleDeals.airtableSamples}
            openLabel="Airtable samples"
            linkLabel="Open listing"
            accent="blue"
          />
        </div>
      </section>

      <ArchiveCandidateReview view={view.archiveCandidates} />
    </main>
  );
}

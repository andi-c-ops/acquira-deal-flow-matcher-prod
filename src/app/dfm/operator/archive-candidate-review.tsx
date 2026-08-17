"use client";

import { useState } from "react";
import { ExpandableReviewCard } from "@/app/dfm/operator/expandable-review-card";

type ArchiveCandidateItem = {
  label: string;
  detail: string;
  lastTouched: string;
  link: string | null;
};

type ArchiveCandidateMetric = {
  label: string;
  value: string;
};

type ArchiveCandidateView = {
  title: string;
  ruleLabel: string;
  metrics: ArchiveCandidateMetric[];
  clickupCandidates: ArchiveCandidateItem[];
  airtableCandidates: ArchiveCandidateItem[];
};

type FilterKey = "both" | "clickup" | "airtable";

export function ArchiveCandidateReview({ view }: { view: ArchiveCandidateView }) {
  const [filter, setFilter] = useState<FilterKey>("both");
  const [copied, setCopied] = useState(false);

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: "both", label: "Both" },
    { key: "clickup", label: "ClickUp only" },
    { key: "airtable", label: "Airtable only" },
  ];

  const showClickup = filter === "both" || filter === "clickup";
  const showAirtable = filter === "both" || filter === "airtable";

  function escapeCsv(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  function handleExport() {
    const rows: string[] = [
      [
        "source",
        "label",
        "detail",
        "last_touched",
        "link",
      ].join(","),
    ];

    if (showClickup) {
      for (const item of view.clickupCandidates) {
        rows.push(
          [
            escapeCsv("clickup"),
            escapeCsv(item.label),
            escapeCsv(item.detail),
            escapeCsv(item.lastTouched),
            escapeCsv(item.link ?? ""),
          ].join(","),
        );
      }
    }

    if (showAirtable) {
      for (const item of view.airtableCandidates) {
        rows.push(
          [
            escapeCsv("airtable"),
            escapeCsv(item.label),
            escapeCsv(item.detail),
            escapeCsv(item.lastTouched),
            escapeCsv(item.link ?? ""),
          ].join(","),
        );
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix =
      filter === "both" ? "both" : filter === "clickup" ? "clickup-only" : "airtable-only";

    anchor.href = url;
    anchor.download = `dfm-archive-candidates-${suffix}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function handleCopySummary() {
    const lines: string[] = [];

    lines.push(`Archive candidate review`);
    lines.push(`Filter: ${filter === "both" ? "Both" : filter === "clickup" ? "ClickUp only" : "Airtable only"}`);
    lines.push(view.ruleLabel);
    lines.push("");

    if (showClickup) {
      lines.push(`ClickUp archive candidates: ${view.metrics[0]?.value ?? "0"}`);
      if (view.clickupCandidates.length === 0) {
        lines.push(`- None in current review window`);
      } else {
        for (const item of view.clickupCandidates) {
          lines.push(`- ${item.label}`);
          lines.push(`  ${item.detail}`);
          lines.push(`  Last touched: ${item.lastTouched}`);
          if (item.link) {
            lines.push(`  Link: ${item.link}`);
          }
        }
      }
      lines.push("");
    }

    if (showAirtable) {
      lines.push(`Airtable archive candidates: ${view.metrics[1]?.value ?? "0"}`);
      if (view.airtableCandidates.length === 0) {
        lines.push(`- None in current review window`);
      } else {
        for (const item of view.airtableCandidates) {
          lines.push(`- ${item.label}`);
          lines.push(`  ${item.detail}`);
          lines.push(`  Last touched: ${item.lastTouched}`);
          if (item.link) {
            lines.push(`  Link: ${item.link}`);
          }
        }
      }
    }

    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section
      style={{
        marginTop: "20px",
        background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
        border: "1px solid rgba(78,164,211,0.18)",
        borderRadius: "24px",
        padding: "22px",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
        display: "grid",
        gap: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          alignItems: "start",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--teal)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Archive Candidates
          </p>
          <h2 style={{ margin: "8px 0 8px", fontSize: "1.42rem", lineHeight: 1.02 }}>
            {view.title}
          </h2>
          <p
            style={{
              margin: 0,
              color: "var(--muted)",
              lineHeight: 1.55,
              fontSize: "0.94rem",
              maxWidth: "860px",
            }}
          >
            {view.ruleLabel}
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gap: "10px",
            gridTemplateColumns: "repeat(2, minmax(160px, 1fr))",
          }}
        >
          {view.metrics.map((metric) => (
            <article
              key={metric.label}
              style={{
                background: "rgba(2, 6, 23, 0.94)",
                border: "1px solid rgba(78,164,211,0.18)",
                borderRadius: "18px",
                padding: "14px",
                minWidth: "160px",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
              }}
            >
              <p style={{ margin: 0, color: "#93C5FD", fontSize: "0.82rem" }}>{metric.label}</p>
              <h3 style={{ margin: "8px 0 0", fontSize: "1.4rem", color: "#F8FAFC" }}>
                {metric.value}
              </h3>
            </article>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            width: "fit-content",
            padding: "4px",
            borderRadius: "999px",
            background: "rgba(15,23,42,0.08)",
            border: "1px solid rgba(37,99,235,0.12)",
            gap: "4px",
          }}
        >
          {filters.map((item) => {
            const active = item.key === filter;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                style={{
                  border: "none",
                  borderRadius: "999px",
                  padding: "10px 14px",
                  background: active ? "#ffffff" : "transparent",
                  color: active ? "#1D4ED8" : "rgba(31,41,51,0.78)",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: active ? "0 8px 22px rgba(15, 23, 42, 0.08)" : "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleExport}
          style={{
            border: "1px solid rgba(37,99,235,0.18)",
            borderRadius: "999px",
            background: "#FFFFFF",
            color: "#1D4ED8",
            padding: "12px 16px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
          }}
        >
          Export review list
        </button>

        <button
          type="button"
          onClick={handleCopySummary}
          style={{
            border: "1px solid rgba(78,164,211,0.22)",
            borderRadius: "999px",
            background: copied ? "rgba(78,164,211,0.14)" : "#FFFFFF",
            color: copied ? "#0F766E" : "#1D4ED8",
            padding: "12px 16px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
          }}
        >
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: filter === "both" ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
        }}
      >
        {showClickup ? (
          <ExpandableReviewCard
            title="ClickUp archive candidates"
            countLabel="Manual review queue"
            countValue={view.metrics[0]?.value ?? "0"}
            emptyMessage="No current ClickUp archive candidates in the report window."
            items={view.clickupCandidates}
            openLabel="ClickUp candidate samples"
            linkLabel="Open task"
            accent="teal"
          />
        ) : null}

        {showAirtable ? (
          <ExpandableReviewCard
            title="Airtable archive candidates"
            countLabel="Manual review queue"
            countValue={view.metrics[1]?.value ?? "0"}
            emptyMessage="No current Airtable archive candidates in the report window."
            items={view.airtableCandidates}
            openLabel="Airtable candidate samples"
            linkLabel="Open listing"
            accent="blue"
          />
        ) : null}
      </div>
    </section>
  );
}

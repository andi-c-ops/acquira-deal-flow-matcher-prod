"use client";

import { useState } from "react";

type ExpandableReviewItem = {
  label: string;
  detail: string;
  lastTouched: string;
  link: string | null;
};

type ExpandableReviewCardProps = {
  title: string;
  countLabel: string;
  countValue: string;
  emptyMessage: string;
  items: ExpandableReviewItem[];
  openLabel: string;
  linkLabel: string;
  accent: "teal" | "blue";
};

function accentTokens(accent: "teal" | "blue") {
  if (accent === "teal") {
    return {
      border: "rgba(78,164,211,0.18)",
      soft: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.98) 100%)",
      pill: "#0F766E",
      link: "#67E8F9",
    };
  }

  return {
    border: "rgba(37,99,235,0.18)",
    soft: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(238,242,255,0.98) 100%)",
    pill: "#1D4ED8",
    link: "#93C5FD",
  };
}

export function ExpandableReviewCard({
  title,
  countLabel,
  countValue,
  emptyMessage,
  items,
  openLabel,
  linkLabel,
  accent,
}: ExpandableReviewCardProps) {
  const [open, setOpen] = useState(false);
  const tokens = accentTokens(accent);

  return (
    <article
      style={{
        borderRadius: "20px",
        border: `1px solid ${tokens.border}`,
        background: tokens.soft,
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "start",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1.06rem", lineHeight: 1.2 }}>{title}</h3>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "0.92rem" }}>
            {countLabel}
          </p>
        </div>
        <div
          style={{
            minWidth: "72px",
            textAlign: "right",
          }}
        >
          <p style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "var(--heading)" }}>
            {countValue}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          marginTop: "14px",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: "16px",
          background: "rgba(255,255,255,0.84)",
          padding: "12px 14px",
          cursor: "pointer",
        }}
      >
        <span style={{ color: "var(--heading)", fontWeight: 700, fontSize: "0.95rem" }}>
          {open ? `Hide ${openLabel}` : `Show ${openLabel}`}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: "28px",
            height: "28px",
            display: "grid",
            placeItems: "center",
            borderRadius: "999px",
            background: "rgba(2, 6, 23, 0.94)",
            color: "#F8FAFC",
            fontSize: "1rem",
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
          {items.length > 0 ? (
            items.map((item) => (
              <div
                key={`${item.label}-${item.lastTouched}`}
                style={{
                  borderRadius: "15px",
                  background: "rgba(2, 6, 23, 0.94)",
                  border: "1px solid rgba(78,164,211,0.18)",
                  padding: "12px 14px",
                }}
              >
                <p style={{ margin: 0, color: "#F8FAFC", fontWeight: 700, fontSize: "0.94rem" }}>
                  {item.label}
                </p>
                <p style={{ margin: "6px 0 0", color: "#CBD5E1", lineHeight: 1.55, fontSize: "0.9rem" }}>
                  {item.detail}
                </p>
                <p style={{ margin: "6px 0 0", color: tokens.link, fontSize: "0.86rem" }}>
                  Last touched: {item.lastTouched}
                </p>
                {item.link ? (
                  <p style={{ margin: "6px 0 0" }}>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#67E8F9", fontWeight: 700, fontSize: "0.9rem" }}
                    >
                      {linkLabel}
                    </a>
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.92rem" }}>{emptyMessage}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

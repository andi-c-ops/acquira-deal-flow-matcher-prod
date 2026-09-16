"use client";

import { useState } from "react";

type ExpandableReviewItem = {
  label: string;
  detail: string;
  lastTouched: string;
  link: string | null;
};

type ExpandableReviewCardProps = {
  className?: string;
  title: string;
  countLabel: string;
  countValue: string;
  emptyMessage: string;
  items: ExpandableReviewItem[];
  openLabel: string;
  linkLabel: string;
  accent: "teal" | "blue";
  disclosureMode?: "grouped" | "per-item";
};

function accentTokens(accent: "teal" | "blue") {
  if (accent === "teal") {
    return {
      border: "rgba(70,149,192,0.24)",
      soft: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(238,248,252,0.98) 100%)",
      pill: "#2b6f91",
      link: "#b9e4f6",
    };
  }

  return {
    border: "rgba(70,149,192,0.24)",
    soft: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(238,248,252,0.98) 100%)",
    pill: "#2b6f91",
    link: "#b9e4f6",
  };
}

export function ExpandableReviewCard({
  className,
  title,
  countLabel,
  countValue,
  emptyMessage,
  items,
  openLabel,
  linkLabel,
  accent,
  disclosureMode = "grouped",
}: ExpandableReviewCardProps) {
  const [open, setOpen] = useState(false);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const tokens = accentTokens(accent);

  function itemKey(item: ExpandableReviewItem) {
    return `${item.label}-${item.lastTouched}`;
  }

  function renderItemDetails(item: ExpandableReviewItem) {
    return (
      <div className="review-item-details" style={{ marginTop: "10px" }}>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, fontSize: "0.9rem" }}>
          {item.detail}
        </p>
        <p style={{ margin: "7px 0 0", color: tokens.pill, fontSize: "0.84rem" }}>
          {item.lastTouched}
        </p>
        {item.link ? (
          <p style={{ margin: "7px 0 0" }}>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: tokens.pill, fontWeight: 800, fontSize: "0.88rem" }}
            >
              {linkLabel}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <article
      className={className}
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

      {disclosureMode === "per-item" ? (
        <div className="review-item-list" style={{ display: "grid", gap: "8px", marginTop: "16px" }}>
          {items.length > 0 ? (
            items.map((item) => {
              const key = itemKey(item);
              const itemOpen = openItems[key] === true;
              return (
                <article key={key} className="review-item-row">
                  <button
                    type="button"
                    className="review-item-toggle"
                    aria-expanded={itemOpen}
                    onClick={() => setOpenItems((current) => ({ ...current, [key]: !itemOpen }))}
                  >
                    <span className="review-item-label">{item.label}</span>
                    <span className="review-item-icon" aria-hidden="true">{itemOpen ? "−" : "+"}</span>
                  </button>
                  {itemOpen ? renderItemDetails(item) : null}
                </article>
              );
            })
          ) : (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.92rem" }}>{emptyMessage}</p>
          )}
        </div>
      ) : (
        <>
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
                    key={itemKey(item)}
                    style={{
                      borderRadius: "15px",
                      background: "#1d2a35",
                      border: "1px solid rgba(70,149,192,0.28)",
                      padding: "12px 14px",
                    }}
                  >
                    <p style={{ margin: 0, color: "#F8FAFC", fontWeight: 700, fontSize: "0.94rem" }}>
                      {item.label}
                    </p>
                    <p style={{ margin: "6px 0 0", color: "#e5f1f6", lineHeight: 1.55, fontSize: "0.9rem" }}>
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
                          style={{ color: "var(--brand-blue-soft)", fontWeight: 700, fontSize: "0.9rem" }}
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
        </>
      )}
    </article>
  );
}

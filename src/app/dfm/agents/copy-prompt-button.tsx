"use client";

import { useState } from "react";

export function CopyPromptButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      style={{
        border: "1px solid rgba(37,99,235,0.16)",
        borderRadius: "999px",
        background: copied ? "#2563EB" : "#FFFFFF",
        color: copied ? "#FFFFFF" : "#2563EB",
        width: "42px",
        height: "42px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 160ms ease",
      }}
    >
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5L9 16.5L19 6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </button>
  );
}

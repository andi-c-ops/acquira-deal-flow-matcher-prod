"use client";

import { useState } from "react";

import { CopyPromptButton } from "@/app/dfm/agents/copy-prompt-button";
import type { AgentLaunchCard } from "@/lib/dfm/agents/agent-launch";
import { getPromptTabsForCard } from "@/lib/dfm/agents/agent-launch";

export function PromptTabsCard({
  card,
  accent,
  textColor,
}: {
  card: AgentLaunchCard;
  accent: string;
  textColor: string;
}) {
  const tabs = getPromptTabsForCard(card);
  const [activeTab, setActiveTab] = useState(0);
  const selected = tabs[activeTab];

  return (
    <>
      <div
        style={{
          display: "inline-flex",
          padding: "4px",
          borderRadius: "999px",
          background: "rgba(15,23,42,0.08)",
          border: "1px solid rgba(37,99,235,0.12)",
          gap: "4px",
          marginBottom: "14px",
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = index === activeTab;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setActiveTab(index)}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "10px 14px",
                background: isActive ? "#ffffff" : "transparent",
                color: isActive ? accent : textColor,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: isActive ? "0 8px 22px rgba(15, 23, 42, 0.08)" : "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          borderRadius: "18px",
          background: "rgba(2, 6, 23, 0.94)",
          border: "1px solid rgba(78,164,211,0.18)",
          padding: "18px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: "#F8FAFC" }}>{selected.label}</p>
          <CopyPromptButton text={selected.content} label={selected.copyLabel} />
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: "12px 0 0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.92rem",
            lineHeight: 1.6,
            color: "#CBD5E1",
          }}
        >
          {selected.content}
        </pre>
      </div>
    </>
  );
}

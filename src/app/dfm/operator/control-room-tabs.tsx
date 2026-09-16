"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ControlRoomTabId = "today" | "evidence" | "coverage" | "exceptions";

type ControlRoomTab = {
  id: ControlRoomTabId;
  label: string;
  description: string;
};

const tabs: ControlRoomTab[] = [
  {
    id: "today",
    label: "Today",
    description: "Did today finish?",
  },
  {
    id: "coverage",
    label: "Entrepreneur coverage",
    description: "Which entrepreneurs need attention?",
  },
  {
    id: "exceptions",
    label: "Reviews and cleanup",
    description: "What needs a decision?",
  },
  {
    id: "evidence",
    label: "Runs and evidence",
    description: "Show the supporting proof",
  },
];

type ControlRoomTabsContextValue = {
  activeTab: ControlRoomTabId;
};

const ControlRoomTabsContext = createContext<ControlRoomTabsContextValue | null>(null);

function isTabId(value: string): value is ControlRoomTabId {
  return tabs.some((tab) => tab.id === value);
}

export function ControlRoomTabs({
  children,
  snapshot,
}: {
  children: ReactNode;
  snapshot: string;
}) {
  const [activeTab, setActiveTab] = useState<ControlRoomTabId>("today");

  useEffect(() => {
    const readHash = () => {
      const candidate = window.location.hash.replace(/^#/, "");
      if (isTabId(candidate)) {
        setActiveTab(candidate);
      }
    };

    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const contextValue = useMemo(() => ({ activeTab }), [activeTab]);

  function selectTab(id: ControlRoomTabId) {
    setActiveTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <ControlRoomTabsContext.Provider value={contextValue}>
      <section className="control-room-tabs-shell" style={{ marginTop: "22px" }}>
        <div
          className="control-room-tabs-header"
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: "18px",
            flexWrap: "wrap",
            padding: "18px 20px 0",
            borderRadius: "24px 24px 0 0",
            background: "rgba(255, 255, 255, 0.96)",
            border: "1px solid rgba(70,149,192,0.2)",
            borderBottom: "none",
            boxShadow: "0 18px 42px rgba(15, 23, 42, 0.12)",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: "var(--brand-blue)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.72rem",
                fontWeight: 800,
              }}
            >
              Acquira Deal Flow Matcher
            </p>
            <h1 className="control-room-global-heading" style={{ margin: "6px 0 0", color: "var(--heading)", fontSize: "1.35rem", lineHeight: 1.1 }}>
              Deal Flow Control Room
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              One protected snapshot, refreshed {snapshot}. Every tab below reads the same packet.
            </p>
          </div>
          <div
            className="control-room-tablist"
            role="tablist"
            aria-label="Deal Flow Control Room sections"
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              width: "100%",
              paddingTop: "14px",
            }}
          >
            {tabs.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className="control-room-tab"
                  role="tab"
                  id={`control-room-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`control-room-panel-${tab.id}`}
                  onClick={() => selectTab(tab.id)}
                  style={{
                    flex: "0 0 auto",
                    minWidth: "132px",
                    border: selected ? "1px solid var(--brand-blue)" : "1px solid rgba(29,42,53,0.14)",
                    borderBottom: selected ? "3px solid var(--brand-orange)" : "3px solid transparent",
                    borderRadius: "14px 14px 0 0",
                    background: selected ? "var(--brand-blue)" : "rgba(255,255,255,0.84)",
                    color: selected ? "#FFFFFF" : "var(--heading)",
                    padding: "11px 14px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "block", fontWeight: 800, fontSize: "0.9rem" }}>{tab.label}</span>
                  <span style={{ display: "block", marginTop: "4px", fontSize: "0.72rem", lineHeight: 1.35 }}>
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {children}
      </section>
    </ControlRoomTabsContext.Provider>
  );
}

export function ControlRoomPanel({
  id,
  children,
}: {
  id: ControlRoomTabId;
  children: ReactNode;
}) {
  const context = useContext(ControlRoomTabsContext);

  if (!context) {
    throw new Error("ControlRoomPanel must be rendered inside ControlRoomTabs");
  }

  const visible = context.activeTab === id;

  return (
    <section
      className="control-room-tab-panel"
      id={`control-room-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`control-room-tab-${id}`}
      hidden={!visible}
      style={{ display: visible ? "block" : "none" }}
    >
      {children}
    </section>
  );
}

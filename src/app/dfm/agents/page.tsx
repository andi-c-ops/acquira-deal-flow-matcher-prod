import { CopyPromptButton } from "@/app/dfm/agents/copy-prompt-button";
import { PromptTabsCard } from "@/app/dfm/agents/prompt-tabs-card";
import { buildAgentLaunchModel } from "@/lib/dfm/agents/agent-launch";

function cardStyle(index: number) {
  const palettes = [
    {
      background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
      border: "rgba(37,99,235,0.18)",
      accent: "#2563EB",
    },
    {
      background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.98) 100%)",
      border: "rgba(78,164,211,0.28)",
      accent: "#0F766E",
    },
    {
      background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(238,242,255,0.98) 100%)",
      border: "rgba(37,99,235,0.24)",
      accent: "#1D4ED8",
    },
  ];

  return palettes[index % palettes.length];
}

export default function AgentLaunchPage() {
  const model = buildAgentLaunchModel();

  return (
    <main style={{ maxWidth: "1240px", margin: "0 auto", padding: "28px 24px 80px" }}>
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "34px",
          border: "1px solid var(--line)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(248,250,252,0.94) 42%, rgba(239,246,255,0.98) 100%)",
          padding: "34px",
          boxShadow: "0 28px 80px rgba(15, 23, 42, 0.09)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "520px",
            height: "520px",
            borderRadius: "999px",
            background: "rgba(78, 164, 211, 0.18)",
            filter: "blur(120px)",
            top: "-220px",
            left: "-120px",
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
            right: "-110px",
          }}
        />
        <div style={{ position: "relative" }}>
        <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(2.8rem, 6vw, 4.5rem)", lineHeight: 0.95, fontWeight: 900, color: "var(--heading)" }}>
          {model.title}
        </h1>
        <p style={{ margin: 0, maxWidth: "860px", color: "var(--muted)", lineHeight: 1.7, fontSize: "1.1rem", fontWeight: 300 }}>
          {model.intro}
        </p>
        <section
          style={{
            marginTop: "20px",
            borderRadius: "24px",
            background: "rgba(2, 6, 23, 0.94)",
            color: "#fff",
            padding: "20px 22px",
            maxWidth: "920px",
          }}
        >
          <p style={{ margin: 0, color: "var(--teal)", fontSize: "0.86rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
            Recommended setup
          </p>
          <h2 style={{ margin: "8px 0 10px", fontSize: "1.35rem" }}>
            ChatGPT Work for Operator and QA. Codex for Engineering.
          </h2>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.7 }}>
            {model.platformRecommendation.summary}
          </p>
        </section>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "18px" }}>
          <a
            href="/dfm/operator"
            style={{
              textDecoration: "none",
              borderRadius: "999px",
              background: "var(--accent)",
              color: "#fff",
              padding: "14px 18px",
              fontWeight: 700,
            }}
          >
            Open Operator Dashboard
          </a>
        </div>
        </div>
      </section>

      <section
        style={{
          marginTop: "22px",
          borderRadius: "26px",
          border: "1px solid rgba(37,99,235,0.18)",
          background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
          padding: "24px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#1D4ED8",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          Access
        </p>
        <h2 style={{ margin: "8px 0 10px", fontSize: "1.7rem", lineHeight: 1.05 }}>
          {model.accessHelp.title}
        </h2>
        <p style={{ margin: "0 0 18px", color: "rgba(31,41,51,0.78)", lineHeight: 1.65 }}>
          {model.accessHelp.summary}
        </p>
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {model.accessHelp.steps.map((step, index) => (
            <div
              key={step}
              style={{
                borderRadius: "18px",
                background: "rgba(2, 6, 23, 0.94)",
                border: "1px solid rgba(37,99,235,0.18)",
                padding: "16px 16px 18px",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#93C5FD",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                Step {index + 1}
              </p>
              <p style={{ margin: "10px 0 0", color: "#CBD5E1", lineHeight: 1.65 }}>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "22px", display: "grid", gap: "18px", gridTemplateColumns: "1fr", maxWidth: "920px" }}>
        {model.cards.map((card, index) => {
          const palette = cardStyle(index);
          return (
            <article
              key={card.name}
              style={{
                borderRadius: "28px",
                border: `1px solid ${palette.border}`,
                background: palette.background,
                padding: "22px",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: palette.accent,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                Launch Role
              </p>
              <h2 style={{ margin: "8px 0 10px", fontSize: "1.8rem", lineHeight: 1.05 }}>{card.name}</h2>
              <p style={{ margin: "0 0 18px", color: "rgba(31,41,51,0.78)", lineHeight: 1.65 }}>
                {card.shortUse}
              </p>

              <PromptTabsCard
                card={card}
                accent={palette.accent}
                textColor="rgba(31,41,51,0.78)"
              />
            </article>
          );
        })}
      </section>

      <section
        style={{
          marginTop: "22px",
          borderRadius: "26px",
          border: "1px solid rgba(78,164,211,0.18)",
          background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 100%)",
          padding: "24px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#0F766E",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          Guardrails
        </p>
        <h2 style={{ margin: "8px 0 10px", fontSize: "1.7rem", lineHeight: 1.05 }}>Important notes</h2>
        <p style={{ margin: "0 0 18px", color: "rgba(31,41,51,0.78)", lineHeight: 1.65 }}>
          These reminders keep the workflow safe while you use the launch prompts and dashboard together.
        </p>
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {model.notes.map((note, index) => (
            <div
              key={note}
              style={{
                borderRadius: "18px",
                background: "rgba(2, 6, 23, 0.94)",
                border: "1px solid rgba(78,164,211,0.18)",
                padding: "16px 16px 18px",
                lineHeight: 1.65,
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: index === 0 ? "#4EA4D3" : index === 1 ? "#67E8F9" : "#93C5FD",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                Note {index + 1}
              </p>
              <p style={{ margin: "10px 0 0", color: "#CBD5E1" }}>{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "18px",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        {model.handoffs.map((handoff, index) => (
          <article
            key={handoff.title}
            style={{
              borderRadius: "26px",
              border: `1px solid ${index === 0 ? "rgba(78,164,211,0.24)" : "rgba(37,99,235,0.18)"}`,
              background:
                index === 0
                  ? "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.98) 100%)"
                  : "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(238,242,255,0.98) 100%)",
              color: "var(--ink)",
              padding: "22px",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
            }}
          >
            {index === 0 ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  borderRadius: "999px",
                  background: "rgba(2, 6, 23, 0.94)",
                  color: "#F8FAFC",
                  padding: "8px 12px",
                  border: "1px solid rgba(78,164,211,0.22)",
                  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.14)",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: "#4EA4D3",
                    boxShadow: "0 0 0 6px rgba(78,164,211,0.12)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Start here
                </span>
              </div>
            ) : null}
            <p
              style={{
                margin: 0,
                color: index === 0 ? "#0F766E" : "#1D4ED8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              Handoff
            </p>
            <h2 style={{ margin: "8px 0 10px", fontSize: "1.7rem", lineHeight: 1.05 }}>
              {handoff.title}
            </h2>
            <p
              style={{
                margin: "0 0 18px",
                color: "rgba(31,41,51,0.78)",
                lineHeight: 1.65,
              }}
            >
              {handoff.description}
            </p>
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
                <p style={{ margin: 0, fontWeight: 700, color: "#F8FAFC" }}>Prompt</p>
                <CopyPromptButton text={handoff.prompt} label={handoff.copyLabel} />
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
                {handoff.prompt}
              </pre>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

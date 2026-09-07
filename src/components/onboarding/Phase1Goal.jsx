// ── Phase 1: Choose a Goal (ONBOARDING_SPEC v1.1 §3.1) ───────────────────────
// Five goal cards, single select, keyboard navigable (roving radiogroup).
// Selection sets the §6 first-artifact target. Phase 1 is the one phase that
// cannot be skipped without effect: skipping applies the default goal (§2).

import { useRef, useState } from "react";
import { GOALS, DEFAULT_GOAL } from "../../lib/onboardingState.js";

export default function Phase1Goal({ initialGoal, onContinue, onSkip }) {
  const [selected, setSelected] = useState(initialGoal || null);
  const refs = useRef([]);

  const move = (from, delta) => {
    const to = (from + delta + GOALS.length) % GOALS.length;
    setSelected(GOALS[to].id);
    refs.current[to]?.focus();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>
          What would you like to get done first?
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          Your first report is built around this. You can do the rest later.
        </p>
      </div>

      <div role="radiogroup" aria-label="Choose a goal" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {GOALS.map((g, i) => {
          const active = selected === g.id;
          return (
            <button
              key={g.id}
              ref={el => { refs.current[i] = el; }}
              role="radio"
              aria-checked={active}
              tabIndex={active || (!selected && i === 0) ? 0 : -1}
              onClick={() => setSelected(g.id)}
              onKeyDown={e => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(i, 1); }
                if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(i, -1); }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                minHeight: "var(--touch-target)", padding: "14px 18px",
                background: active ? "var(--accent-tint)" : "var(--card)",
                border: `1px solid ${active ? "var(--btn-p-bd)" : "var(--border)"}`,
                borderRadius: 12, cursor: "pointer", transition: "border-color .15s, background .15s",
              }}
            >
              <span aria-hidden="true" style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                background: active ? "var(--accent)" : "transparent",
                boxShadow: active ? "inset 0 0 0 3px var(--card)" : "none",
              }} />
              <span style={{ fontSize: 15, color: active ? "var(--text-bright)" : "var(--text-primary)" }}>{g.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          onClick={() => onSkip(DEFAULT_GOAL)}
          style={{ minHeight: "var(--touch-target)", padding: "10px 20px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer" }}
        >
          Skip for now
        </button>
        <button
          onClick={() => { if (selected) onContinue(selected); }}
          disabled={!selected}
          style={{
            minHeight: "var(--touch-target)", padding: "10px 36px",
            background: selected ? "var(--btn-p-bg)" : "var(--card)",
            border: `1px solid ${selected ? "var(--btn-p-bd)" : "var(--border-strong)"}`,
            borderRadius: 10, color: selected ? "var(--btn-p-fg)" : "var(--text-dim)",
            fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600,
            cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

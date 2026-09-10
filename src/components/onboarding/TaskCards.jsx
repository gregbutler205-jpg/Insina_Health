// ── Ongoing task cards (ONBOARDING_SPEC v1.1 §7, §8) ─────────────────────────
// Dashboard surface for the deterministic task engine. Max 4 visible,
// priority-ordered, benefit stated before the ask, dismiss/snooze on every
// card, and NO completion percentage anywhere. T9 renders the §8 storage
// prompt with its exact copy.
//
// DEC-P52 (History Builder, disposition 2 of the merge, Greg 2026-09-10): the
// builder's single next-step prompt renders here as the first card instead of
// as a second card system. Its copy is HB_COPY verbatim, its dismissal is the
// builder's own per-session dismissal rule (C-15), and Open goes to the
// builder. It has no snooze and no time estimate.

import { useEffect, useState } from "react";
import { visibleTasks, dismissTask, snoozeTask } from "../../lib/taskEngine.js";
import { saveState } from "../../lib/onboardingState.js";
import { rankPrompt, readStores, loadAttestations, loadHbState, getSessionId, recordDismissal } from "../../lib/historyBuilder.js";
import { HB_COPY } from "../../config/historyBuilderCopy.js";

const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 };
const ctaBtn = { minHeight: 36, padding: "7px 16px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 8, color: "var(--btn-p-fg)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const quietBtn = { background: "none", border: "none", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", padding: "4px 8px", minHeight: 30 };

function fmtDate(d) {
  const x = new Date(String(d) + "T12:00:00");
  return isNaN(x) ? String(d) : x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The History Builder's ranked prompt for this session, or null. */
function hbPick() {
  try {
    return rankPrompt({ stores: readStores(), attestations: loadAttestations(), hb: loadHbState(), sessionId: getSessionId() });
  } catch { return null; }
}
function hbText(pick) {
  const c = HB_COPY[pick.promptId] || {};
  const suffix = pick.suffixId ? (HB_COPY[pick.suffixId]?.suffix || "") : "";
  const c16 = pick.suffixId === "C-16" && pick.c16Date ? HB_COPY["C-16"].suffix.replace("{date}", fmtDate(pick.c16Date)) : "";
  return { title: c.title || c.text || "", sub: [c.sub, pick.suffixId === "C-16" ? c16 : suffix].filter(Boolean).join(" ") };
}

export default function TaskCards({ onNav }) {
  const [tasks, setTasks] = useState(() => visibleTasks());
  const [pick, setPick] = useState(hbPick);
  const refresh = () => { setTasks(visibleTasks()); setPick(hbPick()); };

  // §7: evaluated on app open and after record writes — mount, window focus,
  // and the app's data events all re-evaluate.
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("focus", h);
    window.addEventListener("mi-data-synced", h);
    window.addEventListener("insina-tasks-changed", h);
    return () => {
      window.removeEventListener("focus", h);
      window.removeEventListener("mi-data-synced", h);
      window.removeEventListener("insina-tasks-changed", h);
    };
  }, []);

  if (tasks.length === 0 && !pick) return null;

  const go = (task) => {
    if (task.route === "onboarding:2") {
      // T6/T2-tier0: re-enter onboarding at Quick Start Basics via the resume rail.
      saveState({ phase: 2 });
      window.dispatchEvent(new Event("insina-reopen-onboarding"));
      return;
    }
    onNav?.(task.route);
  };
  const hb = pick ? hbText(pick) : null;

  return (
    <div className="ob-focus" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-label)", fontFamily: "var(--font-mono)" }}>
        Next steps
      </div>
      {hb && (
        /* History Builder next step (HISTORY_BUILDER_SPEC section 6): one card, dismissible per session */
        <div style={{ ...card, border: "1px solid rgba(79,142,247,.25)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              {hb.sub && <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{hb.sub}</div>}
              <div style={{ fontSize: 13.5, color: "var(--text-bright)", fontWeight: 600, marginTop: 3 }}>{hb.title}</div>
            </div>
            <button aria-label={HB_COPY["C-15"]?.button || "Dismiss"} onClick={() => { recordDismissal(pick.promptId, getSessionId()); refresh(); }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, minWidth: 30, minHeight: 30 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button style={ctaBtn} onClick={() => onNav?.("history")}>Open</button>
            <button style={quietBtn} onClick={() => { recordDismissal(pick.promptId, getSessionId()); refresh(); }}>{HB_COPY["C-15"]?.button || "Not now"}</button>
          </div>
        </div>
      )}
      {tasks.map(t => t.storagePrompt ? (
        /* §8 storage prompt — exact copy */
        <div key={t.key} style={{ ...card, border: "1px solid rgba(79,142,247,.35)" }}>
          <div style={{ fontSize: 13.5, color: "var(--text-bright)", fontWeight: 700 }}>{t.benefit}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65 }}>{t.reason}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
            <button style={ctaBtn} onClick={() => go(t)}>{t.ctaLabel}</button>
            <button style={quietBtn} onClick={() => { snoozeTask(t.key); refresh(); }}>{t.laterLabel}</button>
          </div>
        </div>
      ) : (
        <div key={t.key} style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              {/* benefit before ask (§7) */}
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{t.benefit}</div>
              <div style={{ fontSize: 13.5, color: "var(--text-bright)", fontWeight: 600, marginTop: 3 }}>{t.reason}</div>
            </div>
            <button aria-label="Dismiss this task" onClick={() => { dismissTask(t.key); refresh(); }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, minWidth: 30, minHeight: 30 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button style={ctaBtn} onClick={() => go(t)}>{t.ctaLabel}</button>
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>~{t.minutes} min</span>
            <button style={quietBtn} onClick={() => { snoozeTask(t.key); refresh(); }}>Snooze a week</button>
          </div>
        </div>
      ))}
    </div>
  );
}

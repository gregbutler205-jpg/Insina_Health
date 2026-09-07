// ── Onboarding flow shell (ONBOARDING_SPEC v1.1 §2, §3.0–§3.2, §3.8) ─────────
// Renders after unlock on new installs (App.jsx gate). One linear five-phase
// rail; welcome/consent precedes Phase 1. State persists per §2 and resumes
// with the banner. Phases 3–5 land in WP2–WP4; this shell carries a clearly
// marked WP2 stub so the flow is reviewable end-to-end today.

import { useState, useEffect } from "react";
import PhaseRail from "./PhaseRail.jsx";
import WelcomeConsent from "./WelcomeConsent.jsx";
import Phase1Goal from "./Phase1Goal.jsx";
import Phase2Basics from "./Phase2Basics.jsx";
import Phase3AddData from "./Phase3AddData.jsx";
import ManualEntry from "./ManualEntry.jsx";
import ReviewQueue from "./ReviewQueue.jsx";
import PrivacyFooter from "./PrivacyFooter.jsx";
import { loadState, saveState, resetStateKeepConsent, shouldShowResumeBanner, TOTAL_PHASES, GOALS } from "../../lib/onboardingState.js";
import { evaluateGoalMinimum, evaluateAndFire, assertNoKnownAllergies, assertNoActiveConditions, addUpcomingAppointment, hasNkdaAssertion } from "../../lib/artifactEngine.js";
import { getStagedStore } from "../../lib/onboardingStaging.js";
import { printEmergency } from "../../lib/printEmergency.js";
import { printMedicationList } from "../../lib/printMedicationList.js";
import { getMedsFull } from "../../store.js";
import AdvisoryModal from "../advisory/AdvisoryModal.jsx";

// §3.5 empty-variant copy: the goal artifact's minimum needs, one sentence.
const ARTIFACT_MINIMUM_SENTENCE = {
  emergency_packet: "Your Emergency Card needs your transplant basics, at least one medication, and your allergies reviewed.",
  organize_meds: "Your Medication Report needs at least one confirmed medication.",
  track_meds_labs: "Your Medication Report needs at least one confirmed medication.",
  patient_profile: "Your Patient Profile needs your basics, medications, allergies, and at least one condition.",
  appointment_prep: "Your Consultation Prep Brief needs your medications, allergies, and one upcoming appointment.",
};

export default function OnboardingFlow({ onExit }) {
  const [state, setState] = useState(() => loadState() || saveState({}));
  const [resumeOffer, setResumeOffer] = useState(() => shouldShowResumeBanner());
  const [entered, setEntered] = useState(!shouldShowResumeBanner());
  const [subview, setSubview] = useState(null);         // null | "manual" (inside Phase 3)
  const [manualSummary, setManualSummary] = useState(null);
  const [toast, setToast] = useState(null);              // §6 early-fire: { artifact }

  // §6 non-blocking toast: "Your {artifact} is ready" with a View action.
  useEffect(() => {
    const h = (e) => setToast(e.detail);
    window.addEventListener("insina-artifact-ready", h);
    return () => window.removeEventListener("insina-artifact-ready", h);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const advance = (patch, nextPhase) => {
    const completed = [...new Set([...(state.completed_steps || []), state.phase])].filter(n => n > 0);
    setState(saveState({ ...patch, phase: nextPhase, completed_steps: completed }));
  };

  const finish = () => {
    saveState({ phase: TOTAL_PHASES });
    onExit();
  };

  // Rail position: welcome (phase 0) previews step 1; phases map 1:1 after.
  const railStep = Math.max(1, Math.min(state.phase === 0 ? 1 : state.phase, TOTAL_PHASES));

  return (
    <div className="ob-root ob-focus theme-light" style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <style>{`
        .ob-enter { animation: obFade .35s ease; }
        @media (prefers-reduced-motion: reduce) { .ob-enter { animation: none; } }
        @keyframes obFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        /* focus rings come from the shared .ob-focus rule in index.css (§11.12) */
      `}</style>

      {/* §2 resume banner */}
      {resumeOffer && (
        <div role="status" style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
            Pick up where you left off: Step {railStep} of 5
          </span>
          <button
            onClick={() => { setResumeOffer(false); setEntered(true); }}
            style={{ minHeight: 36, padding: "7px 18px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 8, color: "var(--btn-p-fg)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            Continue
          </button>
          <button
            onClick={() => { setState(resetStateKeepConsent()); setResumeOffer(false); setEntered(true); }}
            style={{ minHeight: 36, padding: "7px 14px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            Start over
          </button>
        </div>
      )}

      {/* §3 tint band behind every wizard page (Greg's preview direction) */}
      <div style={{ flex: 1, padding: "36px 20px 24px", overflowY: "auto", background: "var(--band-bg)", borderTop: "1px solid var(--band-bd)", borderBottom: "1px solid var(--band-bd)" }}>
        {entered && (
          <div className="ob-enter" key={state.phase} style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {state.phase > 0 && <PhaseRail current={railStep} />}

            {/* White frame floating on the band (preview's .frame treatment) */}
            <div style={{ width: "100%", maxWidth: 820, margin: "0 auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "36px 28px 32px", boxShadow: "var(--ob-shadow-frame)" }}>
            {state.phase === 0 && (
              <WelcomeConsent
                onContinue={() => advance({ consents: { ai_processing: true, accepted_at: new Date().toISOString() } }, 1)}
              />
            )}

            {state.phase === 1 && (
              <Phase1Goal
                initialGoal={state.goal}
                onContinue={goal => advance({ goal }, 2)}
                onSkip={defaultGoal => advance({ goal: defaultGoal }, 2)}
              />
            )}

            {state.phase === 2 && (
              <Phase2Basics
                initialTier0={state.tier0}
                onContinue={tier0 => { advance({ tier0 }, 3); evaluateAndFire(); }}
                onSkip={() => advance({}, 3)} /* Tier 0 becomes §7 tasks (T6) */
              />
            )}

            {state.phase === 3 && subview === "manual" && (
              <ManualEntry
                onDone={({ medCount, allergyCount }) => {
                  setSubview(null);
                  const parts = [];
                  if (medCount) parts.push(`${medCount} medication${medCount !== 1 ? "s" : ""}`);
                  if (allergyCount) parts.push(`${allergyCount} allerg${allergyCount !== 1 ? "ies" : "y"}`);
                  setManualSummary(parts.length ? `${parts.join(" and ")} added to your record.` : null);
                }}
                onCancel={() => setSubview(null)}
              />
            )}

            {state.phase === 3 && subview !== "manual" && (
              <Phase3AddData
                onContinue={() => advance({}, 4)}
                onManualEntry={() => setSubview("manual")}
                onSkipEverything={() => advance({}, 5)}
                manualSummary={manualSummary}
              />
            )}

            {state.phase === 4 && (
              <ReviewQueue onDone={() => advance({}, 5)} />
            )}

            {state.phase >= 5 && (
              <Phase5
                onManualEntry={() => { setState(saveState({ phase: 3 })); setSubview("manual"); }}
                onReview={() => setState(saveState({ phase: 4 }))}
                onBasics={() => setState(saveState({ phase: 2 }))}
                onFinish={finish}
              />
            )}
            </div>
          </div>
        )}
      </div>

      <footer style={{ padding: "16px 20px 22px", borderTop: "1px solid var(--divider)", textAlign: "center" }}>
        <PrivacyFooter />
      </footer>

      {/* §2/§4 advisory takeover — mounted here too so a recent critical staged
          during onboarding import can surface (AppShell isn't mounted yet). */}
      <AdvisoryModal />

      {/* §6 early-fire toast — non-blocking, auto-dismisses */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 600, display: "flex", alignItems: "center", gap: 14, background: "var(--card)", border: "1px solid var(--btn-p-bd)", borderRadius: 12, padding: "12px 18px", boxShadow: "0 12px 40px rgba(0,0,0,.55)" }}>
          <span style={{ fontSize: 13, color: "var(--text-bright)" }}>Your {toast.artifact} is ready</span>
          <button
            onClick={() => { setToast(null); setState(saveState({ phase: TOTAL_PHASES })); }}
            style={{ minHeight: 34, padding: "6px 16px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 8, color: "var(--btn-p-fg)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            View
          </button>
          <button aria-label="Dismiss" onClick={() => setToast(null)}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14, minWidth: 30, minHeight: 30 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── §3.5 Phase 5 — Your First Result ─────────────────────────────────────────
// Renders around whichever artifact exists (§6). Emergency Card and
// Medication Report invoke their generators directly; Patient Profile and
// Prep Brief goals hand off to the generator's owning screen (Greg's WP4
// review choice). View / Download PDF / Print all open the report window —
// the print dialog's "Save as PDF" is the app's file mechanism.
const btn = { alignSelf: "center", minHeight: "var(--touch-target)", padding: "10px 32px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 10, color: "var(--btn-p-fg)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" };
const ghost = { alignSelf: "center", minHeight: "var(--touch-target)", padding: "10px 24px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)" };
const linkStyle = { background: "none", border: "none", color: "var(--accent-soft)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)", minHeight: 32 };

function Phase5({ onManualEntry, onReview, onBasics, onFinish }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const state = loadState() || {};
  const goal = GOALS.find(g => g.id === state.goal) || GOALS.find(g => g.id === "emergency_packet");
  const gen = state.artifact_generated;
  const evaln = evaluateGoalMinimum(goal.id);
  const staged = getStagedStore().items.filter(i => i.status === "staged" || i.status === "deferred");
  const stagedLabs = staged.filter(i => i.category === "lab").length;

  // ── Success: the artifact exists (§3.5) ────────────────────────────────────
  if (gen) {
    const direct = gen.goal === "emergency_packet" || gen.goal === "organize_meds" || gen.goal === "track_meds_labs";
    const invoke = () => {
      if (gen.goal === "emergency_packet") printEmergency();
      else printMedicationList(getMedsFull());
    };
    const routeTo = (nav) => {
      try { sessionStorage.setItem("insina_pending_nav", nav); } catch { /* fall back to dashboard */ }
      onFinish();
    };
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
        <div aria-hidden="true" style={{ alignSelf: "center", width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #4f8ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#fff" }}>✓</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>
          Your {gen.artifact} is ready
        </h1>
        {direct ? (
          <>
            <button onClick={invoke} style={btn}>View my report</button>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={invoke} style={ghost}>Download PDF</button>
              <button onClick={invoke} style={ghost}>Print</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              To save a PDF, choose “Save as PDF” in the print dialog.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {gen.goal === "patient_profile"
                ? "Everything it needs is confirmed. Your profile screen builds and prints it."
                : "Everything it needs is confirmed. The appointment screen builds your brief."}
            </p>
            <button onClick={() => routeTo(gen.goal === "patient_profile" ? "profile" : "appointments")} style={btn}>
              {gen.goal === "patient_profile" ? "Open my Health Profile" : "Open Appointments"}
            </button>
          </>
        )}
        {staged.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {stagedLabs > 0
              ? `${stagedLabs} lab result${stagedLabs !== 1 ? "s are" : " is"} still waiting for your review: they'll improve your trends.`
              : `${staged.length} item${staged.length !== 1 ? "s are" : " is"} still waiting for your review.`}
            {" "}
            <button onClick={onReview} style={linkStyle}>Review now</button>
            {" · "}
            <button onClick={onFinish} style={linkStyle}>Review later</button>
          </p>
        )}
        <button onClick={onFinish} style={ghost}>Go to my dashboard</button>
      </div>
    );
  }

  // ── Empty variant (§3.5, §2 skip destination): nothing usable yet ──────────
  let hasMeds = false, hasAllergies = false;
  try { hasMeds = JSON.parse(localStorage.getItem("mi_meds_full") || "[]").length > 0; } catch { /* locked */ }
  try { hasAllergies = JSON.parse(localStorage.getItem("mi_allergies") || "[]").length > 0; } catch { /* locked */ }
  const hasAnything = hasMeds || hasAllergies || staged.length > 0 || hasNkdaAssertion();
  if (!hasAnything) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 400, color: "var(--text-bright)" }}>
          Not enough data yet for your {goal.artifact}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          {ARTIFACT_MINIMUM_SENTENCE[goal.id]}
        </p>
        <button onClick={onManualEntry} style={btn}>Enter medications directly</button>
        <button onClick={onFinish} style={ghost}>Go to my dashboard</button>
      </div>
    );
  }

  // ── Almost there: data exists but the minimum isn't met — offer the exact
  // missing pieces (§6; the appointment gap gets its one-screen insert). ─────
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 400, color: "var(--text-bright)" }}>
          Almost there
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.7 }}>
          Your {goal.artifact} needs a little more:
        </p>
      </div>
      {evaln.missing.map(m => (
        <div key={m.key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", minWidth: 200 }}>{m.label}</span>
          {m.key === "medication" && <button onClick={onManualEntry} style={{ ...ghost, alignSelf: "auto" }}>Enter medications</button>}
          {m.key === "allergies" && (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {staged.some(i => i.category === "allergy") && <button onClick={onReview} style={{ ...ghost, alignSelf: "auto" }}>Review staged</button>}
              <button onClick={() => { assertNoKnownAllergies(); refresh(); }} style={{ ...ghost, alignSelf: "auto" }}>I have no known allergies</button>
            </span>
          )}
          {m.key === "condition" && (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {staged.some(i => i.category === "condition") && <button onClick={onReview} style={{ ...ghost, alignSelf: "auto" }}>Review staged</button>}
              <button onClick={() => { assertNoActiveConditions(); refresh(); }} style={{ ...ghost, alignSelf: "auto" }}>No active conditions</button>
            </span>
          )}
          {(m.key === "tier0" || m.key === "name_dob") && <button onClick={onBasics} style={{ ...ghost, alignSelf: "auto" }}>Add basics</button>}
          {m.key === "appointment" && <AppointmentInsert onAdded={refresh} />}
        </div>
      ))}
      {staged.length > 0 && !evaln.missing.some(m => m.key === "allergies" || m.key === "condition") && (
        <button onClick={onReview} style={{ ...ghost }}>Review {staged.length} staged item{staged.length !== 1 ? "s" : ""}</button>
      )}
      <button onClick={onFinish} style={ghost}>Go to my dashboard</button>
    </div>
  );
}

// §6: "one upcoming appointment (date, provider, specialty — collected via a
// one-screen insert if absent)".
function AppointmentInsert({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: "", provider: "", specialty: "" });
  const [err, setErr] = useState("");
  const inp = { width: "100%", minHeight: 40, background: "var(--bg-deep)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none", colorScheme: "var(--scheme)" };
  if (!open) return <button onClick={() => setOpen(true)} style={{ ...ghost, alignSelf: "auto" }}>Add appointment</button>;
  const save = () => {
    if (!f.date || !f.provider.trim() || !f.specialty.trim()) { setErr("Date, provider, and specialty are all needed for the brief."); return; }
    if (f.date < new Date().toISOString().slice(0, 10)) { setErr("Pick an upcoming date."); return; }
    addUpcomingAppointment(f);
    setOpen(false);
    onAdded();
  };
  return (
    <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 6 }}>
      <input type="date" aria-label="Appointment date" value={f.date} onChange={e => { setF(p => ({ ...p, date: e.target.value })); setErr(""); }} style={inp} />
      <input placeholder="Provider" aria-label="Provider" value={f.provider} onChange={e => { setF(p => ({ ...p, provider: e.target.value })); setErr(""); }} style={inp} />
      <input placeholder="Specialty" aria-label="Specialty" value={f.specialty} onChange={e => { setF(p => ({ ...p, specialty: e.target.value })); setErr(""); }} style={inp} />
      {err && <div style={{ gridColumn: "1/-1", fontSize: 12, color: "var(--red)" }}>{err}</div>}
      <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setOpen(false)} style={{ ...ghost, alignSelf: "auto" }}>Cancel</button>
        <button onClick={save} style={{ ...btn, alignSelf: "auto", padding: "8px 22px", fontSize: 13 }}>Save appointment</button>
      </div>
    </div>
  );
}

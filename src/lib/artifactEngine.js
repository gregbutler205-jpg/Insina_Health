// ── First-artifact engine (ONBOARDING_SPEC v1.1 §6, C5) ──────────────────────
// Deterministic, no AI. On every queue confirmation (and every other
// confirmed write path: manual entry, Tier 0, the assertions, the
// appointment insert) the goal's minimum dataset is re-evaluated; on FIRST
// satisfaction the artifact is marked generated, the non-blocking toast
// fires, and Phase 5 renders around it — even while other staged categories
// remain unreviewed. Artifact content lives with the existing report
// generators; this module only decides when they become invocable.

import { loadState, saveState, GOALS, DEFAULT_GOAL } from "./onboardingState.js";

const readArr = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const readObj = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };

// ── Positive assertions (§6: absence of data is NOT the same as NKDA) ────────
export const NKDA_KEY = "mi_nkda_assertion";
export const NO_CONDITIONS_KEY = "mi_no_conditions_assertion";

export function assertNoKnownAllergies(now = new Date()) {
  try { localStorage.setItem(NKDA_KEY, JSON.stringify({ asserted_at: now.toISOString() })); } catch { /* locked */ }
  return evaluateAndFire();
}
export function assertNoActiveConditions(now = new Date()) {
  try { localStorage.setItem(NO_CONDITIONS_KEY, JSON.stringify({ asserted_at: now.toISOString() })); } catch { /* locked */ }
  return evaluateAndFire();
}
/** Writing a real allergy contradicts an earlier NKDA assertion — clear it. */
export function clearNkdaAssertion() {
  try { localStorage.removeItem(NKDA_KEY); } catch { /* locked */ }
}
export function hasNkdaAssertion() { return !!readObj(NKDA_KEY)?.asserted_at; }
export function hasNoConditionsAssertion() { return !!readObj(NO_CONDITIONS_KEY)?.asserted_at; }

// ── Minimum-dataset predicates ────────────────────────────────────────────────
function profile() { try { return JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); } catch { return {}; } }
function hasNameDob() { const p = profile(); return !!(p.name && p.dob); }
function tier0Transplant() { const t = loadState()?.tier0 || {}; return !!(t.organ && t.tx_date); }
function hasMeds() { return readArr("mi_meds_full").length > 0; }
function allergiesReviewed() { return readArr("mi_allergies").length > 0 || hasNkdaAssertion(); }
function conditionsPresent() { return readArr("mi_conditions").length > 0 || hasNoConditionsAssertion(); }
function upcomingAppointment() {
  const today = new Date().toISOString().slice(0, 10);
  return readArr("mi_appointments").find(a =>
    a.status === "upcoming" && a.date && a.date >= today && a.provider && a.specialty
  ) || null;
}

// Missing-element keys are stable identifiers the §7 task engine (T2) will
// reuse; `label` is patient-facing copy for the Phase 5 completion list.
const MISSING = {
  name_dob:    { key: "name_dob",    label: "Your name and date of birth" },
  tier0:       { key: "tier0",       label: "Your transplant basics (organ and date)" },
  medication:  { key: "medication",  label: "At least one medication" },
  allergies:   { key: "allergies",   label: "Your allergies reviewed (or “no known allergies”)" },
  condition:   { key: "condition",   label: "At least one condition (or “no active conditions”)" },
  appointment: { key: "appointment", label: "One upcoming appointment (date, provider, specialty)" },
};

/**
 * §6 evaluation for a goal. §3.2 (v1.1 errata): name + DOB are required
 * before ANY report generates, so they precede every goal's own minimums.
 * @returns {{satisfied: boolean, missing: {key, label}[], artifact: string}}
 */
export function evaluateGoalMinimum(goalId = loadState()?.goal || DEFAULT_GOAL) {
  const goal = GOALS.find(g => g.id === goalId) || GOALS.find(g => g.id === DEFAULT_GOAL);
  const missing = [];
  if (!hasNameDob()) missing.push(MISSING.name_dob);
  switch (goal.id) {
    case "emergency_packet":
      if (!tier0Transplant()) missing.push(MISSING.tier0);
      if (!hasMeds()) missing.push(MISSING.medication);
      if (!allergiesReviewed()) missing.push(MISSING.allergies);
      break;
    case "organize_meds":
    case "track_meds_labs":
      if (!hasMeds()) missing.push(MISSING.medication);
      break;
    case "patient_profile":
      if (!tier0Transplant()) missing.push(MISSING.tier0);
      if (!hasMeds()) missing.push(MISSING.medication);
      if (!allergiesReviewed()) missing.push(MISSING.allergies);
      if (!conditionsPresent()) missing.push(MISSING.condition);
      break;
    case "appointment_prep":
      if (!hasMeds()) missing.push(MISSING.medication);
      if (!allergiesReviewed()) missing.push(MISSING.allergies);
      if (!upcomingAppointment()) missing.push(MISSING.appointment);
      break;
    default:
      break;
  }
  return { satisfied: missing.length === 0, missing, artifact: goal.artifact, goalId: goal.id };
}

/**
 * The trigger (§6, C5): evaluate on every confirmation; on first
 * satisfaction, mark the artifact generated, queue the labs-import task for
 * the track goal, and announce via a window event (the onboarding shell
 * shows the non-blocking "Your {artifact} is ready" toast).
 * Fires at most once per onboarding run.
 */
export function evaluateAndFire(now = new Date()) {
  const state = loadState();
  if (!state) return { fired: false, satisfied: false };
  const evaln = evaluateGoalMinimum(state.goal || DEFAULT_GOAL);
  if (!evaln.satisfied || state.artifact_generated) return { fired: false, ...evaln };
  const artifact_generated = { artifact: evaln.artifact, goal: evaln.goalId, at: now.toISOString() };
  const patch = { artifact_generated };
  if (evaln.goalId === "track_meds_labs") patch.labs_import_task_queued = true; // §6: consumed by the §7 engine (T3)
  saveState(patch);
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent("insina-artifact-ready", { detail: artifact_generated }));
  }
  return { fired: true, ...evaln };
}

/** §6 appointment one-screen insert: pre-confirmed patient-typed write. */
export function addUpcomingAppointment({ title, provider, specialty, date }) {
  const appts = readArr("mi_appointments");
  appts.unshift({
    id: `ob_${Date.now().toString(36)}`,
    title: title || `${specialty || "Appointment"}: ${provider || ""}`.trim(),
    provider: provider || "", specialty: specialty || "", date: date || "",
    time: "", status: "upcoming", urgency: "med", reminder: true,
    source: "Entered manually", addedAt: new Date().toISOString(),
  });
  try { localStorage.setItem("mi_appointments", JSON.stringify(appts)); } catch { /* locked */ }
  return evaluateAndFire();
}

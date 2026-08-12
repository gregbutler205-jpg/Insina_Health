// History Builder engine (HISTORY_BUILDER_SPEC v1.1, DEC-P44/P45/P46 pending merge).
// Pure computation over the stores: gaps, readiness, freshness, and the
// deterministic prompt ranking. No AI, no side effects in the compute
// functions; storage IO lives only in the thin load/save wrappers so every
// compute is testable under Node with injected data.
//
// Stage model (spec section 3): S1 safety spine, S2 current state, S3 recent
// care, S4 transplant story, S5 important past history, S6 older records
// (never prompted). A field present in any store, from any origin, is never
// re-asked. Attestations are confirmations, not re-asks.

import { TROUGH_PROMPT_AGE_DAYS, PANEL_PROMPT_AGE_DAYS, APPT_BOOST_WINDOW_DAYS } from "../config/historyBuilderConfig.js";

export const HB_KEY = "mi_history_builder";
export const ATTEST_KEY = "mi_attestations";
export const STAGED_KEY = "mi_staged_items";

// Wizard goal ids (src/lib/onboardingState.js GOALS) to spec goal keys.
// Absent or unmapped values resolve to 'skipped' (DEC-P46).
export const GOAL_MAP = {
  appointment_prep: "appointment",
  track_meds_labs: "meds_labs",
  emergency_packet: "emergency",
  organize_meds: "organize_meds",
  patient_profile: "profile",
};
export function mapWizardGoal(raw) {
  return GOAL_MAP[raw] || "skipped";
}

// ── storage wrappers ─────────────────────────────────────────────────────────

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch { return fallback; }
}

export function defaultHbState() {
  return { goal: null, targetAppointmentId: null, dismissals: [], s4Covered: false, emergencyReadyShownAt: null };
}

export function loadHbState() {
  const s = readJson(HB_KEY, null);
  const merged = { ...defaultHbState(), ...(s && typeof s === "object" ? s : {}) };
  if (merged.goal == null) {
    // Copied once from the wizard's stored selection (Phase 0 item 7 mapping).
    const ob = readJson("mi_onboarding_state", null);
    merged.goal = mapWizardGoal(ob?.goal);
    try { localStorage.setItem(HB_KEY, JSON.stringify(merged)); } catch { /* locked or quota */ }
  }
  return merged;
}

export function saveHbState(patch) {
  const next = { ...loadHbState(), ...patch };
  try { localStorage.setItem(HB_KEY, JSON.stringify(next)); } catch { /* locked or quota */ }
  return next;
}

export function loadAttestations() {
  const a = readJson(ATTEST_KEY, null);
  return { medsCompleteAt: null, allergiesResolvedAt: null, conditionsReviewedAt: null, ...(a && typeof a === "object" ? a : {}) };
}

// Attestation timestamps are set ONLY by their explicit confirmations
// (C-02 yes, C-03 empty-state or first allergy entry, C-05 confirm).
export function setAttestation(field, ts = new Date().toISOString()) {
  const allowed = ["medsCompleteAt", "allergiesResolvedAt", "conditionsReviewedAt"];
  if (!allowed.includes(field)) return loadAttestations();
  const next = { ...loadAttestations(), [field]: ts };
  try { localStorage.setItem(ATTEST_KEY, JSON.stringify(next)); } catch { /* locked or quota */ }
  return next;
}

/** Collect the reconciled stores the engine reads. Injectable for tests. */
export function readStores() {
  return {
    meds: readJson("mi_meds_full", []),
    conditions: readJson("mi_conditions", []),
    allergies: readJson("mi_allergies", []),
    careTeam: readJson("mi_care_team", []),
    labs: readJson("mi_labs", []),
    readings: readJson("mi_readings", []),
    appointments: readJson("mi_appointments", []),
    symptoms: readJson("mi_symptoms", []),
    surgeries: readJson("mi_surgeries", []),
    records: readJson("mi_records", []),
    documents: readJson("mi_documents", []),
    refDocs: readJson("mi_ref_docs", []),
    profile: readJson("mi_profile_personal", {}),
  };
}

// ── field predicates ─────────────────────────────────────────────────────────

const activeMeds = (stores) => (stores.meds || []).filter(m => m && m.status !== "inactive" && m.status !== "discontinued");

/** Transplant basics: organ, date, center. Conservative store mapping (Tier 2
 *  log): satisfied by a surgeries entry whose procedure mentions transplant
 *  and carries a date, with the center taken from its facility; a conditions
 *  entry mentioning transplant supplies the organ signal as fallback. */
export function transplantBasicsPresent(stores) {
  const tx = (stores.surgeries || []).find(s => /transplant/i.test(s?.procedure || s?.name || ""));
  if (tx && (tx.date || tx.when) && (tx.facility || tx.center)) return true;
  const cond = (stores.conditions || []).find(c => /transplant/i.test(c?.name || ""));
  return !!(tx && (tx.date || tx.when)) || !!(cond && cond.since && tx);
}

export function careTeamPhonePresent(stores) {
  return (stores.careTeam || []).some(m => m && String(m.phone || "").replace(/\D/g, "").length >= 7);
}

export function coordinatorPhonePresent(stores) {
  return (stores.careTeam || []).some(m => /coordinator/i.test(`${m?.role || ""} ${m?.specialty || ""} ${m?.notes || ""}`) && String(m?.phone || "").replace(/\D/g, "").length >= 7);
}

export function demographicsPresent(stores) {
  const p = stores.profile || {};
  return !!(p.name && p.dob && p.emergency);
}

export function enrichmentGapOpen(stores) {
  return activeMeds(stores).some(m => !(m.frequency || m.schedule) || !(m.refillDate || m.refill_date || m.nextRefill));
}

// ── freshness (raw ages only, no labels) ─────────────────────────────────────

const isTrough = (l) => /tacrolimus|fk\s*-?\s*506/i.test(l?.name || "");
const isPanelMarker = (l) => /\b(alt|ast|alk(aline)? phos|alp|bilirubin)\b/i.test(l?.name || "");

function newestDate(list) {
  let best = null;
  for (const l of list) {
    const d = l?.date ? new Date(l.date) : null;
    if (d && !isNaN(d) && (!best || d > best)) best = d;
  }
  return best;
}

export function freshnessAges(stores, now = new Date()) {
  const troughs = (stores.labs || []).filter(isTrough);
  const panels = (stores.labs || []).filter(isPanelMarker);
  const age = (d) => (d ? Math.floor((now - d) / 86400000) : null);
  return {
    troughAgeDays: age(newestDate(troughs)),
    panelAgeDays: age(newestDate(panels)),
    troughCount: troughs.length,
  };
}

// ── gaps ─────────────────────────────────────────────────────────────────────
// Each S1 field stays open until its readiness condition is met; the prompt id
// shown depends on whether the entry gap or only the confirmation remains.
// Prompts exist only where spec section 11 provides copy; fields with no copy
// (vitals baseline, upcoming appointments, current symptoms, encounters and
// imaging) count for area display but never generate a ranked card.

export function computeGaps(stores, attestations, hb = {}) {
  const gaps = [];
  const meds = activeMeds(stores);

  // S1 in field order: medications, allergies, transplant basics, active
  // conditions, care team.
  if (!attestations.medsCompleteAt) {
    gaps.push({ promptId: meds.length === 0 ? "C-01" : "C-02", stage: 1, field: "medications" });
  }
  if (!attestations.allergiesResolvedAt) {
    gaps.push({ promptId: "C-03", stage: 1, field: "allergies" });
  }
  if (!transplantBasicsPresent(stores)) {
    gaps.push({ promptId: "C-04", stage: 1, field: "transplant_basics" });
  }
  if (!attestations.conditionsReviewedAt) {
    gaps.push({ promptId: "C-05", stage: 1, field: "conditions" });
  }
  if (!careTeamPhonePresent(stores)) {
    gaps.push({ promptId: "C-06", stage: 1, field: "care_team" });
  }

  const ages = freshnessAges(stores);
  // S2: trough and panel presence (the two promptable S2 fields).
  if (ages.troughCount === 0) gaps.push({ promptId: "C-09a", stage: 2, field: "trough" });
  if (ages.panelAgeDays == null) gaps.push({ promptId: "C-10", stage: 2, field: "panel" });

  // S3: trough backfill; trends need more than one point.
  if (ages.troughCount > 0 && ages.troughCount < 2) gaps.push({ promptId: "C-09b", stage: 3, field: "trough_backfill" });

  // S4: discharge summary seed, then milestone adds, until soft completion.
  if (!hb.s4Covered) {
    const hasDischarge = [...(stores.documents || []), ...(stores.refDocs || [])]
      .some(d => /discharge/i.test(d?.title || d?.name || ""));
    if (!hasDischarge) gaps.push({ promptId: "C-18", stage: 4, field: "discharge_summary" });
    gaps.push({ promptId: "C-19", stage: 4, field: "milestones" });
  }

  // S5: important past history until any past-history signal exists.
  const pastSignal =
    (stores.surgeries || []).some(s => !/transplant/i.test(s?.procedure || s?.name || "")) ||
    (stores.conditions || []).some(c => c?.status === "history") ||
    (stores.records || []).length > 0;
  if (!pastSignal) gaps.push({ promptId: "C-20", stage: 5, field: "past_history" });

  return gaps;
}

// ── readiness (spec section 5 table) ─────────────────────────────────────────

export function computeReadiness(stores, attestations) {
  const emergencyPacket =
    transplantBasicsPresent(stores) &&
    !!attestations.allergiesResolvedAt &&
    !!attestations.medsCompleteAt &&
    !!attestations.conditionsReviewedAt &&
    careTeamPhonePresent(stores);
  const medicationReport = !!attestations.medsCompleteAt;
  const patientProfile = emergencyPacket && demographicsPresent(stores);
  const upcoming = (stores.appointments || []).some(a => a?.status === "upcoming");
  const consultationPrep = emergencyPacket && upcoming;
  return { emergencyPacket, medicationReport, patientProfile, consultationPrep };
}

// ── ranking (spec section 6) ─────────────────────────────────────────────────

function nearestUpcomingWithin(appointments, days, now = new Date()) {
  const limit = new Date(now.getTime() + days * 86400000);
  return (appointments || [])
    .filter(a => a?.status === "upcoming" && a?.date)
    .map(a => ({ a, d: new Date(a.date + "T12:00:00") }))
    .filter(x => !isNaN(x.d) && x.d >= new Date(now.getTime() - 86400000) && x.d <= limit)
    .sort((x, y) => x.d - y.d)[0]?.a || null;
}

function suffixForS1(promptId, goal) {
  if (goal === "skipped") return null;
  if (goal === "appointment") return "C-27a";
  if (goal === "profile") return "C-27d";
  if (goal === "organize_meds") return (promptId === "C-01" || promptId === "C-02") ? "C-27c" : "C-27b";
  return "C-27b"; // emergency and meds_labs
}

/**
 * Deterministic: (gaps, ages, appointments, dismissals, goal) to one promptId
 * or null. Open S1 gaps outrank every boosted prompt on every goal; the single
 * exception is the appointment anchor C-28, which precedes S1 only when goal
 * is 'appointment' and no target is chosen yet.
 */
export function rankPrompt({ stores, attestations, hb, sessionId, now = new Date() }) {
  const goal = hb.goal || "skipped";
  const gaps = computeGaps(stores, attestations, hb);
  const ages = freshnessAges(stores, now);
  const readiness = computeReadiness(stores, attestations);

  // Anchor exception (DEC-P46): before S1, appointment goal only, until chosen.
  if (goal === "appointment" && !hb.targetAppointmentId) {
    return { promptId: "C-28", suffixId: null, c16Date: null };
  }

  const s1 = gaps.filter(g => g.stage === 1);
  const candidates = [];

  if (s1.length) {
    for (const g of s1) candidates.push({ ...g, suffixId: suffixForS1(g.promptId, goal) });
  } else {
    // Post-S1 boosts, then base order S2 to S5.
    const target = (stores.appointments || []).find(a => String(a?.id) === String(hb.targetAppointmentId));
    const near = nearestUpcomingWithin(stores.appointments, APPT_BOOST_WINDOW_DAYS, now);
    const apptForSuffix = goal === "appointment" && target ? target : near;
    const apptBoost = !!apptForSuffix;
    const troughAged = ages.troughAgeDays == null || ages.troughAgeDays > TROUGH_PROMPT_AGE_DAYS;
    const panelAged = ages.panelAgeDays == null || ages.panelAgeDays > PANEL_PROMPT_AGE_DAYS;
    const c16 = apptBoost ? { suffixId: "C-16", c16Date: apptForSuffix.date } : { suffixId: null, c16Date: null };

    const boosted = [];
    if (goal === "organize_meds" && readiness.medicationReport && enrichmentGapOpen(stores)) {
      boosted.push({ promptId: "C-25", stage: 2, field: "enrichment" });
    }
    if (goal === "profile" && !demographicsPresent(stores)) {
      boosted.push({ promptId: "C-26", stage: 2, field: "demographics" });
    }
    const troughOpen = gaps.some(g => g.promptId === "C-09a") || (ages.troughCount > 0 && troughAged);
    const panelOpen = gaps.some(g => g.promptId === "C-10") || (ages.panelAgeDays != null && panelAged);
    const boostLabs = goal === "meds_labs" || goal === "appointment" || apptBoost || troughAged || panelAged;
    if (boostLabs) {
      if (troughOpen) boosted.push({ promptId: "C-09a", stage: 2, field: "trough", ...(apptBoost ? c16 : {}) });
      if (goal === "meds_labs" && ages.troughCount > 0 && ages.troughCount < 2) {
        boosted.push({ promptId: "C-09b", stage: 3, field: "trough_backfill" });
      }
      if (panelOpen) boosted.push({ promptId: "C-10", stage: 2, field: "panel", ...(apptBoost ? c16 : {}) });
    }
    const boostedIds = new Set(boosted.map(b => b.promptId));
    candidates.push(...boosted);
    for (const g of gaps.filter(g => g.stage >= 2 && !boostedIds.has(g.promptId))) candidates.push(g);
  }

  if (!candidates.length) return null;

  // Dismissal rule (C-15): a dismissed prompt drops below its stage peers,
  // resurfaces only after the other prompts in its stage clear, and at most
  // once per session.
  const dismissCount = (id) => (hb.dismissals || []).filter(d => d.promptId === id && d.sessionId === sessionId).length;
  const fresh = candidates.filter(c => dismissCount(c.promptId) === 0);
  if (fresh.length) return fresh[0];
  const resurfaceable = candidates.filter(c => {
    if (dismissCount(c.promptId) >= 2) return false;
    const peers = candidates.filter(p => p.stage === c.stage && p.promptId !== c.promptId && dismissCount(p.promptId) === 0);
    return peers.length === 0;
  });
  return resurfaceable[0] || null;
}

export function recordDismissal(promptId, sessionId) {
  const hb = loadHbState();
  return saveHbState({ dismissals: [...(hb.dismissals || []), { promptId, sessionId }] });
}

/** Per-session id for dismissal bookkeeping. */
export function getSessionId() {
  try {
    let id = sessionStorage.getItem("hb_session_id");
    if (!id) { id = `s_${Date.now().toString(36)}`; sessionStorage.setItem("hb_session_id", id); }
    return id;
  } catch { return "s_static"; }
}

// ── gating (spec section 10) ─────────────────────────────────────────────────
// Reuses the existing extraction gating: EXTRACTION_MODE 'live' is the only
// state where the extraction offer may render. No new mechanism.
export function pickUploadCopy(extractionMode) {
  return extractionMode === "live" ? "C-12" : "C-13";
}

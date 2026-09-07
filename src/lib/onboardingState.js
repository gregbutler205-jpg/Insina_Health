// ── Onboarding state machine (ONBOARDING_SPEC v1.1 §2, §3.8) ─────────────────
// One localStorage key holds the whole flow state. DEVIATION (flagged in the
// WP1 report): the spec names the key "onboarding_state"; it is stored here
// as "mi_onboarding_state" so the P-02 vault encrypts it — tier0 carries PHI
// (organ, transplant date, coordinator identity/phone) and a plain key would
// sit unencrypted at rest. Shape and semantics are exactly the spec's.

import { hasVault } from "./secureStorage.js";

const KEY = "mi_onboarding_state";

// Captured at module load, before LockScreen can create a vault this session:
// "new install" means no vault existed when the app booted (Greg's decision,
// onboarding work-order review: new installs only; demo builds never onboard).
const hadVaultAtBoot = hasVault();
const IS_DEMO_BUILD = import.meta.env?.VITE_DEMO_BUILD === "true";

export const TOTAL_PHASES = 5;

// §3.1 goals → §6 artifact targets.
export const GOALS = [
  { id: "appointment_prep",  label: "Prepare for an upcoming appointment",   artifact: "Consultation Prep Brief" },
  { id: "track_meds_labs",   label: "Track my transplant medications & labs", artifact: "Medication Report" },
  { id: "emergency_packet",  label: "Create an emergency health packet",     artifact: "Emergency Card" },
  { id: "organize_meds",     label: "Organize my medications",               artifact: "Medication Report" },
  { id: "patient_profile",   label: "Build my portable patient profile",     artifact: "Patient Profile" },
];
export const DEFAULT_GOAL = "emergency_packet"; // §2: applied if Phase 1 is skipped

export function defaultState() {
  return {
    version: 1,
    phase: 0, // 0 = welcome/consent (precedes Phase 1)
    goal: null,
    tier0: {},
    consents: { ai_processing: false, accepted_at: null },
    staged_counts: {},
    artifact_generated: null,
    completed_steps: [],
    last_seen: null,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s === "object" ? { ...defaultState(), ...s } : null;
  } catch { return null; }
}

export function saveState(patch) {
  // Dev-only sentinel: onboarding completion (phase 5) should only ever come
  // from an explicit user action; a stack trace here catches any stray path.
  if (import.meta.env?.DEV && patch && patch.phase === TOTAL_PHASES) console.trace("[onboarding] phase-5 write");
  const next = { ...(loadState() || defaultState()), ...patch, last_seen: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* locked or quota: state loss is resumable */ }
  return next;
}

// "Start over" keeps the accepted product-wide AI consent (§3.0: the checkbox
// satisfies §9.2 for the whole product, not just one flow attempt).
export function resetStateKeepConsent() {
  const prev = loadState();
  const fresh = defaultState();
  if (prev?.consents?.ai_processing) fresh.consents = prev.consents;
  try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* non-fatal */ }
  return fresh;
}

/**
 * Whether the onboarding flow should render for this session (checked after
 * unlock — the state key is vault-encrypted). New installs only: either the
 * boot had no vault and onboarding never started, or a previous session left
 * the flow incomplete (§2 resume).
 */
export function shouldOnboard() {
  if (IS_DEMO_BUILD) return false;
  const s = loadState();
  if (s) return s.phase < TOTAL_PHASES;
  if (!hadVaultAtBoot) return true;
  // Erase & Start Fresh followed by a new vault in the same page session is
  // a new install even though a vault existed at boot (LockScreen sets this).
  try { return sessionStorage.getItem("insina_fresh_vault") === "1"; } catch { return false; }
}

/** §2 resume banner condition: launch with phase < 5 and last_seen present. */
export function shouldShowResumeBanner(s = loadState()) {
  return !!(s && s.phase < TOTAL_PHASES && s.last_seen && s.phase > 0);
}

/**
 * §3.0 hard gate: no extraction call of any kind may fire while the AI
 * processing consent is not granted. Every extraction entry point must check
 * this before any network activity.
 */
export function extractionAllowed() {
  return loadState()?.consents?.ai_processing === true;
}

// ── Pure field helpers (unit-tested) ─────────────────────────────────────────

/** US phone → E.164 (+1XXXXXXXXXX). Returns null if not a 10-digit US number. */
export function toE164US(input) {
  const digits = String(input || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? `+1${ten}` : null;
}

/** Display mask for a US phone as the user types: (555) 123-4567. */
export function maskUSPhone(input) {
  const d = String(input || "").replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** §3.2 transplant-date rules: reject future dates; warn (not block) > 50 years past. */
export function validateTransplantDate(iso, now = new Date()) {
  if (!iso) return { ok: true, warn: null };
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return { ok: false, error: "Enter a valid date." };
  if (d > now) return { ok: false, error: "Transplant date can't be in the future." };
  const fifty = new Date(now); fifty.setFullYear(fifty.getFullYear() - 50);
  if (d < fifty) return { ok: true, warn: "That's more than 50 years ago: double-check the year." };
  return { ok: true, warn: null };
}

/** §3.2 DOB: required, a real date, not in the future. */
export function validateDob(iso, now = new Date()) {
  if (!iso) return { ok: false, error: "Date of birth is required." };
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return { ok: false, error: "Enter a valid date." };
  if (d > now) return { ok: false, error: "Date of birth can't be in the future." };
  return { ok: true };
}

// ── A-01 / PG-09: deterministic tripwire engine ──────────────────────────────
// Evaluates labs against effective thresholds and produces the evaluation
// envelope INSINA_AI_PROMPTS.md §6 defines for {tripwireFlags}. This is the
// ONLY thing that classifies urgency (CSC rule 4) — the model echoes, never
// originates. Deterministic, no AI involved.
import { DEFAULT_LIBRARY } from "../config/tripwireDefaults.js";
import { appendAudit } from "../rie/auditLog.js";
import { canonicalLabId } from "./labCanonical.js";

const FLAG_STORE_KEY = "mi_tripwire_flags";
// Shared with A-06's condition-module gate: one "let me preview unreviewed
// clinical content on my own device" toggle, not two.
const ALLOW_UNREVIEWED_KEY = "mi_allow_unreviewed_modules";
const DISMISS_KEY = "mi_tripwire_dismissed"; // { [flagId]: true } — re-surfaces on a new qualifying value since the id embeds date+value

function safeRead(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function allowUnreviewed() {
  try { return localStorage.getItem(ALLOW_UNREVIEWED_KEY) === "true"; } catch { return false; }
}
// A-04: canonical-id matching (seed synonyms + the patient's confirmed
// mi_lab_name_map) is now the single source of truth for "same analyte
// across facilities" — replacing this engine's former 4-entry inline table.
function canonicalize(name) {
  return canonicalLabId(name);
}
/** Exported so other modules (labDigest.js) match analytes against flags the same way the engine does. */
export const canonicalizeLabName = canonicalize;
function libraryReviewed() {
  return DEFAULT_LIBRARY.reviewedBy != null || allowUnreviewed();
}
function libraryEntry(canonicalId) {
  if (!libraryReviewed()) return null;
  return DEFAULT_LIBRARY.analytes.find(a => a.canonicalId === canonicalId) || null;
}

function mkFlag(lab, canonicalId, value, level, bound, thresholdSource, guidance) {
  return {
    analyte: lab.name,
    canonicalId,
    value, unit: lab.unit || "", date: lab.date || null,
    level, bound, thresholdSource,
    guidance: guidance || "Discuss this result with your care team.",
  };
}

/**
 * Evaluate one lab result against effective thresholds. Precedence per spec
 * (provider custom > user-confirmed > library default): user-confirmed
 * thresholds have no store yet (no UI produces them) — that tier is a no-op
 * until a future item adds one. Urgent tier comes only from the reviewed
 * default library (no per-patient urgent override exists yet); abnormal
 * tier prefers a provider-set custom range over the library's own low/high
 * when both exist. Returns a flag object or null.
 */
export function evaluateLab(lab, customRanges = {}) {
  const value = parseFloat(lab.value);
  if (!lab.name || value == null || isNaN(value)) return null;
  const canonicalId = canonicalize(lab.name);
  const entry = libraryEntry(canonicalId);

  if (entry) {
    if (entry.urgentLow != null && value < entry.urgentLow) {
      return mkFlag(lab, canonicalId, value, "urgent", "belowUrgentLow", "default", entry.guidanceLow);
    }
    if (entry.urgentHigh != null && value > entry.urgentHigh) {
      return mkFlag(lab, canonicalId, value, "urgent", "aboveUrgentHigh", "default", entry.guidanceHigh);
    }
  }

  const custom = customRanges[canonicalize(lab.name)];
  if (custom && custom.low != null && custom.high != null) {
    if (value < custom.low) return mkFlag(lab, canonicalId, value, "abnormal", "belowLow", "provider-custom", `This result is below the range your care team set for you (${custom.low}–${custom.high}${lab.unit ? " " + lab.unit : ""}). Worth discussing with your care team.`);
    if (value > custom.high) return mkFlag(lab, canonicalId, value, "abnormal", "aboveHigh", "provider-custom", `This result is above the range your care team set for you (${custom.low}–${custom.high}${lab.unit ? " " + lab.unit : ""}). Worth discussing with your care team.`);
  } else if (entry && (entry.low != null || entry.high != null)) {
    if (entry.low != null && value < entry.low) return mkFlag(lab, canonicalId, value, "abnormal", "belowLow", "default", entry.guidance);
    if (entry.high != null && value > entry.high) return mkFlag(lab, canonicalId, value, "abnormal", "aboveHigh", "default", entry.guidance);
  }

  return null;
}

function newestLabDateOf(labs) {
  return labs.reduce((max, l) => {
    const t = l.date ? new Date(l.date).getTime() : NaN;
    return !isNaN(t) && (max == null || t > max) ? t : max;
  }, null);
}

/**
 * Evaluate every lab (most recent result per analyte only) against effective
 * thresholds and persist the envelope. Call at import, sync, and manual
 * entry — the "Hooks at import, sync, and manual entry" A-01 requires.
 */
export function runTripwireEvaluation() {
  const labs = safeRead("mi_labs", []);
  const customRanges = safeRead("mi_lab_custom_ranges", {});
  const flags = [];
  const seen = new Set();
  const byRecency = [...labs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  for (const lab of byRecency) {
    const key = canonicalize(lab.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const flag = evaluateLab(lab, customRanges);
    if (flag) flags.push(flag);
  }
  const newest = newestLabDateOf(labs);
  const envelope = {
    evaluatedAt: new Date().toISOString(),
    newestLabDate: newest ? new Date(newest).toISOString().slice(0, 10) : null,
    flags,
  };
  try { localStorage.setItem(FLAG_STORE_KEY, JSON.stringify(envelope)); } catch {}
  appendAudit({ action: "tripwireEvaluation", flagCount: flags.length, urgentCount: flags.filter(f => f.level === "urgent").length });
  window.dispatchEvent(new Event("mi_tripwire_changed"));
  return getTripwireEnvelope();
}

/**
 * Read the current envelope with status computed fresh against live data
 * (never trust a stored status — labs may have arrived since the last run).
 * status:
 * - "unavailable": the flag store is missing, unreadable, or malformed, OR
 *   the default library's urgent tier is entirely unreviewed and no
 *   provider-custom ranges exist to evaluate against — i.e. nothing
 *   meaningful was actually checked. Extending "unavailable" to cover this
 *   (beyond spec's literal "store missing" wording) is deliberate: CSC rule
 *   4 treats "current, no flags" as license to reassure the patient that an
 *   unflagged value is fine. If the urgent tier never ran because nothing
 *   in the library is reviewed yet, that reassurance would be false. See
 *   DECISIONS.md DEC-026.
 * - "stale": evaluatedAt predates the newest lab result (a lab arrived
 *   since the last run).
 * - "current": otherwise.
 */
export function getTripwireEnvelope() {
  const raw = safeRead(FLAG_STORE_KEY, null);
  if (!raw || !raw.evaluatedAt || !Array.isArray(raw.flags)) {
    return { status: "unavailable", evaluatedAt: null, newestLabDate: null, flags: [] };
  }
  if (!libraryReviewed() && Object.keys(safeRead("mi_lab_custom_ranges", {})).length === 0) {
    return { ...raw, status: "unavailable", flags: dropDismissed(raw.flags) };
  }
  const labs = safeRead("mi_labs", []);
  const newest = newestLabDateOf(labs);
  const evaluatedAt = new Date(raw.evaluatedAt).getTime();
  const status = (newest != null && evaluatedAt < newest) ? "stale" : "current";
  return { ...raw, status, flags: dropDismissed(raw.flags) };
}

function flagId(f) {
  return `${f.canonicalId}|${f.date || ""}|${f.value}|${f.bound}`;
}
function dropDismissed(flags) {
  const dismissed = safeRead(DISMISS_KEY, {});
  return flags.filter(f => !dismissed[flagId(f)]);
}
/** Dismissible; a new qualifying value (different date/value) re-surfaces since the id embeds both. */
export function dismissTripwireFlag(flag) {
  const dismissed = safeRead(DISMISS_KEY, {});
  dismissed[flagId(flag)] = true;
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed)); } catch {}
  appendAudit({ action: "dismissTripwireFlag", analyte: flag.analyte, canonicalId: flag.canonicalId });
  window.dispatchEvent(new Event("mi_tripwire_changed"));
}

// Hooks at import, sync, and manual entry (§A-01's own instruction: "the
// existing mi-data-synced event"). Every lab-writing call site dispatches
// this event; registering the listener here, once, at module load means any
// current or future writer that already dispatches it gets tripwire
// evaluation for free, with no per-call-site wiring to keep in sync.
if (typeof window !== "undefined") {
  window.addEventListener("mi-data-synced", runTripwireEvaluation);
}

/** Render the evaluation envelope as the {tripwireFlags} prompt text (CSC rule 4's contract). */
export function formatTripwireEnvelope(envelope) {
  const header = `TRIPWIRE FLAGS
Envelope status: ${envelope.status}. Evaluated at: ${envelope.evaluatedAt || "n/a"}. Newest lab date: ${envelope.newestLabDate || "n/a"}.`;
  if (envelope.status !== "current") {
    return `${header}
The app's threshold check has not run against the latest data, or is unavailable. Per CSC rule 4: treat flag status as unknown for every value discussed below. Do not state or imply that any value is unflagged, and direct concerns about a specific value to the patient's care team.`;
  }
  if (!envelope.flags.length) {
    return `${header}
No flags raised. Because envelope status is current, the absence of a flag is meaningful for any value discussed below, per CSC rule 4.`;
  }
  const lines = envelope.flags.map(f =>
    `- ${f.analyte}: ${f.value}${f.unit ? " " + f.unit : ""} on ${f.date || "unknown date"} — ${f.level.toUpperCase()} (${f.bound}, source: ${f.thresholdSource}). Guidance: ${f.guidance}`
  ).join("\n");
  return `${header}
${lines}`;
}

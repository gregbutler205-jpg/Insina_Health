// ── A-12: plausibility guard ──────────────────────────────────────────────────
// Catches obvious input errors (systolic of 1138, a lost decimal) at the door,
// deliberately separate from the tripwire (A-01): a typo needs a correction
// prompt, a real extreme value needs an urgent flag, and confusing the two
// harms in both directions (DEC-019). Deterministic, no AI involved.
import { VITAL_BOUNDS, LAB_BOUNDS, LAB_ALIASES } from "../config/plausibilityBounds.js";

function inRange(value, low, high) {
  return (low == null || value >= low) && (high == null || value <= high);
}

/**
 * Cheap correction heuristics for a hard-band value: divide/multiply by 10
 * (a lost or extra decimal place), and adjacent-digit transposition. Returns
 * only candidates that land back in the *soft* range (still real numbers,
 * not another impossible value) — the patient picks; nothing auto-corrects.
 */
function suggestCorrections(value, bounds) {
  const candidates = new Set();
  const add = (v) => { if (Number.isFinite(v) && inRange(v, bounds.softLow, bounds.softHigh)) candidates.add(Math.round(v * 100) / 100); };

  add(value / 10);
  add(value * 10);

  const str = String(value);
  for (let i = 0; i < str.length - 1; i++) {
    if (str[i] === "." || str[i + 1] === ".") continue;
    const chars = str.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    add(parseFloat(chars.join("")));
  }
  return Array.from(candidates);
}

/**
 * Evaluate one measurement against its bounds. Returns:
 *   { band: null } — no entry for this field, or value is plausible
 *   { band: "soft", label, unit } — implausible but possible; confirm-and-save
 *   { band: "hard", label, unit, suggestions: [...] } — blocks the save
 */
export function checkPlausibility(bounds, rawValue) {
  if (!bounds) return { band: null };
  const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue);
  if (!Number.isFinite(value)) return { band: null };

  if (!inRange(value, bounds.hardLow, bounds.hardHigh)) {
    return { band: "hard", label: bounds.label, unit: bounds.unit, suggestions: suggestCorrections(value, bounds) };
  }
  if (!inRange(value, bounds.softLow, bounds.softHigh)) {
    return { band: "soft", label: bounds.label, unit: bounds.unit };
  }
  return { band: null };
}

/** Check every populated field of a vital reading object against VITAL_BOUNDS. Returns a map of field -> result (only fields with a non-null band are included). */
export function checkVitalReading(reading) {
  const out = {};
  for (const field of Object.keys(VITAL_BOUNDS)) {
    if (reading[field] == null || reading[field] === "") continue;
    const result = checkPlausibility(VITAL_BOUNDS[field], reading[field]);
    if (result.band) out[field] = result;
  }
  return out;
}

/**
 * Cross-field checks, v1 list deliberately small (spec):
 * systolic > diastolic (soft — confirm, catches swapped fields);
 * SpO2 hard cap 100 is already covered by VITAL_BOUNDS.o2.hardHigh.
 */
export function checkVitalCrossFields(reading) {
  const issues = [];
  const s = reading.bp_s, d = reading.bp_d;
  if (s != null && d != null && s !== "" && d !== "" && parseFloat(s) <= parseFloat(d)) {
    issues.push({ fields: ["bp_s", "bp_d"], band: "soft", message: "Systolic isn't higher than diastolic: double-check these aren't swapped." });
  }
  return issues;
}

function canonicalizeLabName(name) {
  const key = (name || "").toLowerCase().trim();
  return LAB_ALIASES[key] || key;
}

/** Look up plausibility bounds for a lab by name (canonicalized the same way as tripwire.js). Returns null if this analyte has no configured bounds. */
export function labBoundsFor(name) {
  return LAB_BOUNDS[canonicalizeLabName(name)] || null;
}

/** Check one lab entry ({name, value}) against LAB_BOUNDS. Returns the same shape as checkPlausibility. */
export function checkLabReading(lab) {
  const bounds = labBoundsFor(lab.name);
  if (!bounds) return { band: null };
  return checkPlausibility(bounds, lab.value);
}

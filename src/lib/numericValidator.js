// ── Deterministic numeric validator — AI_SESSION_SPEC v0.3 Sec 4 step 3 ─────
// (DEC-C3, placeholder ID pending DEC tail merge.) Model proposes,
// rules dispose — same philosophy as the tripwire engine. The validator
// contains no disease vocabulary and no unit vocabulary: it knows a number
// appeared next to a unit from the maintained list (validatorUnits.js) and
// looks for its source among the supplied bound claims.
//
// ENGINE ONLY in this branch: pure and Node-testable, exercised by fixtures.
// It is NOT wired into the live generation path — that wiring belongs to the
// composition pipeline, which waits on corpus v1 and prompts v2.5.
//
// Resolution rules (DEC-C1):
//   · A detected (value, unit) matches only a supplied claim with the SAME
//     canonical unit and numerically equal value. Verbatim restatement only.
//   · Arithmetic restatement is unmatched BY CONSTRUCTION: unit conversion
//     ("2 g" from a 2000 mg claim), tablet counts, per-dose division, and
//     ceiling ranges all produce (value, unit) pairs absent from the claim
//     set, so they block without the engine doing any arithmetic of its own.
//   · Range expressions ("2-3 g", "2 to 3 g") yield one detection per
//     endpoint; every endpoint must resolve or the response blocks — a
//     permissive upper bound above the cited ceiling therefore blocks
//     (acceptance test 9).

import { UNITS, UNIT_LIST_VERSION } from "../config/validatorUnits.js";

export { UNIT_LIST_VERSION };

// Surface form → canonical unit, longest forms first so "degrees f" wins
// over a bare "f" (which is deliberately NOT a surface form — too noisy).
const FORM_TO_CANON = [];
for (const [canon, forms] of Object.entries(UNITS)) {
  for (const f of forms) FORM_TO_CANON.push([f.toLowerCase(), canon]);
}
FORM_TO_CANON.sort((a, b) => b[0].length - a[0].length);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UNIT_ALT = FORM_TO_CANON.map(([f]) => escapeRe(f)).join("|");

// number (+ optional range tail), then a listed unit form. Word boundary on
// the trailing edge except for symbol units (%, °F) which end non-word.
const NUM = "\\d+(?:\\.\\d+)?";
const RANGE = `(?:\\s*(?:-|–|–|to|or)\\s*(${NUM}))?`;
const DETECT_RE = new RegExp(
  `(${NUM})${RANGE}\\s*(${UNIT_ALT})(?![\\p{L}\\p{N}])`,
  "giu"
);

function canonOf(form) {
  const f = String(form || "").toLowerCase();
  const hit = FORM_TO_CANON.find(([surface]) => surface === f);
  return hit ? hit[1] : null;
}

/** Every (value, canonical unit) pair the text asserts, with source token. */
export function detectNumericTokens(text) {
  const out = [];
  const s = String(text ?? "");
  DETECT_RE.lastIndex = 0;
  let m;
  while ((m = DETECT_RE.exec(s)) !== null) {
    const [token, v1, v2, unitForm] = m;
    const unit = canonOf(unitForm);
    if (!unit) continue;
    out.push({ token: token.trim(), value: parseFloat(v1), unit, index: m.index });
    if (v2 != null) out.push({ token: token.trim(), value: parseFloat(v2), unit, index: m.index });
  }
  return out;
}

/** Normalize one supplied claim { value, unit } → { value:number, unit:canon }
 * or null when the unit isn't on the maintained list (such a claim can
 * license nothing). */
function normalizeClaim(c) {
  if (!c) return null;
  const unit = canonOf(c.unit) ?? (UNITS[String(c.unit || "").toLowerCase()] ? String(c.unit).toLowerCase() : null);
  const value = typeof c.value === "number" ? c.value : parseFloat(c.value);
  if (!unit || !Number.isFinite(value)) return null;
  return { value, unit };
}

/**
 * The blocking pass. `claims` is everything context supplied that may
 * license a number: cited corpus/handbook rows and reconciled-record facts,
 * CURRENT versions only (the caller enforces currency by what it supplies —
 * superseded stamps never reach this function, per the reopen context rule).
 *
 * Returns { ok, violations } — violations carry the offending token for the
 * failure log; the caller renders the non-alarming retry/gap message
 * ([CONFIRM] copy + retry policy, both open in the spec).
 */
export function validateNumerics(text, claims = []) {
  const licensed = claims.map(normalizeClaim).filter(Boolean);
  const violations = [];
  for (const det of detectNumericTokens(text)) {
    const hit = licensed.some(c => c.unit === det.unit && c.value === det.value);
    if (!hit) violations.push(det);
  }
  return { ok: violations.length === 0, violations };
}

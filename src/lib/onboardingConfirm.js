// ── Confirmed-item record writes (ONBOARDING_SPEC v1.1 §5.1, §5.3) ───────────
// The patient's explicit confirmation is the only write path (AI proposes,
// patient disposes). Every writer stamps source + addedAt per the UI-19
// convention and marks the staged item consumed. Deliberately does NOT
// dispatch tripwire evaluation events — §0: nothing in onboarding invokes
// the tripwire engine; it evaluates on the next boot as always.

import { getMedsFull, setMedsFull } from "../store.js";
import { setItemStatus, getDocument } from "./onboardingStaging.js";
import { evaluateAndFire, clearNkdaAssertion } from "./artifactEngine.js";
import { CONFIRMATION_MATRIX } from "../config/onboardingConfig.js";

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const readArr = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const writeArr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* locked/quota */ } };
let idSeq = Date.now();
const genId = () => idSeq++;

const SOURCE_LABEL = "Imported from document";

function sourceStamp(item) {
  const doc = item.docId ? getDocument(item.docId) : null;
  return {
    source: SOURCE_LABEL,
    addedAt: new Date().toISOString(),
    ...(doc?.documentsModuleId != null ? { refDocId: doc.documentsModuleId } : {}),
  };
}

/** Build the record object a staged item would write (also used by Compare). */
export function recordShapeFor(item, { statusOverride } = {}) {
  const f = item.fields || {};
  switch (item.category) {
    case "medication":
      return {
        id: genId(), name: cap(f.name), dose: f.dose || f.strength || "",
        strength: f.strength || "", frequency: f.frequency || "", route: f.route || "",
        prescriber: "", category: "Other",
        // §4.5: >24-month or undated documents default the med to Historical
        // (stored as the app's "inactive" status — excluded from the active
        // list and the Emergency Card); one tap in the editor flips it.
        status: statusOverride || (item.default_historical ? "inactive" : "active"),
        ...sourceStamp(item),
      };
    case "allergy":
      return { id: genId(), name: cap(f.substance), reaction: f.reaction || "", ...sourceStamp(item) };
    case "condition":
      return { id: genId(), name: cap(f.name), status: item.default_historical ? "resolved" : "active", since: f.onset_date || "", notes: "", ...sourceStamp(item) };
    case "care_team":
      return { id: genId(), name: f.name, role: f.specialty || "", specialty: f.specialty || "", phone: f.phone || "", credential: f.credential || "", ...sourceStamp(item) };
    case "lab":
      return { id: genId(), name: f.test, value: f.value, unit: f.unit || "", refRange: f.ref_low || f.ref_high ? `${f.ref_low || ""}-${f.ref_high || ""}` : "", date: f.collected_date || "", ...sourceStamp(item) };
    case "procedure":
      return { id: genId(), procedure: f.name, date: f.date || "", ...sourceStamp(item) };
    case "immunization":
      return { id: genId(), name: f.name, date: f.date || "", ...sourceStamp(item) };
    case "vital": {
      const reading = { id: genId(), date: f.date || "", ...sourceStamp(item) };
      const t = String(f.type || "").toLowerCase();
      const v = String(f.value || "");
      if (t.includes("blood pressure") || t === "bp") {
        const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
        if (m) { reading.bp_s = m[1]; reading.bp_d = m[2]; }
      } else if (t.includes("heart")) reading.hr = v;
      else if (t.includes("weight")) reading.weight = v;
      else if (t.includes("temp")) reading.temp = v;
      else if (t.includes("o2") || t.includes("oxygen")) reading.o2 = v;
      else if (t.includes("glucose")) reading.glucose = v;
      else reading.note = `${f.type}: ${v}`;
      return reading;
    }
    default:
      return null;
  }
}

const STORE_KEY = {
  allergy: "mi_allergies",
  condition: "mi_conditions",
  care_team: "mi_care_team",
  lab: "mi_labs",
  procedure: "mi_surgeries",
  immunization: "mi_immunizations",
  vital: "mi_readings",
};

// §5.2 C3 clinical-safety invariant (AUDIT_SEC_02 F-04): these categories must
// NEVER be written through a bulk path — each needs explicit per-item
// confirmation. Hard-coded here, deliberately independent of CONFIRMATION_MATRIX,
// so that a one-character config edit (e.g. flipping medication to bulk:true)
// cannot silently widen bulk-accept into a clinical-safety category. The two
// MUST stay in agreement; testOnboarding asserts PER_ITEM_ONLY === the matrix's
// perItem:true set, so any future change has to touch both under review.
const PER_ITEM_ONLY = new Set(["medication", "allergy", "condition"]);

/** True for a category that requires explicit per-item confirmation (never bulk). */
export function isPerItemOnly(category) {
  return PER_ITEM_ONLY.has(category);
}

/**
 * Accept: write the staged item into the record and mark it confirmed.
 * @param {object} item - staged item (from onboardingStaging)
 * @param {object} [opts] - {fieldsOverride, statusOverride} from the editor
 * @returns the written record entry (or null if unsupported)
 */
export function confirmItemToRecord(item, opts = {}) {
  // F-04 backstop: refuse a clinical-safety category committed via a bulk path.
  // bulkConfirmItems() (the only sanctioned bulk entry point) already filters
  // these out; this catches any other caller that passes {bulk:true}. A bare
  // single-item confirmation (no opts.bulk) is the per-item confirmation itself
  // and is allowed for every category.
  if (opts.bulk && PER_ITEM_ONLY.has(item.category)) {
    console.warn(`[onboardingConfirm] refused bulk write of "${item.category}": requires per-item confirmation (§5.2 C3).`);
    return null;
  }
  const effective = opts.fieldsOverride ? { ...item, fields: { ...item.fields, ...opts.fieldsOverride } } : item;
  const entry = recordShapeFor(effective, opts);
  if (!entry) return null;
  if (item.category === "medication") {
    setMedsFull([...getMedsFull(), entry]);
  } else {
    const key = STORE_KEY[item.category];
    writeArr(key, [...readArr(key), entry]);
  }
  setItemStatus(item.id, "confirmed");
  // §6 (C5): every confirmation re-evaluates the goal minimum; a confirmed
  // allergy also supersedes any earlier "no known allergies" assertion.
  if (item.category === "allergy") clearNkdaAssertion();
  evaluateAndFire();
  return entry;
}

/**
 * The ONLY sanctioned bulk-accept entry point (AUDIT_SEC_02 F-04). "Accept all
 * high-confidence" in the ReviewQueue routes through here instead of looping
 * confirmItemToRecord directly, so the C3 invariant lives in the write layer and
 * not just in which button the UI chooses to render. Any PER_ITEM_ONLY category
 * is refused here regardless of caller or config; everything else is committed.
 * @param {object[]} items - staged items to bulk-accept
 * @returns {{ committed: object[], refused: object[] }}
 */
export function bulkConfirmItems(items = []) {
  const committed = [];
  const refused = [];
  for (const item of items) {
    if (PER_ITEM_ONLY.has(item.category)) {
      refused.push(item);
      console.warn(`[onboardingConfirm] refused bulk-accept of "${item.category}": requires per-item confirmation (§5.2 C3).`);
      continue;
    }
    const entry = confirmItemToRecord(item, { bulk: true });
    if (entry) committed.push(entry);
  }
  return { committed, refused };
}

// ── §5.3 Compare-view resolutions ─────────────────────────────────────────────

/** Keep current: the record entry stands; the staged item is rejected (soft, recoverable). */
export function resolveKeepCurrent(item) {
  setItemStatus(item.id, "rejected");
}

/** Replace with new: staged fields overwrite the existing record entry (identity kept). */
export function resolveReplaceWithNew(item, existing) {
  const fresh = recordShapeFor(item);
  patchRecordEntry(item.category, existing.id, { ...fresh, id: existing.id });
  setItemStatus(item.id, "confirmed");
  evaluateAndFire();
}

/** Keep both: staged writes as new; BOTH entries flagged for review (§7 task feeds on this). */
export function resolveKeepBoth(item, existing) {
  const entry = confirmItemToRecord(item);
  if (entry) patchRecordEntry(item.category, entry.id, { reviewFlag: "kept-both-duplicate" });
  patchRecordEntry(item.category, existing.id, { reviewFlag: "kept-both-duplicate" });
}

/** Merge: field-level picks ("staged" | "current" per field) applied onto the existing entry. */
export function resolveMerge(item, existing, picks) {
  const fresh = recordShapeFor(item);
  const patch = {};
  Object.entries(picks).forEach(([field, side]) => {
    if (side === "staged" && field in fresh) patch[field] = fresh[field];
  });
  patchRecordEntry(item.category, existing.id, patch);
  setItemStatus(item.id, "confirmed");
  evaluateAndFire();
}

function patchRecordEntry(category, id, patch) {
  if (category === "medication") {
    setMedsFull(getMedsFull().map(m => m.id === id ? { ...m, ...patch } : m));
    return;
  }
  const key = STORE_KEY[category];
  writeArr(key, readArr(key).map(e => e.id === id ? { ...e, ...patch } : e));
}

/** Existing record entries for §5.3 matching, per staged category. */
export function recordEntriesFor(category) {
  if (category === "medication") return getMedsFull();
  if (category === "condition") return readArr("mi_conditions");
  if (category === "lab") return readArr("mi_labs");
  return [];
}

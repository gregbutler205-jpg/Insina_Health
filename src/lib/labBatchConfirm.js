// ── Lab batch confirmation — data layer (WO_LAB_BATCH_CONFIRM_01 / DEC-P43) ─
// The confirmation unit for laboratory and vitals rows is the source DOCUMENT
// (batch), not the individual analyte — with row-level review, exclusion,
// correction, and forced acknowledgment of flagged rows. Medications and
// allergies remain per-item and are untouched by this module.
//
// Invariant this layer enforces: no lab/vital row reaches the reconciled
// record (mi_labs) without a ConfirmationEvent referencing it. Exclusion is
// not deletion — excluded rows persist in the archive store and re-enter the
// same review flow later.
//
// Stores (both plain mi_* arrays: encrypted at rest by P-02, carried in
// Drive/folder backups, merged by the union + newer-edit-wins rules —
// documents carry `id` + `updatedAt` for DEC-046 stamping):
//   mi_lab_archive        — [{ id, title, fileName, importedAt, updatedAt,
//                              rows: [ArchiveRow] }]
//   mi_confirmation_events— [{ id, docId, timestamp, promotedRowIds,
//                              excludedRowIds, acknowledgedRowIds }]
//
// ArchiveRow: { id, name, value, unit, refRange, date, category, notes,
//   state: "pending"|"excluded"|"promoted",
//   confidence?,            // optional number from extraction; absent = normal
//   page?,                  // page reference when extraction provides one (it
//                           // currently doesn't — stored null; see WO report)
//   flags: [],              // "out_of_range" | "low_confidence" | "monitored_analyte"
//   correction?,            // { originalValue, originalUnit, originalDate, correctedAt }
//   provenance? }           // { docId, page, extractedAt, confirmationEventId } — set at promotion
//
// Read-time migration: any stored row missing `state` is treated as
// "pending" (the acceptance criterion for pre-existing data), so schema
// evolution never errors on old stored rows.

import { canonicalLabId } from "./labCanonical.js";
import { MONITORED_ANALYTES } from "../config/monitoredAnalytes.js";
import { tombstoneRecord } from "./recordTombstones.js";

export const LAB_ARCHIVE_KEY = "mi_lab_archive";
export const CONFIRMATION_EVENTS_KEY = "mi_confirmation_events";

// Confidence below this is "low confidence" (row initializes excluded; its
// inclusion is an explicit patient action). The current extraction pipeline
// emits no confidence scores — absent means normal confidence per the WO.
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

const ROW_STATES = new Set(["pending", "excluded", "promoted"]);

// ── Storage (defensive, matching house loader conventions) ───────────────────

function safeArray(key) {
  try { const r = localStorage.getItem(key); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; }
  catch { return []; }
}

/** Read-time migration: default missing/invalid row state to "pending". */
function normalizeDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  return {
    ...doc,
    rows: Array.isArray(doc.rows)
      ? doc.rows.map(r => ({ ...r, state: ROW_STATES.has(r?.state) ? r.state : "pending", flags: Array.isArray(r?.flags) ? r.flags : [] }))
      : [],
  };
}

export function readArchive() {
  return safeArray(LAB_ARCHIVE_KEY).map(normalizeDoc).filter(Boolean);
}
export function writeArchive(docs) {
  localStorage.setItem(LAB_ARCHIVE_KEY, JSON.stringify(docs));
}
export function readConfirmationEvents() {
  return safeArray(CONFIRMATION_EVENTS_KEY);
}
function appendConfirmationEvent(event) {
  localStorage.setItem(CONFIRMATION_EVENTS_KEY, JSON.stringify([...readConfirmationEvents(), event]));
}

/** Insert or replace a document by id, stamping updatedAt (DEC-046 opt-in). */
export function upsertArchiveDoc(doc) {
  const stamped = { ...doc, updatedAt: Date.now() };
  const docs = readArchive();
  const next = docs.some(d => d.id === stamped.id)
    ? docs.map(d => (d.id === stamped.id ? stamped : d))
    : [...docs, stamped];
  writeArchive(next);
  return stamped;
}

/** Documents with anything left to review: pending rows, or excluded rows that can be promoted later. */
/**
 * v1.54.1 self-healer: the archive is the authoritative record of what was
 * confirmed — every promoted row carries its ConfirmationEvent and id. If a
 * promoted row is missing from mi_labs (a stale-state full-array write from
 * another screen erased imported rows — the bug that ate Greg's three lab
 * documents), rebuild it exactly as confirmDoc promoted it (corrected values
 * included; applyCorrection wrote them into the row, originals preserved in
 * row.correction) and put it back. Idempotent: matches by archiveRowId, so
 * restored rows are never duplicated. Returns how many rows were restored.
 */
export function reconcilePromotedRows() {
  const docs = readArchive();
  let labs;
  try { labs = JSON.parse(localStorage.getItem("mi_labs") || "[]"); } catch { labs = []; }
  if (!Array.isArray(labs)) labs = [];
  const have = new Set(labs.map(l => l.archiveRowId).filter(Boolean));
  // v1.55.0: equivalence guard — never restore a row when an EQUIVALENT one
  // (same canonical analyte, date, value, unit) is already in the record.
  // Without this, deleting an exact duplicate would tug-of-war with the
  // healer forever: the duplicate's archive row stays promoted, so it would
  // be "restored" on every visit.
  const equivalent = new Set(labs.map(labEquivalenceKey));

  const restored = [];
  const now = Date.now();
  for (const doc of docs) {
    for (const r of doc.rows || []) {
      if (r.state !== "promoted" || have.has(r.id)) continue;
      if (equivalent.has(labEquivalenceKey(r))) { have.add(r.id); continue; }
      restored.push({
        id: now + restored.length,
        name: r.name,
        value: Number.isFinite(parseFloat(r.value)) ? parseFloat(r.value) : r.value,
        unit: r.unit,
        refRange: r.refRange,
        date: r.date,
        facility: r.facility || "",
        category: r.category,
        flag: Array.isArray(r.flags) && r.flags.includes("out_of_range"),
        notes: r.notes,
        confirmationEventId: r.provenance?.confirmationEventId ?? null,
        archiveRowId: r.id,
      });
      have.add(r.id);
      equivalent.add(labEquivalenceKey(r)); // two identical promoted rows restore once, not twice
    }
  }
  if (restored.length > 0) {
    const updated = [...restored, ...labs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    localStorage.setItem("mi_labs", JSON.stringify(updated));
  }
  return restored.length;
}

// ── v1.55.0: exact-duplicate cleanup (Greg: repeated re-uploads of the same
// documents stacked identical rows). Two rows are EXACT duplicates when the
// canonical analyte, collection date, numeric value, and unit all match —
// alias-aware, so "PSA" and "Prostate Specific Antigen" on the same date
// with the same value are one result. Near-matches (different value or
// date) are NEVER touched: that's the patient-confirmed Group Tests flow.

/** Equivalence key for exact-duplicate detection and the healer's guard. */
export function labEquivalenceKey(row) {
  const v = parseFloat(row?.value);
  return [
    canonicalLabId(row?.name),
    row?.date || "",
    Number.isFinite(v) ? String(v) : String(row?.value ?? ""),
    (row?.unit || "").toLowerCase().trim(),
  ].join("|");
}

/** Count how many rows a cleanup would remove (for the UI badge). */
export function countExactDuplicateLabs(labs) {
  const seen = new Set();
  let removable = 0;
  for (const l of labs || []) {
    const k = labEquivalenceKey(l);
    if (seen.has(k)) removable++; else seen.add(k);
  }
  return removable;
}

/**
 * Remove exact duplicates from mi_labs, keeping ONE row per equivalence
 * group — preferring a row with import provenance (archiveRowId), then the
 * oldest id. Removed rows are tombstoned so no Drive merge resurrects them
 * from another device. Returns how many rows were removed.
 */
export function removeDuplicateLabRows() {
  let labs;
  try { labs = JSON.parse(localStorage.getItem("mi_labs") || "[]"); } catch { labs = []; }
  if (!Array.isArray(labs) || labs.length === 0) return 0;

  const groups = new Map();
  for (const l of labs) {
    const k = labEquivalenceKey(l);
    (groups.get(k) || groups.set(k, []).get(k)).push(l);
  }

  const removed = [];
  const keep = new Set();
  for (const rows of groups.values()) {
    if (rows.length === 1) { keep.add(rows[0]); continue; }
    const sorted = [...rows].sort((a, b) =>
      (a.archiveRowId ? 0 : 1) - (b.archiveRowId ? 0 : 1) || (a.id ?? 0) - (b.id ?? 0));
    keep.add(sorted[0]);
    removed.push(...sorted.slice(1));
  }
  if (removed.length === 0) return 0;

  for (const r of removed) tombstoneRecord("mi_labs", r);
  localStorage.setItem("mi_labs", JSON.stringify(labs.filter(l => keep.has(l))));
  return removed.length;
}

export function reviewableArchiveDocs() {
  return readArchive().filter(d => d.rows.some(r => r.state === "pending" || r.state === "excluded"));
}

// ── Row flags ────────────────────────────────────────────────────────────────

/**
 * Parse a reference range string into {lo, hi} (either may be null).
 * Handles "0.7-1.3", "0.7 – 1.3", "<5", "≤5", ">10", "≥10". Returns null for
 * anything it cannot read — flagging then falls back to the extraction's own
 * H/L marker rather than guessing.
 */
export function parseRefRange(refRange) {
  const s = String(refRange || "").trim();
  if (!s) return null;
  const num = "([0-9]*\\.?[0-9]+)";
  let m = new RegExp(`^${num}\\s*[-––]\\s*${num}$`).exec(s);
  if (m) return { lo: parseFloat(m[1]), hi: parseFloat(m[2]) };
  m = new RegExp(`^[<≤]\\s*${num}$`).exec(s);
  if (m) return { lo: null, hi: parseFloat(m[1]) };
  m = new RegExp(`^[>≥]\\s*${num}$`).exec(s);
  if (m) return { lo: parseFloat(m[1]), hi: null };
  return null;
}

/**
 * Flags for one extracted row. Deterministic; no clinical judgment beyond the
 * extracted reference range, the extraction's own flag, and the monitored
 * analyte list (single config constant).
 */
export function computeRowFlags(row) {
  const flags = [];
  const range = parseRefRange(row.refRange);
  const value = parseFloat(row.value);
  // A parseable range + numeric value is authoritative (so a patient
  // correction into range clears the flag honestly); the extraction's own
  // H/L marker is the fallback when the range can't be evaluated.
  const rangeEvaluable = range && Number.isFinite(value);
  const outOfRange = rangeEvaluable
    ? ((range.lo != null && value < range.lo) || (range.hi != null && value > range.hi))
    : row.flag === true;
  if (outOfRange) flags.push("out_of_range");
  if (typeof row.confidence === "number" && row.confidence < LOW_CONFIDENCE_THRESHOLD) flags.push("low_confidence");
  if (MONITORED_ANALYTES.includes(canonicalLabId(row.name))) flags.push("monitored_analyte");
  return flags;
}

// ── Document creation from extraction output ─────────────────────────────────

let _seq = 0;
const genId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Build an archive document from the extraction pipeline's row output
 * (consumed as-is — this layer never re-extracts or auto-corrects).
 * Low-confidence rows initialize EXCLUDED (their inclusion is an explicit
 * patient action); everything else initializes pending.
 */
export function createArchiveDoc({ title, fileName, rows }) {
  const extractedAt = new Date().toISOString();
  return {
    id: genId("labdoc"),
    title: title || fileName || "Lab Report",
    fileName: fileName || "",
    importedAt: extractedAt,
    rows: (rows || []).map(r => {
      const flags = computeRowFlags(r);
      return {
        id: genId("labrow"),
        name: r.name || "",
        value: r.value ?? "",
        unit: r.unit || "",
        refRange: r.refRange || "",
        date: r.date || "",
        category: r.category || "Other",
        notes: r.notes || "",
        facility: r.facility || "",
        confidence: typeof r.confidence === "number" ? r.confidence : undefined,
        page: r.page ?? null,
        extractedAt,
        flags,
        state: flags.includes("low_confidence") ? "excluded" : "pending",
      };
    }),
  };
}

// ── Corrections (patient actions; originals never overwritten) ───────────────

/**
 * Apply a patient edit to value/unit/date. The FIRST correction captures the
 * original extracted values; later edits update the current values but never
 * touch the preserved originals. Flags are recomputed against the corrected
 * value so acknowledgment always reflects what will actually be promoted
 * (monitored/low-confidence flags are unaffected by value edits).
 */
export function applyCorrection(row, { value, unit, date }) {
  const correction = row.correction || {
    originalValue: row.value,
    originalUnit: row.unit,
    originalDate: row.date,
  };
  const next = {
    ...row,
    value: value ?? row.value,
    unit: unit ?? row.unit,
    date: date ?? row.date,
    correction: { ...correction, correctedAt: new Date().toISOString() },
  };
  // Recompute flags against the corrected value; confidence and analyte
  // identity are unchanged by an edit, so their flags carry through naturally.
  return { ...next, flags: computeRowFlags(next) };
}

/** Toggle a row between pending and excluded (promotion happens only via confirmDoc). */
export function setRowIncluded(row, included) {
  if (row.state === "promoted") return row;
  return { ...row, state: included ? "pending" : "excluded" };
}

// ── Confirmation gate + event ────────────────────────────────────────────────

/**
 * Gate math for the confirm control. `acknowledgedIds` is the set of row ids
 * whose flag-acknowledgment checkbox is checked. The confirm control must
 * stay disabled while ANY included flagged row is unacknowledged.
 */
export function confirmGate(doc, acknowledgedIds = new Set()) {
  const reviewable = doc.rows.filter(r => r.state !== "promoted");
  const included = reviewable.filter(r => r.state === "pending");
  const excluded = reviewable.filter(r => r.state === "excluded");
  const flaggedIncluded = included.filter(r => r.flags.length > 0);
  const unacknowledged = flaggedIncluded.filter(r => !acknowledgedIds.has(r.id));
  return {
    included,
    excluded,
    flaggedIncluded,
    unacknowledged,
    canConfirm: reviewable.length > 0 && unacknowledged.length === 0,
    summary: { promoteCount: included.length, excludeCount: excluded.length },
  };
}

/**
 * Confirm the batch: stamp provenance + confirmationEventId on every promoted
 * row, keep exclusions, write the ConfirmationEvent, and return the promoted
 * rows in the reconciled-record (mi_labs) shape — corrected values applied,
 * original extracted values retained on the archive row's correction object.
 * Throws if called while the gate is closed (UI must prevent this; the throw
 * is the invariant's last line of defense).
 */
export function confirmDoc(doc, acknowledgedIds = new Set()) {
  const gate = confirmGate(doc, acknowledgedIds);
  if (!gate.canConfirm) throw new Error("confirmDoc called while the gate is closed");

  const event = {
    id: genId("confirm"),
    docId: doc.id,
    timestamp: new Date().toISOString(),
    promotedRowIds: gate.included.map(r => r.id),
    excludedRowIds: gate.excluded.map(r => r.id),
    acknowledgedRowIds: gate.flaggedIncluded.map(r => r.id),
  };

  const rows = doc.rows.map(r => {
    if (r.state !== "pending") return r;
    return {
      ...r,
      state: "promoted",
      provenance: { docId: doc.id, page: r.page ?? null, extractedAt: r.extractedAt, confirmationEventId: event.id },
    };
  });

  // Reconciled-record rows: the exact shape Tab12 has always written to
  // mi_labs, plus additive traceability fields (read paths unchanged).
  const now = Date.now();
  const promotedLabRows = gate.included.map((r, i) => ({
    id: now + i,
    name: r.name,
    value: Number.isFinite(parseFloat(r.value)) ? parseFloat(r.value) : r.value,
    unit: r.unit,
    refRange: r.refRange,
    date: r.date,
    facility: r.facility || "",
    category: r.category,
    flag: r.flags.includes("out_of_range"),
    notes: r.notes,
    confirmationEventId: event.id,
    archiveRowId: r.id,
  }));

  return { doc: { ...doc, rows }, event, promotedLabRows };
}

/**
 * Persist one confirmed batch: archive doc (stamped), ConfirmationEvent, and
 * the promoted rows into mi_labs (newest-first, the reconciled store's
 * existing convention). Returns the stamped doc.
 */
export function persistConfirmation({ doc, event, promotedLabRows }) {
  const stamped = upsertArchiveDoc(doc);
  appendConfirmationEvent(event);
  if (promotedLabRows.length > 0) {
    let labs;
    try { labs = JSON.parse(localStorage.getItem("mi_labs") || "[]"); } catch { labs = []; }
    if (!Array.isArray(labs)) labs = [];
    const updated = [...promotedLabRows, ...labs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    localStorage.setItem("mi_labs", JSON.stringify(updated));
  }
  return stamped;
}

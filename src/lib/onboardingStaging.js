// ── Onboarding staging queue store (ONBOARDING_SPEC v1.1 §4.5, §5.1) ─────────
// The ONLY bridge between extraction and the record. Extraction output is
// staged here; nothing reaches the record without explicit patient action
// (WP3 builds the review UI over this store). Rejected items are soft-deleted
// and retained 30 days for undo, then purged (§5.1).

import { STALE_WARN_MONTHS, STALE_HISTORICAL_MONTHS, REJECT_RETENTION_DAYS } from "../config/onboardingConfig.js";
import { saveState, loadState } from "./onboardingState.js";
import { evaluateAndFire } from "./advisoryRuntime.js";
import { canonicalLabId } from "./labCanonical.js";

const KEY = "mi_onboarding_staged";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, documents: [], items: [] };
    const s = JSON.parse(raw);
    return s && typeof s === "object" ? { version: 1, documents: [], items: [], ...s } : { version: 1, documents: [], items: [] };
  } catch { return { version: 1, documents: [], items: [] }; }
}

function persist(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* locked/quota */ }
  syncStagedCounts(store);
  return store;
}

/** Mirror live per-category staged counts into onboarding_state (§2 shape). */
function syncStagedCounts(store = load()) {
  const counts = {};
  store.items.filter(i => i.status === "staged" || i.status === "deferred").forEach(i => {
    const k = i.category === "medication" ? "medications"
      : i.category === "allergy" ? "allergies"
      : i.category === "condition" ? "conditions"
      : i.category === "care_team" ? "care_team"
      : `${i.category}s`;
    counts[k] = (counts[k] || 0) + 1;
  });
  if (loadState()) saveState({ staged_counts: counts });
  return counts;
}

let nextId = Date.now();
function genId() { return `st_${(nextId++).toString(36)}`; }

// ── §4.5 Document staleness rule (deterministic, unit-tested) ────────────────
// Applies to medications and conditions only. Driven by the named constants.
// Day-aware: "> 24 months" flips the moment the document is even one day
// older than 24 calendar months, not at the next whole-month boundary.
function monthsAgo(now, months) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** §9.4 badge (exact copy for dated documents; undated wording per Greg's WP2 review). */
export function stalenessBadge(docDateIso) {
  if (!docDateIso) return "No date. Confirm this is still current.";
  const d = new Date(docDateIso + "T12:00:00");
  const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return `From a document dated ${label} — confirm this is still current.`;
}

/**
 * @returns {{level: "fresh"|"warn"|"historical", badge: string|null, defaultHistorical: boolean}}
 */
export function stalenessFor(docDateIso, now = new Date()) {
  if (!docDateIso) return { level: "historical", badge: stalenessBadge(null), defaultHistorical: true };
  const d = new Date(docDateIso + (docDateIso.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d)) return { level: "historical", badge: stalenessBadge(null), defaultHistorical: true };
  if (d >= monthsAgo(now, STALE_WARN_MONTHS)) return { level: "fresh", badge: null, defaultHistorical: false };
  if (d >= monthsAgo(now, STALE_HISTORICAL_MONTHS)) return { level: "warn", badge: stalenessBadge(docDateIso), defaultHistorical: false };
  return { level: "historical", badge: stalenessBadge(docDateIso), defaultHistorical: true };
}

// ── Staging operations ────────────────────────────────────────────────────────

/**
 * Stage a §4.1 extraction result. Every item lands as status "staged";
 * staleness is computed per document at staging time for meds/conditions.
 * @param {object} result - §4.1 {documents:[{source_name, doc_date, items:[...]}]}
 * @param {object[]} [docLinks] - parallel array: {documentsModuleId} linking each
 *   result document to its Documents-module source entry (provenance, §4.3).
 */
export function stageExtractionResult(result, docLinks = [], now = new Date()) {
  const store = load();
  const stagedDocIds = [];
  (result.documents || []).forEach((doc, di) => {
    const docId = genId();
    stagedDocIds.push(docId);
    store.documents.push({
      id: docId,
      source_name: doc.source_name || "Document",
      doc_date: doc.doc_date || null,
      doc_date_confidence: doc.doc_date_confidence ?? null,
      documentsModuleId: docLinks[di]?.documentsModuleId ?? null,
      staged_at: now.toISOString(),
    });
    (doc.items || []).forEach(item => {
      const stale = (item.category === "medication" || item.category === "condition")
        ? stalenessFor(doc.doc_date || null, now)
        : { level: "fresh", badge: null, defaultHistorical: false };
      // §2 tripwire advisory: evaluate each extracted lab BEFORE per-item
      // confirmation. Flag-gated — evaluateAndFire returns null while
      // TRIPWIRE_ADVISORY_ENABLED is false. A recent critical fires the takeover;
      // one older than 14 days comes back takeover:false, which surfaces as the
      // "historical critical value" badge on the review row (ReviewQueue).
      let advisory_hit = null;
      if (item.category === "lab") {
        try {
          const f = item.fields || {};
          advisory_hit = evaluateAndFire(canonicalLabId(f.name), f.value, {
            source: "staged",
            resultDate: doc.doc_date || f.date || null,
            readingId: item.id ?? null, // DEC-043 item 2: audit ties back to the staged item
            now: now.getTime(),
          });
        } catch { advisory_hit = null; }
      }
      store.items.push({
        id: genId(),
        docId,
        category: item.category,
        fields: { ...item.fields },
        confidence: item.confidence ?? 0,
        source_page: item.source_page ?? null,
        source_region: item.source_region ?? null,
        staleness: stale.level,
        staleness_badge: stale.badge,
        default_historical: stale.defaultHistorical,
        advisory_hit, // null | { tier, takeover, withinWindow, ... }
        status: "staged", // staged | deferred | rejected | confirmed
        status_changed_at: now.toISOString(),
      });
    });
  });
  persist(store);
  return { docIds: stagedDocIds, itemCount: (result.documents || []).reduce((n, d) => n + (d.items?.length || 0), 0) };
}

export function getStagedStore() { return load(); }
export function getItems(filter = {}) {
  return load().items.filter(i =>
    (filter.category ? i.category === filter.category : true) &&
    (filter.status ? i.status === filter.status : true)
  );
}
export function getDocument(docId) { return load().documents.find(d => d.id === docId) || null; }

export function updateItem(id, patch, now = new Date()) {
  const store = load();
  const item = store.items.find(i => i.id === id);
  if (!item) return null;
  Object.assign(item, patch, { status_changed_at: now.toISOString() });
  persist(store);
  return item;
}

export function setItemStatus(id, status, now = new Date()) {
  return updateItem(id, status === "rejected" ? { status, rejected_at: now.toISOString() } : { status }, now);
}

/** §5.1: purge rejected items older than the retention window. */
export function purgeExpiredRejects(now = new Date()) {
  const store = load();
  const cutoff = now.getTime() - REJECT_RETENTION_DAYS * 86400000;
  const before = store.items.length;
  store.items = store.items.filter(i => !(i.status === "rejected" && i.rejected_at && new Date(i.rejected_at).getTime() < cutoff));
  if (store.items.length !== before) persist(store);
  return before - store.items.length;
}

export function stagedCounts() { return syncStagedCounts(); }

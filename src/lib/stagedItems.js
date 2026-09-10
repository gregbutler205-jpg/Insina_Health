// Staged items (HISTORY_BUILDER_SPEC section 7; DEC-P53).
// ONE staging store. The History Builder's proposals live in the onboarding
// staging queue (mi_onboarding_staged, src/lib/onboardingStaging.js) as items
// carrying an `hb` marker, so the Review Queue, the dashboard's review card,
// and the builder's own list read one list, and acceptance runs through the
// one confirmed-item write path (onboardingConfirm.confirmItemToRecord). This
// is disposition 3 of the merge (Greg, 2026-09-10): no second store, no
// second write path. Every item is confirmed one by one by the patient; no
// batch accept, no auto accept, no silent merge.
//
// The builder-facing shape is unchanged: { id, source, sourceDocId, type,
// payload, status: 'proposed' | 'accepted' | 'rejected', createdAt, resolvedAt }.
import { getItems, addManualItem, setItemStatus } from "./onboardingStaging.js";
import { confirmItemToRecord } from "./onboardingConfirm.js";

const CATEGORY_FOR_TYPE = { medication: "medication", condition: "condition", provider: "care_team", lab: "lab", surgery: "procedure", event: "record" };
const STATUS_OUT = { staged: "proposed", deferred: "proposed", confirmed: "accepted", rejected: "rejected" };

/** Map a builder payload onto the staging queue's per-category field names. */
function fieldsFor(type, p = {}) {
  switch (type) {
    case "medication": return { name: p.name, dose: p.dose, strength: p.strength, frequency: p.frequency, route: p.route };
    case "condition":  return { name: p.name, onset_date: p.since || p.onset_date, notes: p.notes, medication: p.medication };
    case "provider":   return { name: p.name, specialty: p.specialty || p.role, phone: p.phone, credential: p.credential };
    case "lab":        return { test: p.name || p.test, value: p.value, unit: p.unit, ref_low: p.ref_low, ref_high: p.ref_high, collected_date: p.date || p.collected_date };
    case "surgery":    return { name: p.procedure || p.name, date: p.date };
    case "event":      return { title: p.title || p.name, type: p.type, date: p.date, facility: p.facility, notes: p.notes };
    default:           return { ...p };
  }
}

const view = (i) => ({
  id: i.id,
  source: i.hb?.source,
  sourceDocId: i.hb?.sourceDocId ?? null,
  type: i.hb?.type,
  payload: i.hb?.payload || {},
  status: STATUS_OUT[i.status] || i.status,
  createdAt: i.hb?.createdAt || null,
  resolvedAt: i.status === "staged" || i.status === "deferred" ? null : (i.status_changed_at || null),
});
const hbItems = () => getItems().filter(i => i && i.hb);
const open = (i) => i.status === "staged" || i.status === "deferred";

export function listStagedItems(status = "proposed") {
  return hbItems().map(view).filter(v => (status ? v.status === status : true));
}

export function addStagedItem({ source, sourceDocId = null, type, payload }) {
  const item = addManualItem({
    category: CATEGORY_FOR_TYPE[type] || type,
    fields: fieldsFor(type, payload),
    hb: { source, sourceDocId, type, payload, createdAt: new Date().toISOString() },
  });
  return view(item);
}

/** Per-item accept: the same confirmed-item write path the onboarding review
 *  uses (source stamp, status confirmed, goal-minimum re-evaluation). */
export function acceptStagedItem(id) {
  const item = hbItems().find(i => i.id === id && open(i));
  if (!item) return null;
  const record = confirmItemToRecord(item);
  if (record) { try { window.dispatchEvent(new Event("mi-data-synced")); } catch { /* non-DOM */ } }
  return record;
}

export function rejectStagedItem(id) {
  const item = hbItems().find(i => i.id === id && open(i));
  if (!item) return null;
  const updated = setItemStatus(id, "rejected");
  return updated ? view(updated) : null;
}

// ── med-to-condition lookup (spec section 8) ────────────────────────────────
// Deterministic, confirm-only, at most one proposal per session start.
// Rejected matches are never re-proposed: a rejected staged item with the
// same medication key is a permanent veto.

const medKey = (name) => String(name || "").toLowerCase();

export function evaluateMedConditionMap(meds, conditions, mappings, stagedItems = listStagedItems(null)) {
  const condNames = new Set((conditions || []).map(c => String(c?.name || "").toLowerCase()));
  for (const map of mappings || []) {
    const med = (meds || []).find(m =>
      m && m.status !== "inactive" && m.status !== "discontinued" &&
      medKey(m.name).includes(map.medication));
    if (!med) continue;
    if (condNames.has(map.condition.toLowerCase())) continue;
    const prior = stagedItems.find(i =>
      i.source === "lookup" &&
      medKey(i.payload?.medication).includes(map.medication) &&
      (i.status === "rejected" || i.status === "accepted" || i.status === "proposed"));
    if (prior) continue;
    return { medication: med.name, condition: map.condition, mapMedication: map.medication };
  }
  return null;
}

/** Session-start hook: surface at most one C-11 prompt. Returns the proposal
 *  as a staged item (source 'lookup') or null. */
export function proposeMedConditionMatch(meds, conditions, mappings) {
  const match = evaluateMedConditionMap(meds, conditions, mappings);
  if (!match) return null;
  return addStagedItem({
    source: "lookup",
    type: "condition",
    payload: { medication: match.medication, name: match.condition, status: "active", notes: "Added from medication lookup, confirmed by patient." },
  });
}

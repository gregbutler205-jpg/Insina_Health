// Staged items store (HISTORY_BUILDER_SPEC section 7, DEC-P45 pending merge).
// The only bridge into the reconciled record from the History Builder: every
// item is confirmed one by one by the patient. No batch accept, no auto
// accept, no silent merge. Coexists with the onboarding flow's own staging
// queue (mi_onboarding_staged), which keeps serving the onboarding import
// review; unification is logged as an open item in the session report.

import { STAGED_KEY } from "./historyBuilder.js";

function load() {
  try {
    const raw = localStorage.getItem(STAGED_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function persist(items) {
  try { localStorage.setItem(STAGED_KEY, JSON.stringify(items)); } catch { /* locked or quota */ }
  return items;
}

let seq = 0;
const genId = () => `sg_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function listStagedItems(status = "proposed") {
  return load().filter(i => (status ? i.status === status : true));
}

export function addStagedItem({ source, sourceDocId = null, type, payload }) {
  const item = { id: genId(), source, sourceDocId, type, payload, status: "proposed", createdAt: new Date().toISOString(), resolvedAt: null };
  persist([...load(), item]);
  return item;
}

/** The per-type write-through to the EXISTING store APIs. Additive appends
 *  only; per-item, called from an explicit patient Add action. */
const STORE_FOR_TYPE = {
  medication: "mi_meds_full",
  condition: "mi_conditions",
  provider: "mi_care_team",
  lab: "mi_labs",
  surgery: "mi_surgeries",
  event: "mi_records",
};

export function acceptStagedItem(id) {
  const items = load();
  const item = items.find(i => i.id === id && i.status === "proposed");
  if (!item) return null;
  const key = STORE_FOR_TYPE[item.type];
  if (!key) return null;
  let store;
  try { store = JSON.parse(localStorage.getItem(key) || "[]"); } catch { store = []; }
  if (!Array.isArray(store)) store = [];
  const record = { id: `hb_${item.id}`, ...item.payload };
  store.unshift(record);
  try { localStorage.setItem(key, JSON.stringify(store)); } catch { /* locked or quota */ }
  item.status = "accepted";
  item.resolvedAt = new Date().toISOString();
  persist(items);
  try { window.dispatchEvent(new Event("mi-data-synced")); } catch { /* non-DOM */ }
  return record;
}

export function rejectStagedItem(id) {
  const items = load();
  const item = items.find(i => i.id === id && i.status === "proposed");
  if (!item) return null;
  item.status = "rejected";
  item.resolvedAt = new Date().toISOString();
  persist(items);
  return item;
}

// ── med-to-condition lookup (spec section 8) ────────────────────────────────
// Deterministic, confirm-only, at most one proposal per session start.
// Rejected matches are never re-proposed: a rejected staged item with the
// same medication key is a permanent veto.

const medKey = (name) => String(name || "").toLowerCase();

export function evaluateMedConditionMap(meds, conditions, mappings, stagedItems = load()) {
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

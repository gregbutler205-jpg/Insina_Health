// In-memory AI scope handoff (DEC-P50, WO_AI_LAUNCHER_01 Sec 5).
// A launcher writes a scope object here and navigates to AI Analysis, which
// takes it on mount. Module memory only: never the URL, hash, query string,
// or any persisted store, so a reload always opens AI Analysis in its
// default full-record state and nothing can resurrect through a Drive merge.
//
// AIScope = {
//   source: 'nav' | 'dashboard' | 'labs_panel' | 'medications' | 'appointment' | 'symptom',
//   items: [{ kind: 'full_record' | 'panel' | 'med_list' | 'appointment' | 'symptom_entry',
//             id?: string, label: string, date?: string }],
//   question?: string   // dashboard question launchers only (DEC-P50 as amended)
// }

import { DEFAULT_READS_LEVEL, READS_LEVELS, normalizeReadsLevel } from "./readsLevel.js";

let _pending = null;

export const FULL_RECORD_ITEM = Object.freeze({ kind: "full_record", label: "Full record" });

export function setAIScope(scope) {
  if (!scope || typeof scope !== "object") { _pending = null; return; }
  _pending = {
    source: scope.source || "nav",
    items: Array.isArray(scope.items) ? scope.items.map(i => ({ ...i })) : [],
    question: typeof scope.question === "string" && scope.question.trim() ? scope.question : undefined,
  };
}

/** Read and clear the pending scope (AI Analysis calls this on mount). */
export function takeAIScope() {
  const s = _pending;
  _pending = null;
  return s;
}

export function peekAIScope() { return _pending; }

/**
 * Which optional record slices a run reads, from the launcher scope and the
 * reads level. Identity and safety slices are not represented here because
 * they always ride. Specific launcher items narrow harder than any level:
 * a panel scope reads that panel's labs and nothing else optional.
 */
export function slicesFor(scopeItems = [], level = DEFAULT_READS_LEVEL) {
  const narrowing = (scopeItems || []).filter(i => i && (i.kind === "panel" || i.kind === "med_list" || i.kind === "symptom_entry"));
  const narrowed = narrowing.length > 0;
  const panelIds = narrowing.filter(i => i.kind === "panel").map(i => String(i.id));
  return {
    narrowed,
    panelIds,
    includeLabs: !narrowed || panelIds.length > 0,
    includeVitals: !narrowed,
    includeDocs: !narrowed && normalizeReadsLevel(level) === "full",
  };
}

/** Chip list for the "Reads:" strip: the specific items, or the single level chip (Core record / Full record). */
export function scopeChips(items, level = DEFAULT_READS_LEVEL) {
  const specific = (items || []).filter(i => i && i.kind !== "full_record");
  if (specific.length) return specific.map(i => ({ ...i, removable: true }));
  const lv = normalizeReadsLevel(level);
  return [{ kind: "full_record", level: lv, label: READS_LEVELS[lv].label, removable: false }];
}

/** True when the scope narrows to specific items (anything but full record). */
export function isNarrowed(items) {
  return (items || []).some(i => i && i.kind !== "full_record");
}

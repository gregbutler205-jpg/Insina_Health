// ── RIE · Engine (orchestrator) ──────────────────────────────────────────────
// Runs scans on demand, aggregates findings, filters out dismissed/ignored
// items, sorts by severity, and applies confirmed fixes. Pure client-side.

import { mkFinding, SEVERITY_RANK } from "./findings.js";
import { runConsistency } from "./consistencyChecks.js";
import { BASE_MISSPELLINGS, suggest, reinforce } from "./medDictionary.js";
import { isDismissed, isIgnoredThisSession } from "./reviewQueue.js";
import { appendAudit } from "./auditLog.js";

const safe = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
// Curated correct forms used for fuzzy medical-name suggestions (NOT the
// patient's own record, so a misspelling in the record can still be flagged).
const CANON = [...new Set(Object.values(BASE_MISSPELLINGS))];
const cleanTok = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9-]/g, "");

// ── Medical dictionary scan ───────────────────────────────────────────────────
function dictionaryScan() {
  const out = [];
  const nameCheck = (term, module, fieldPath, fix) => {
    const s = suggest(term, CANON);
    if (s) out.push(mkFinding({ severity: "warning", checkType: "medDictionary", module, fieldPath, original: term, suggestion: s, message: `"${term}" may be misspelled: did you mean "${s}"?`, fix: fix ? { ...fix, value: s } : null }));
  };

  safe("mi_meds_full").filter(m => m.status !== "inactive").forEach((m, i) => {
    if (m.name) nameCheck(m.name, "medications", `medications[${m.id ?? i}].name`, { store: "mi_meds_full", id: m.id, field: "name", safeBatch: false });
  });
  safe("mi_conditions").forEach((c, i) => {
    if (c.name) nameCheck(c.name, "conditions", `conditions[${c.id ?? i}].name`, { store: "mi_conditions", id: c.id, field: "name", safeBatch: true });
  });

  // Free-text fields: only the explicit base-misspelling map (no fuzzy → no
  // false positives on ordinary words). Findings navigate; no silent edit.
  const scanText = (text, module, fieldPath, label) => {
    const words = String(text || "").split(/[^A-Za-z-]+/).filter(Boolean);
    const flagged = new Set();
    words.forEach(w => {
      const corrected = BASE_MISSPELLINGS[cleanTok(w)];
      if (corrected && corrected.toLowerCase() !== w.toLowerCase() && !flagged.has(w.toLowerCase())) {
        flagged.add(w.toLowerCase());
        out.push(mkFinding({ severity: "info", checkType: "spell", module, fieldPath, original: w, suggestion: corrected, message: `${label}: "${w}" may be misspelled: did you mean "${corrected}"?` }));
      }
    });
  };
  safe("mi_notes").forEach((n, i) => { const body = (n.sections || []).map(s => s.body).join(" "); scanText(`${n.title || ""} ${body}`, "notes", `notes[${n.id ?? i}]`, `Note "${n.title || "Untitled"}"`); });
  safe("mi_symptoms").forEach((s, i) => scanText(`${s.symptom || s.name || ""} ${s.note || s.notes || ""}`, "symptoms", `symptoms[${s.id ?? i}]`, "Symptom"));
  safe("mi_appointments").forEach((a, i) => scanText(a.notes, "appointments", `appointments[${a.id ?? i}].notes`, `Appointment "${a.title || a.date}"`));
  return out;
}

// ── Full scan ─────────────────────────────────────────────────────────────────
let _last = { findings: [], at: null };

export function runFullScan() {
  const all = [...runConsistency(), ...dictionaryScan()];
  // de-dupe by id, drop dismissed / session-ignored
  const byId = new Map();
  all.forEach(f => { if (!byId.has(f.id) && !isDismissed(f.id) && !isIgnoredThisSession(f.id)) byId.set(f.id, f); });
  const findings = [...byId.values()].sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || a.module.localeCompare(b.module));
  _last = { findings, at: new Date().toISOString() };
  return findings;
}

export function lastScan() { return _last; }

export function counts(findings) {
  return findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; },
    { critical: 0, warning: 0, info: 0 });
}

// ── Apply a confirmed fix ─────────────────────────────────────────────────────
export function applyFix(finding) {
  const fx = finding.fix;
  if (!fx) return false;
  try {
    const arr = JSON.parse(localStorage.getItem(fx.store) || "[]");
    const idx = fx.id != null ? arr.findIndex(x => String(x.id) === String(fx.id)) : (fx.index ?? -1);
    if (idx < 0 || !arr[idx]) return false;
    arr[idx][fx.field] = fx.value;
    localStorage.setItem(fx.store, JSON.stringify(arr));
    if (finding.checkType === "medDictionary") reinforce(finding.original, fx.value);
    appendAudit({ action: "fix", finding: finding.id, module: finding.module, original: finding.original, applied: fx.value });
    window.dispatchEvent(new Event("mi-data-synced"));
    window.dispatchEvent(new Event("mi_rie_changed"));
    return true;
  } catch { return false; }
}

// Batch: apply Warning/Info fixes with an unambiguous correction. Never med
// names, never Critical (per spec).
export function applySafeFixes(findings) {
  let n = 0;
  findings.forEach(f => {
    if (f.severity === "critical") return;
    if (!f.fix || f.fix.safeBatch === false) return;
    if (f.module === "medications" && f.fix.field === "name") return;
    if (applyFix(f)) n++;
  });
  return n;
}

export function logOverride(reportType, findings) {
  appendAudit({ action: "override", reportType, count: findings.length, ids: findings.map(f => f.id) });
}

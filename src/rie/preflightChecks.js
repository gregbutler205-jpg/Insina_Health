// ── RIE · Report Preflight ───────────────────────────────────────────────────
// Runs before a report is printed, shared, or exported. Combines the full-record
// scan (so shared documents are spell-/consistency-checked) with report-specific
// critical checks. Critical issues block output until fixed or explicitly
// overridden; warnings and info do not block.

import { mkFinding, SEVERITY_RANK } from "./findings.js";
import { runFullScan } from "./engine.js";
import { isDismissed, isIgnoredThisSession } from "./reviewQueue.js";

const safe = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const obj  = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };

// ── Report-specific critical checks ───────────────────────────────────────────
function insuranceMissing() {
  const ins = obj("mi_profile_insurance");
  return (!ins.ins1 && !ins.plan1 && !ins.mid1)
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "profile", fieldPath: "insurance", original: "Insurance", message: "No insurance information on file: clinical intake requires it" })] : [];
}
function allergyEmpty() {
  return safe("mi_allergies").length === 0
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "profile", fieldPath: "allergies.empty", original: "Allergies", message: "Allergy list is empty. Confirm 'no known allergies' or add them before sharing" })] : [];
}
function diagnosesEmpty() {
  return safe("mi_conditions").length === 0
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "conditions", fieldPath: "conditions.empty", original: "Diagnoses", message: "Active diagnoses / problem list is empty" })] : [];
}
function medsEmpty() {
  return safe("mi_meds_full").filter(m => m.status !== "inactive").length === 0
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "medications", fieldPath: "meds.empty", original: "Medications", message: "Current medications list is empty" })] : [];
}
function transplantStatusMissing() {
  const hay = (safe("mi_conditions").map(c => c.name).join(" ") + " " + safe("mi_surgeries").map(s => s.procedure).join(" ")).toLowerCase();
  return !/transplant|immunosupp|\bldlt\b|graft/.test(hay)
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "conditions", fieldPath: "transplantStatus", original: "Transplant status", message: "Transplant / immunosuppression status not flagged. A proceduralist must know this before any procedure" })] : [];
}
function plateletMissing() {
  return !safe("mi_labs").some(l => /platelet|\bplt\b/i.test(l.name || ""))
    ? [mkFinding({ severity: "critical", checkType: "preflight", module: "labs", fieldPath: "platelet", original: "Platelet count", message: "No platelet count on file: procedural bleeding risk should be communicated" })] : [];
}

const REPORT_CRITICALS = {
  profile:          [insuranceMissing],
  consultationPrep: [transplantStatusMissing, allergyEmpty, plateletMissing],
  edPrep:           [diagnosesEmpty, medsEmpty, allergyEmpty],
  medications:      [],
  labs:             [],
};

export const REPORT_LABELS = {
  profile: "Patient Profile", consultationPrep: "Consultation Prep",
  edPrep: "ED Prep Packet", medications: "Medication Report", labs: "Lab Report",
};

export function runPreflight(reportType) {
  // UI-23: the preflight surfaces only what genuinely matters before sharing
  // a document — report-specific essential checks plus CRITICAL full-scan
  // findings. Warning/info findings (missing refill dates, absent reference
  // ranges, optional blanks…) live in the Review Queue, not in the print
  // path — they previously piled into a warning wall before every report.
  const base = runFullScan().filter(f => f.severity === "critical");
  const specific = (REPORT_CRITICALS[reportType] || [])
    .flatMap(fn => fn())
    .filter(f => !isDismissed(f.id) && !isIgnoredThisSession(f.id));
  const map = new Map();
  [...specific, ...base].forEach(f => { if (!map.has(f.id)) map.set(f.id, f); });
  return [...map.values()].sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || a.module.localeCompare(b.module));
}

/**
 * Gate a report action through preflight. If nothing is found, the report
 * generates immediately. Otherwise a preflight modal is raised (handled by
 * PreflightHost) and `generateFn` runs only when the patient proceeds.
 */
export function requestReport(reportType, generateFn) {
  const findings = runPreflight(reportType);
  if (findings.length === 0) { generateFn(); return; }
  window.dispatchEvent(new CustomEvent("rie-preflight", { detail: { reportType, generateFn } }));
}

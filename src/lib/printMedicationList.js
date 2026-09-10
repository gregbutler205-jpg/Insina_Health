// ── Medication Report generator (extracted verbatim from Tab04.jsx) ─────────
// Moved to a shared lib so the onboarding first-artifact engine (ONBOARDING_
// SPEC v1.1 §6) can invoke it from Phase 5 — the spec names first-artifact
// invocation as a sanctioned integration point.
// WO_DASHBOARD_POLISH_02 item 5 (DEC-061): content unchanged (grouped by
// category, the same columns and disclaimer); the page is now the shared
// report shell in printShell.js, which owns the popup and the CSP wiring.
import { esc, fmtD, printReport, tableHtml } from "./printShell.js";
import { readAttestations, provenanceLine } from "./reportData.js";

/** Pure builder, exported so the report is testable without a window. */
export function buildMedicationList(meds) {
  const active = (meds || []).filter(m => m.status !== "inactive");
  const grouped = {};
  active.forEach(m => {
    const cat = m.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  });
  const columns = [
    { label: "Medication", html: m => `<strong>${esc(m.name)}</strong>${m.brand ? `<br><span class="muted">${esc(m.brand)}</span>` : ""}${m.flag ? `<span class="tag">REVIEW</span>` : ""}` },
    { label: "Dose", key: "dose" },
    { label: "Frequency", key: "frequency" },
    { label: "Schedule", key: "schedule" },
    { label: "Prescriber", key: "prescriber" },
    { label: "Rx #", key: "rxNumber" },
    { label: "Refill", get: m => fmtD(m.refillDate) },
  ];
  // C-24 provenance (HISTORY_BUILDER_SPEC section 5): only when the list was confirmed.
  const provenance = provenanceLine("Medication list", readAttestations().medsCompleteAt);
  const body = (Object.entries(grouped).map(([cat, catMeds]) => `<h3>${esc(cat)}</h3>${tableHtml(columns, catMeds)}`).join("")
    || `<div class="empty">No active medications recorded.</div>`)
    + (provenance ? `<div class="muted" style="margin-top:8pt">${esc(provenance)}</div>` : "");
  return {
    title: "Medication List",
    subtitle: `${active.length} active medication${active.length === 1 ? "" : "s"}`,
    body,
    disclaimer: "This list is for reference only. Always confirm medications and dosages with your prescribing physician and pharmacist.",
  };
}

export function printMedicationList(meds) {
  printReport(buildMedicationList(meds));
}

// ── Fixture extraction dataset (ONBOARDING_SPEC v1.1 work order) ─────────────
// The `fixture` implementation of the extraction interface returns this §4.1
// result: five medications across two source documents (including the
// Apr 2024 stale discharge note), one allergy, 27 labs, plus conditions,
// care team, a procedure, and an immunization so every §5.2 matrix row is
// exercisable before the live proxy exists. Pure data — no browser APIs —
// so the Node test harness can validate contract conformance.

const LABS_2026 = [
  ["Sodium", "141", "mEq/L", "136", "145", 0.97],
  ["Potassium", "4.6", "mEq/L", "3.5", "5.0", 0.96],
  ["Chloride", "103", "mEq/L", "98", "107", 0.95],
  ["CO2", "24", "mEq/L", "22", "29", 0.94],
  ["BUN", "22", "mg/dL", "7", "20", 0.95],
  ["Creatinine", "1.28", "mg/dL", "0.74", "1.35", 0.97],
  ["eGFR", "62", "mL/min/1.73m2", "60", "", 0.93],
  ["Glucose", "108", "mg/dL", "70", "99", 0.96],
  ["Calcium", "9.4", "mg/dL", "8.6", "10.2", 0.95],
  ["Magnesium", "1.6", "mg/dL", "1.7", "2.2", 0.91],
  ["ALT", "28", "U/L", "7", "56", 0.97],
  ["AST", "24", "U/L", "10", "40", 0.97],
  ["Alkaline Phosphatase", "96", "U/L", "44", "147", 0.94],
  ["Total Bilirubin", "0.8", "mg/dL", "0.2", "1.2", 0.96],
  ["Albumin", "4.1", "g/dL", "3.5", "5.0", 0.93],
  ["WBC", "5.8", "10^3/uL", "4.5", "11.0", 0.95],
  ["Hemoglobin", "13.1", "g/dL", "13.5", "17.5", 0.94],
  ["Hematocrit", "39.8", "%", "41", "53", 0.92],
  ["Platelets", "182", "10^3/uL", "150", "400", 0.95],
  ["Tacrolimus Trough", "5.2", "ng/mL", "4", "8", 0.78],
];

const LABS_2024 = [
  ["ALT", "64", "U/L", "7", "56", 0.93],
  ["AST", "58", "U/L", "10", "40", 0.92],
  ["Total Bilirubin", "1.6", "mg/dL", "0.2", "1.2", 0.9],
  ["Creatinine", "1.10", "mg/dL", "0.74", "1.35", 0.91],
  ["Hemoglobin", "11.9", "g/dL", "13.5", "17.5", 0.88],
  ["Platelets", "141", "10^3/uL", "150", "400", 0.86],
  ["INR", "1.3", "", "0.8", "1.1", 0.44],
];

function lab([test, value, unit, ref_low, ref_high, confidence], collected_date, source_page) {
  return {
    category: "lab",
    fields: { test, value, unit, ref_low, ref_high, collected_date },
    confidence,
    source_page,
    source_region: null,
  };
}

/** Build the §4.1 fixture extraction result (pure; deterministic). */
export function buildFixtureResult() {
  return {
    documents: [
      {
        source_name: "Transplant Clinic Note",
        doc_date: "2026-05-20",
        doc_date_confidence: 0.95,
        items: [
          { category: "medication", fields: { name: "tacrolimus", strength: "1 mg", dose: "2 mg", frequency: "BID", route: "oral", status_hint: "active" }, confidence: 0.96, source_page: 1, source_region: [0.08, 0.32, 0.6, 0.04] },
          { category: "medication", fields: { name: "mycophenolate mofetil", strength: "500 mg", dose: "500 mg", frequency: "BID", route: "oral", status_hint: "active" }, confidence: 0.93, source_page: 1, source_region: [0.08, 0.37, 0.6, 0.04] },
          { category: "medication", fields: { name: "prednisone", strength: "5 mg", dose: "5 mg", frequency: "QD", route: "oral", status_hint: "active" }, confidence: 0.91, source_page: 1, source_region: [0.08, 0.42, 0.6, 0.04] },
          { category: "allergy", fields: { substance: "penicillin", reaction: "hives" }, confidence: 0.9, source_page: 1, source_region: [0.08, 0.5, 0.5, 0.04] },
          { category: "condition", fields: { name: "hypertension", onset_date: "2020-06-01", status_hint: "active" }, confidence: 0.9, source_page: 2, source_region: null },
          { category: "care_team", fields: { name: "Dr. Sarah Chen", credential: "MD", specialty: "Transplant Hepatology", phone: "(555) 294-8800" }, confidence: 0.88, source_page: 2, source_region: null },
          { category: "immunization", fields: { name: "Influenza vaccine", date: "2025-10-08" }, confidence: 0.87, source_page: 2, source_region: null },
          ...LABS_2026.map(l => lab(l, "2026-05-18", 3)),
        ],
      },
      {
        source_name: "Hospital Discharge Summary",
        doc_date: "2024-04-22",
        doc_date_confidence: 0.92,
        items: [
          { category: "medication", fields: { name: "valganciclovir", strength: "450 mg", dose: "450 mg", frequency: "QD", route: "oral", status_hint: "active" }, confidence: 0.94, source_page: 1, source_region: [0.08, 0.55, 0.6, 0.04] },
          { category: "medication", fields: { name: "sulfamethoxazole-trimethoprim", strength: "800-160 mg", dose: "1 tablet", frequency: "QD", route: "oral", status_hint: "active" }, confidence: 0.88, source_page: 1, source_region: [0.08, 0.6, 0.6, 0.04] },
          { category: "condition", fields: { name: "HTN", onset_date: null, status_hint: "active" }, confidence: 0.72, source_page: 1, source_region: null },
          { category: "procedure", fields: { name: "Liver biopsy", date: "2024-04-18" }, confidence: 0.9, source_page: 2, source_region: null },
          ...LABS_2024.map(l => lab(l, "2024-04-20", 2)),
        ],
      },
    ],
  };
}

// ── Browser-only: synthetic source-document images (provenance, §4.3) ────────
// Fixture mode has no real uploads, but the §3.4 side-by-side source panel
// still needs something to show. Render simple page images for each fixture
// document so the Documents-module linkage works exactly like a real photo.
export function renderFixtureDocImage(title, docDate, lines) {
  const canvas = document.createElement("canvas");
  canvas.width = 850; canvas.height = 1100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f5f0"; ctx.fillRect(0, 0, 850, 1100);
  ctx.fillStyle = "#1a1a1a"; ctx.font = "bold 28px Georgia";
  ctx.fillText(title, 60, 80);
  ctx.font = "16px Georgia"; ctx.fillStyle = "#444";
  ctx.fillText(`Document date: ${docDate}`, 60, 115);
  ctx.strokeStyle = "#bbb"; ctx.beginPath(); ctx.moveTo(60, 135); ctx.lineTo(790, 135); ctx.stroke();
  ctx.font = "17px Georgia"; ctx.fillStyle = "#222";
  lines.forEach((line, i) => ctx.fillText(line, 60, 180 + i * 34));
  ctx.font = "12px Georgia"; ctx.fillStyle = "#999";
  ctx.fillText("Fixture document: generated for onboarding demo mode. Not a real record.", 60, 1060);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function fixtureDocLines(doc) {
  return doc.items.slice(0, 24).map(it => {
    const f = it.fields;
    switch (it.category) {
      case "medication": return `•  ${f.name} ${f.strength || ""}: ${f.dose || ""} ${f.frequency || ""}`.trim();
      case "allergy": return `•  Allergy: ${f.substance}${f.reaction ? ` (${f.reaction})` : ""}`;
      case "condition": return `•  Dx: ${f.name}`;
      case "care_team": return `•  Provider: ${f.name}, ${f.specialty || ""}`;
      case "lab": return `•  ${f.test}: ${f.value} ${f.unit || ""}  (ref ${f.ref_low || "–"}–${f.ref_high || "–"})`;
      case "procedure": return `•  Procedure: ${f.name} (${f.date || ""})`;
      case "immunization": return `•  Immunization: ${f.name} (${f.date || ""})`;
      default: return `•  ${JSON.stringify(f).slice(0, 70)}`;
    }
  });
}

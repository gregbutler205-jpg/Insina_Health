// ── Patient Profile printout (WO_DASHBOARD_POLISH_02 items 2 and 5; DEC-060, DEC-061)
// Built from the stores, not from the mounted Health profile screen, so
// Reports prints it in one step and the screen's card picker prints the same
// document. Layout per Greg (v1.53.5): the transplant + allergies notice sits
// in the header's left column under the demographics line, 10pt red type, no
// box; short-form banner; allergies names-only, with "No allergies recorded"
// stated rather than silence. Only fields with values print (UI-23).
//
// Security: every value is patient-entered or OCR/AI-derived and lands in a
// same-origin popup (AUDIT_SEC_02 F-01). Everything below goes through `esc`,
// card image srcs included.
import { esc, fmtD, openReport, reportDocument, grid2, rowsHtml } from "./printShell.js";
import {
  getProfilePersonal, getProfileInsurance, getCareTeam, getAllergies, getEmergencyContacts,
  getPharmacies, getConditions, getMedsFull, getSurgeries, getDiagnostics, getRecords,
  latestWeightReading, ageFromDob,
} from "../store.js";
import { getCards } from "./cards.js";
import { deriveTransplantBanner } from "./printEmergency.js";
import { displayPhone, formatDateUS } from "./displaySafe.js";

// ── Featured labs (11 key labs), shared with the Health profile screen ───────
export const FEATURED_LAB_DEFS = [
  { label: "Alk Phos",   pattern: /alk.*phos|alkaline.*phos/i },
  { label: "ALT",        pattern: /\balt\b|alanine\s*(amino)?trans/i },
  { label: "AST",        pattern: /\bast\b|aspartate\s*(amino)?trans/i },
  { label: "Bilirubin",  pattern: /bilirubin/i },
  { label: "Glucose",    pattern: /\bglucose\b/i },
  { label: "Calcium",    pattern: /\bcalcium\b/i },
  { label: "Platelets",  pattern: /platelet/i },
  { label: "Creatinine", pattern: /\bcreatinine\b/i },
  { label: "eGFR",       pattern: /egfr|glom.*filt/i },
  { label: "Sodium",     pattern: /\bsodium\b/i },
  { label: "Magnesium",  pattern: /magnesium/i },
];

export function getFeaturedLabs() {
  try {
    const all = JSON.parse(localStorage.getItem("mi_labs") || "[]");
    const latest = {};
    all.forEach(l => {
      const key = (l.name || "").toLowerCase().trim();
      if (!key) return;
      if (!latest[key] || new Date(l.date || 0) > new Date(latest[key].date || 0)) latest[key] = l;
    });
    const deduped = Object.values(latest);
    return FEATURED_LAB_DEFS.map(def => {
      const match = deduped.find(l => def.pattern.test(l.name || ""));
      return { label: def.label, lab: match || null };
    });
  } catch { return FEATURED_LAB_DEFS.map(def => ({ label: def.label, lab: null })); }
}

const shortDate = (iso) => iso
  ? new Date(iso + (String(iso).length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : "–";
const longDate = (iso) => iso
  ? new Date(iso + (String(iso).length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  : "";
const dateDesc = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
const has = (v) => v != null && String(v).trim() !== "";

/** The Dashboard's care team selection (Tab08) narrows the printed roster; no selection prints everyone. */
function selectedCareTeam(team) {
  try {
    const raw = localStorage.getItem("mi_care_team_selected");
    if (raw) {
      const names = new Set(JSON.parse(raw));
      return team.filter(d => names.has(d.name));
    }
  } catch { /* no selection saved */ }
  return team;
}

/**
 * Pure builder, exported so the document is testable without a window.
 * @param {object} [o]
 * @param {Array}  [o.cardIds] card ids to include; omitted = every stored card (DEC-060)
 */
export function buildProfileHtml({ cardIds } = {}) {
  const P = getProfilePersonal() || {};
  const I = getProfileInsurance() || {};
  const careTeam = getCareTeam() || [];
  const allergies = getAllergies() || [];
  const contacts = getEmergencyContacts() || [];
  const pharmacies = getPharmacies() || [];
  const conditions = getConditions() || [];
  const meds = getMedsFull() || [];
  const surgeries = getSurgeries() || [];
  const diagnostics = getDiagnostics() || [];
  const records = getRecords() || [];
  const wanted = cardIds ? new Set(cardIds.map(String)) : null;
  const cards = (getCards() || []).filter(c => !wanted || wanted.has(String(c.id)));

  const activeMeds = meds.filter(m => m.status !== "inactive");
  const age = ageFromDob(P.dob) ?? P.age;
  // The same record-derived banner as the Emergency Card, short form (v1.53.3).
  const banner = deriveTransplantBanner(conditions.filter(c => c.status !== "inactive"), activeMeds).replace(/ ON IMMUNOSUPPRESSION$/, "");
  // Weight auto-fills from the newest Vitals reading that has one (v1.49.0).
  const w = latestWeightReading();
  const weightText = w ? `${parseFloat(w.weight)} lbs${w.date ? ` (as of ${shortDate(w.date)})` : ""}` : P.weight;

  // mi_records supplements: Procedure records belong with Procedures, Imaging with Diagnostics.
  const recordProcedures = records.filter(r => r.type === "Procedure")
    .map(r => ({ id: `rec-${r.id}`, procedure: r.title, facility: r.facility || "", date: r.date || "", fromRecords: true }));
  const recordDiagnostics = records.filter(r => r.type === "Imaging")
    .map(r => ({ id: `rec-${r.id}`, name: r.title, facility: r.facility || "", date: r.date || "", fromRecords: true }));
  const allSurgeries = [...surgeries, ...recordProcedures].sort(dateDesc);
  const allDiagnostics = [...diagnostics, ...recordDiagnostics].sort(dateDesc);

  // ── Header (left column) ──
  const demo = [["DOB", formatDateUS(P.dob)], ["Age", age], ["Sex", P.sex], ["Blood Type", P.blood || P.bloodType]]
    .filter(([, v]) => has(v)).map(([l, v]) => `${l}: ${v}`).join("  ·  ") || "Demographics not recorded";
  const allergyNames = allergies.map(a => a.allergen || a.name).filter(Boolean).join(", ") || "No allergies recorded";
  const headerHtml =
    `<h1>${esc(P.name || "Patient Name")}</h1>` +
    `<div class="who">${esc(demo)}</div>` +
    `<div class="notice">${banner ? `<div class="banner">⚠ ${esc(banner)}</div>` : ""}<div class="allergies">ALLERGIES: ${esc(allergyNames)}</div></div>`;

  // ── Sections ──
  const parts = [];
  parts.push(`<h2>Demographics &amp; Contact</h2>` + grid2([
    ["Height", P.height], ["Weight", weightText], ["Phone", displayPhone(P.phone)], ["Email", P.email], ["Address", P.address],
    ["Code Status", P.codeStatus], ["Advance Directive", P.advanceDirective], ["Implanted Devices", P.implantedDevices],
  ]));

  if (I.ins1 || I.plan1 || I.ins2) {
    parts.push(`<h2>Insurance / Coverage</h2>` + grid2([
      ["Primary Insurer", I.ins1], ["Plan", I.plan1], ["Member ID", I.mid1], ["Group #", I.grp1],
      ["Secondary Insurer", I.ins2], ["Member ID (2)", I.mid2], ["Copay (Specialist)", I.copay], ["Deductible YTD", I.ded], ["Out-of-Pocket Max", I.oop],
    ]));
  }

  if (contacts.length) {
    parts.push(`<h2>Emergency Contacts</h2>` + rowsHtml(contacts.map(c => [
      `${c.name || ""}${c.primary ? " (Primary)" : ""}`,
      [c.relationship, displayPhone(c.phone), c.email].filter(has).join("  ·  ") || "–",
    ])));
  }

  if (pharmacies.length) {
    parts.push(`<h2>Pharmacy</h2>` + rowsHtml(pharmacies.map(ph => [
      `${ph.name || ""}${ph.primary ? " (Primary)" : ""}`,
      [ph.type, ph.phone, ph.fax ? `fax ${ph.fax}` : "", ph.address].filter(has).join("  ·  ") || "–",
    ])));
  }

  if (allergies.length) {
    parts.push(`<h2>Allergies</h2>` + allergies.map(a =>
      `<div class="pr"><span class="pr-val"><strong>${esc(a.name || a.allergen || "")}</strong>${has(a.reaction) ? `: ${esc(a.reaction)}` : ""}${has(a.severity) ? ` <span class="muted">(${esc(a.severity)})</span>` : ""}</span></div>`
    ).join(""));
  }

  const openConditions = conditions.filter(c => c.status !== "resolved");
  if (openConditions.length) {
    const SEV = { severe: 0, moderate: 1, mild: 2 }, STA = { active: 0, managed: 1 };
    const sorted = [...openConditions].sort((a, b) => ((SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9)) || ((STA[a.status] ?? 9) - (STA[b.status] ?? 9)));
    parts.push(`<h2>Active Conditions / Diagnoses</h2>` + sorted.map(c =>
      `<div class="pr"><span class="pr-lbl">${esc(c.diagnosedDate ? shortDate(c.diagnosedDate) : "–")}</span><span class="pr-val">${esc(c.name || "")} <span class="muted">(${esc(c.status || "")})</span></span></div>`
    ).join(""));
  }

  if (activeMeds.length) {
    parts.push(`<h2>Current Medications</h2>` + grid2(activeMeds.map(m => [
      `${m.name || ""}${m.brand ? ` (${m.brand})` : ""}`,
      `${m.dose || ""}${has(m.frequency) ? `: ${m.frequency}` : ""}${m.prescriber ? ` · ${m.prescriber}` : ""}`,
    ])));
  }

  const featured = getFeaturedLabs();
  if (featured.some(f => f.lab)) {
    const latestDate = featured.filter(f => f.lab?.date).map(f => f.lab.date).sort().reverse()[0];
    parts.push(`<h2>Recent Lab Results${latestDate ? `: ${esc(longDate(latestDate))}` : ""}</h2><div class="grid2">` + featured.map(({ label, lab }) => lab
      ? `<div class="pr"><span class="pr-lbl">${esc(label)}</span><span class="pr-val${lab.flag ? " flag" : ""}">${esc(lab.value ?? "")} ${esc(lab.unit || "")}${lab.refRange ? ` (ref: ${esc(lab.refRange)})` : ""}${lab.flag ? " ▲" : ""}</span></div>`
      : `<div class="pr"><span class="pr-lbl">${esc(label)}</span><span class="pr-val muted">Not on file</span></div>`
    ).join("") + `</div>`);
  }

  const team = selectedCareTeam(careTeam);
  if (team.length) {
    parts.push(`<h2>Care Team</h2><div class="grid2">` + team.map(d =>
      `<div class="pr"><span class="pr-lbl">${esc(d.name || "")}${d.pcp ? " (PCP)" : ""}</span><span class="pr-val">${esc(d.role || "")}${d.facility ? ` · ${esc(d.facility)}` : ""}${d.phone ? ` · ${esc(displayPhone(d.phone))}` : ""}${d.phone24 ? `<strong> · 24 hr: ${esc(displayPhone(d.phone24))}</strong>` : ""}</span></div>`
    ).join("") + `</div>`);
  }

  if (allSurgeries.length) {
    parts.push(`<h2>Procedures</h2>` + allSurgeries.map(s =>
      `<div class="pr"><span class="pr-lbl">${esc(formatDateUS(s.date, "–"))}</span><span class="pr-val"><strong>${esc(s.procedure || "")}</strong>${s.surgeon ? ` · ${esc(s.surgeon)}` : ""}${s.facility ? ` · ${esc(s.facility)}` : ""}${s.notes ? `<div class="muted">${esc(s.notes)}</div>` : ""}</span></div>`
    ).join(""));
  }

  if (allDiagnostics.length) {
    parts.push(`<h2>Diagnostics</h2>` + allDiagnostics.map(d => {
      const line = [d.orderedBy && `Ordered by ${d.orderedBy}`, d.readingProvider && `Read by ${d.readingProvider}`, d.facility].filter(Boolean).join(" · ");
      return `<div class="pr"><span class="pr-lbl">${esc(d.date ? shortDate(d.date) : "–")}</span><span class="pr-val"><strong>${esc(d.name || "")}</strong>${d.relatedCondition ? ` · ${esc(d.relatedCondition)}` : ""}${line ? `<div class="muted">${esc(line)}</div>` : ""}${d.impression ? `<div class="muted">${esc(d.impression)}</div>` : ""}</span></div>`;
    }).join(""));
  }

  if (cards.length) {
    parts.push(`<div class="cards"><h2>Insurance &amp; ID Cards</h2>` + cards.map(c =>
      `<div class="card"><div class="card-label">${esc(c.label || "")}</div><div class="imgs">` +
      (c.front ? `<img src="${esc(c.front)}" alt="${esc(c.label || "Card")} front"/>` : "") +
      (c.back ? `<img src="${esc(c.back)}" alt="${esc(c.label || "Card")} back"/>` : "") +
      `</div></div>`
    ).join("") + `</div>`);
  }

  return reportDocument({ title: "Patient Profile", headerHtml, body: parts.join(""), kind: "Personal Health Record" });
}

/** Open the profile printout. `cardIds` narrows the card section; omitted prints every card. */
export function printProfile({ cardIds } = {}) {
  return openReport(buildProfileHtml({ cardIds }), { width: 900, height: 700 });
}

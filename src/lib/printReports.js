// ── Screen reports on the shared shell (WO_DASHBOARD_POLISH_02 item 5 B; DEC-061)
// Vitals, Documents, Notes, Conditions, Procedures, Diagnostics, and the lab
// entries on Import used to print the screen itself (window.print on the dark
// UI). Each now prints a report built from the same records the screen shows.
// Every value is escaped by tableHtml/esc (AUDIT_SEC_02 F-01).
import { esc, fmtD, printReport, tableHtml } from "./printShell.js";

const has = (v) => v != null && String(v).trim() !== "";
const byDateDesc = (a, b) =>
  String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || ""));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ── Vitals ────────────────────────────────────────────────────────────────────
const bpText = (r) => (has(r.bp_s) || has(r.bp_d)) ? `${has(r.bp_s) ? r.bp_s : "–"}/${has(r.bp_d) ? r.bp_d : "–"}` : (r.bp || "");
const unit = (v, u) => (has(v) ? `${v}${u}` : "");

export function buildVitalsReport(readings) {
  const rows = [...(readings || [])].sort(byDateDesc);
  const columns = [
    { label: "Date", get: r => fmtD(r.date) },
    { label: "Time", key: "time" },
    { label: "BP", get: bpText },
    { label: "HR", key: "hr", num: true },
    { label: "Resting HR", key: "resting_hr", num: true },
    { label: "SpO2", get: r => unit(r.o2, "%"), num: true },
    { label: "Weight", get: r => unit(r.weight, " lb"), num: true },
    { label: "Temp", get: r => unit(r.temp, " °F"), num: true },
    { label: "Glucose", key: "glucose", num: true },
    { label: "Sleep", get: r => unit(r.sleep, " h"), num: true },
    { label: "Flag", html: r => r.flag ? `<span class="flag">${esc(typeof r.flag === "string" ? r.flag : "Flagged")}</span>` : "" },
  ];
  return {
    title: "Vitals Report",
    subtitle: `${plural(rows.length, "reading")}, newest first`,
    body: `<h2>Readings</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Home readings entered by the patient or a connected device. Confirm any reading that guides a decision.",
  };
}
export function printVitalsReport(readings) { printReport(buildVitalsReport(readings), { width: 1000, height: 740 }); }

// ── Documents ─────────────────────────────────────────────────────────────────
export function buildDocumentsReport(docs) {
  const rows = [...(docs || [])].sort(byDateDesc);
  const columns = [
    { label: "Document", html: d => `<strong>${esc(d.title || "Untitled")}</strong>${d.isRef ? `<span class="tag">Reference</span>` : ""}${d.isScanned ? `<span class="tag">Scanned</span>` : ""}${d.flagged ? `<span class="tag">Flagged</span>` : ""}` },
    { label: "Category", key: "category" },
    { label: "Source", key: "source" },
    { label: "Date", get: d => fmtD(d.date, "") },
    { label: "Tags", get: d => Array.isArray(d.tags) ? d.tags.join(", ") : (d.tags || "") },
  ];
  return {
    title: "Documents",
    subtitle: `${plural(rows.length, "document")} on file`,
    body: `<h2>Documents on file</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Titles and dates as entered or extracted at import. The documents themselves are not included in this list.",
  };
}
export function printDocumentsReport(docs) { printReport(buildDocumentsReport(docs)); }

// ── Notes ─────────────────────────────────────────────────────────────────────
function noteBody(note) {
  const sections = (note.sections || []).map(s => {
    const heading = has(s.header || s.heading) ? `<h3>${esc(s.header || s.heading)}</h3>` : "";
    if (s.type === "checklist") {
      const items = (s.items || []).map(i => `${i.done ? "☑" : "☐"} ${esc(i.text || "")}`).join("<br>");
      return heading + `<div class="note">${items}</div>`;
    }
    return heading + `<div class="note">${esc(s.body || "")}</div>`;
  }).join("");
  if (sections) return sections;
  if (has(note.content)) return `<div class="note">${esc(note.content)}</div>`;
  return `<div class="empty">Empty note.</div>`;
}

export function buildNotesReport(notes) {
  const list = [...(notes || [])].sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || byDateDesc(a, b));
  const body = list.map(note => {
    const meta = [fmtD(note.date, ""), note.tag, note.pinned ? "Pinned" : "", note.aiGenerated ? "AI-generated" : ""].filter(has).join("  ·  ");
    return `<div class="block"><h2>${esc(note.title || "Untitled note")}</h2>${meta ? `<div class="muted">${esc(meta)}</div>` : ""}${noteBody(note)}</div>`;
  }).join("") || `<div class="empty">No notes recorded.</div>`;
  return {
    title: "Notes",
    subtitle: `${plural(list.length, "note")}${list.some(n => n.pinned) ? ", pinned first" : ""}`,
    body,
    disclaimer: "Notes are the patient's own words unless marked AI-generated. AI-generated notes are informational only, not clinician text.",
  };
}
export function printNotesReport(notes) { printReport(buildNotesReport(notes)); }

// ── Conditions ────────────────────────────────────────────────────────────────
const STATUS_ORDER = { active: 0, managed: 1, resolved: 2 };

export function buildConditionsReport(conditions) {
  const rows = [...(conditions || [])].sort((a, b) =>
    ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)) || String(a.name || "").localeCompare(String(b.name || "")));
  const count = (s) => rows.filter(c => c.status === s).length;
  const columns = [
    { label: "Condition", html: c => `<strong>${esc(c.name || "")}</strong>${has(c.icd) ? `<span class="tag">${esc(c.icd)}</span>` : ""}` },
    { label: "Status", key: "status" },
    { label: "Severity", key: "severity" },
    { label: "Diagnosed", get: c => fmtD(c.diagnosedDate, "") },
    { label: "Provider", key: "provider" },
    { label: "Notes", key: "notes" },
  ];
  return {
    title: "Conditions",
    subtitle: `${count("active")} active  ·  ${count("managed")} managed  ·  ${count("resolved")} resolved`,
    body: `<h2>Conditions and diagnoses</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Conditions as recorded by the patient or extracted from documents. Diagnoses belong to the treating clinicians.",
  };
}
export function printConditionsReport(conditions) { printReport(buildConditionsReport(conditions)); }

// ── Procedures ────────────────────────────────────────────────────────────────
export function buildProceduresReport(list) {
  const rows = [...(list || [])].sort(byDateDesc);
  const columns = [
    { label: "Date", get: s => fmtD(s.date) },
    { label: "Procedure", html: s => `<strong>${esc(s.procedure || s.title || "")}</strong>${s.fromRecords ? `<span class="tag">from Records</span>` : ""}` },
    { label: "Surgeon", key: "surgeon" },
    { label: "Facility", key: "facility" },
    { label: "Codes", get: s => [s.cpt ? `CPT ${s.cpt}` : "", s.icd ? `ICD ${s.icd}` : ""].filter(Boolean).join("  ·  ") },
    { label: "Anesthesia", key: "anesthesia" },
    { label: "Duration", key: "duration" },
    { label: "Outcome", key: "outcome" },
    { label: "Notes", key: "notes" },
  ];
  return {
    title: "Procedures",
    subtitle: `${plural(rows.length, "procedure")} on record, newest first`,
    body: `<h2>Procedures</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Procedures as recorded by the patient or found in imported records. Operative details belong to the treating team.",
  };
}
export function printProceduresReport(list) { printReport(buildProceduresReport(list), { width: 1000, height: 740 }); }

// ── Diagnostics ───────────────────────────────────────────────────────────────
export function buildDiagnosticsReport(list) {
  const rows = [...(list || [])].sort(byDateDesc);
  const columns = [
    { label: "Date", get: d => fmtD(d.date) },
    { label: "Study", html: d => `<strong>${esc(d.name || "")}</strong>${has(d.relatedCondition) ? `<div class="muted">${esc(d.relatedCondition)}</div>` : ""}${d.fromRecords ? `<span class="tag">from Records</span>` : ""}` },
    { label: "Ordered by", key: "orderedBy" },
    { label: "Read by", key: "readingProvider" },
    { label: "Facility", key: "facility" },
    { label: "Impression", key: "impression" },
  ];
  return {
    title: "Diagnostics",
    subtitle: `${plural(rows.length, "study").replace("studys", "studies")} on record, newest first`,
    body: `<h2>Imaging and other studies</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Studies as recorded by the patient or found in imported records. Impressions are copied from reports, not interpreted here.",
  };
}
export function printDiagnosticsReport(list) { printReport(buildDiagnosticsReport(list), { width: 1000, height: 740 }); }

// ── Lab entries (Import records) ──────────────────────────────────────────────
export function buildLabEntries(labs) {
  const rows = [...(labs || [])].sort((a, b) => byDateDesc(a, b) || String(a.name || "").localeCompare(String(b.name || "")));
  const columns = [
    { label: "Date", get: l => fmtD(l.date) },
    { label: "Test", get: l => l.name || "" },
    { label: "Value", key: "value", num: true },
    { label: "Unit", key: "unit" },
    { label: "Ref range", key: "refRange" },
    { label: "Facility", key: "facility" },
    { label: "Status", html: l => l.flag ? `<span class="flag">Flagged</span>` : `<span class="ok">Normal</span>` },
  ];
  return {
    title: "Lab Results",
    subtitle: `${plural(rows.length, "result")} recorded, newest first`,
    body: `<h2>All recorded results</h2>${tableHtml(columns, rows)}`,
    disclaimer: "Values as entered or extracted at import. Reference ranges are the reporting lab's; a flag means outside that range.",
  };
}
export function printLabEntries(labs) { printReport(buildLabEntries(labs), { width: 1000, height: 740 }); }

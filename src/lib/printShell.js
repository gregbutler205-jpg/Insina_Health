// ── THE shared report shell (WO_DASHBOARD_POLISH_02 item 5 B; DEC-061) ───────
// Every printout except the Emergency Card (printEmergency.js, ED-reviewed
// layout), the consent record (PrintableConsent.jsx), and the AI session
// document (printSession.js, DEC-C13 handoff format) is built here: one
// header (title or patient name, identity line, brand block with the printed
// date), one section and table style, one disclaimer slot, one footer.
//
// Security (AUDIT_SEC_02 F-01, S-02/PG-02): everything interpolated into a
// report is patient-entered or OCR/AI-derived and is written into a same-origin
// popup while the vault is unlocked. The shell escapes every value it receives
// as text (title, subtitle, disclaimer, identity line); builders pass `body`
// as trusted HTML and MUST escape every value with `esc` (including attribute
// values such as image srcs). `tableHtml` and `rowsHtml` escape for them.
//
// CSP (v1.49.1): generated pages carry no inline scripts or handlers. The
// opener wires the print button and auto-print through wirePrintWindow. This
// module is the only window.open site for shell reports (testPrintCsp pins it).
import { escapeHtml } from "./renderAiText.js";
import { wirePrintWindow } from "./printWindow.js";
import { formatDateUS } from "./displaySafe.js";
import { getProfilePersonal, ageFromDob } from "../store.js";

// Optional chaining: import.meta.env is a Vite-time global, absent under node
// (the test suites import this module directly).
export const PRINT_LOGO = (import.meta.env?.BASE_URL || "/") + "logo.png";
export const esc = escapeHtml;

/** "September 7, 2026" */
export function printedOn(d = new Date()) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** ISO dates print as US dates; anything else prints as typed. */
export function fmtD(v, fallback = "–") {
  if (!v) return fallback;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? formatDateUS(s.slice(0, 10), fallback) : s;
}

/** Patient identity for the header: name plus a DOB / age line (empty when unset). */
export function patientHeader() {
  const p = getProfilePersonal() || {};
  const age = ageFromDob(p.dob);
  const bits = [p.dob ? `DOB ${formatDateUS(p.dob)}` : "", age != null ? `Age ${age}` : ""].filter(Boolean);
  return { name: p.name || "", line: bits.join("  ·  ") };
}

export const REPORT_CSS = `
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { background:#ffffff; color:#000000; font-family:Georgia, serif; font-size:10pt; }
  body { padding:32pt 40pt; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:16pt; margin-bottom:12pt; }
  h1 { font-size:18pt; color:#000; margin-bottom:2pt; font-weight:700; }
  .who { font-size:9pt; color:#444; font-family:Arial, sans-serif; }
  .sub { font-size:9.5pt; color:#333; margin-top:4pt; }
  .notice { margin-top:6pt; }
  .banner { color:#b91c1c; font-family:Arial, sans-serif; font-weight:800; font-size:10pt; letter-spacing:1px; }
  .allergies { color:#b91c1c; font-family:Arial, sans-serif; font-weight:700; font-size:10pt; margin-top:3pt; }
  .brand { text-align:right; font-family:Arial, sans-serif; font-size:8pt; color:#444; flex-shrink:0; }
  .brand .chip { background:#07090f; border-radius:6px; padding:6px 8px; display:inline-block; margin-bottom:4px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .brand img { width:180px; height:auto; display:block; }
  h2 { font-size:10.5pt; font-family:Arial, sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#000; border-bottom:1.5pt solid #000; padding-bottom:3pt; margin:16pt 0 8pt; }
  h3 { font-size:8.5pt; font-family:Arial, sans-serif; text-transform:uppercase; letter-spacing:1px; color:#1e3a8a; border-left:3pt solid #1e3a8a; padding:3pt 8pt; margin:12pt 0 4pt; }
  table { width:100%; border-collapse:collapse; margin-bottom:6pt; }
  th { font-family:Arial, sans-serif; font-size:8pt; text-transform:uppercase; letter-spacing:.6px; color:#444; text-align:left; padding:5pt 6pt; border-bottom:1pt solid #999; }
  td { font-size:9.5pt; padding:5pt 6pt; border-bottom:.5pt solid #ccc; vertical-align:top; line-height:1.4; }
  tr { page-break-inside:avoid; }
  th.num, td.num { text-align:right; white-space:nowrap; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 32pt; }
  .pr { display:flex; padding:3.5pt 0; border-bottom:.5pt solid #ccc; font-size:9.5pt; align-items:flex-start; }
  .pr-lbl { font-family:Arial, sans-serif; font-size:8.5pt; color:#444; min-width:120pt; flex-shrink:0; padding-top:1pt; }
  .pr-val { color:#000; flex:1; line-height:1.45; }
  .muted { color:#555; font-size:8.5pt; }
  .flag { color:#b45309; font-weight:700; }
  .ok { color:#047857; }
  .tag { font-family:Arial, sans-serif; font-size:7.5pt; border:.5pt solid #999; border-radius:3pt; padding:0 3pt; margin-left:4pt; color:#333; white-space:nowrap; }
  .callout { border:1pt solid #b91c1c; border-left:3pt solid #b91c1c; padding:6pt 10pt; margin:8pt 0 12pt; font-family:Arial, sans-serif; font-size:9pt; color:#7f1d1d; }
  .note { white-space:pre-wrap; line-height:1.5; }
  .block { margin-bottom:10pt; page-break-inside:avoid; }
  .cards .card { margin-bottom:14pt; page-break-inside:avoid; }
  .cards .card-label { font-family:Arial, sans-serif; font-size:9.5pt; font-weight:700; margin-bottom:4pt; }
  .cards .imgs { display:flex; gap:14pt; flex-wrap:wrap; }
  .cards img { width:46%; max-width:300pt; border:.5pt solid #999; border-radius:4pt; }
  .empty { color:#555; font-style:italic; }
  .disclaimer { margin-top:16pt; font-size:8.5pt; color:#555; border-top:.5pt dashed #999; padding-top:6pt; font-family:Arial, sans-serif; }
  .footer { margin-top:24pt; font-size:8pt; color:#777; font-family:Arial, sans-serif; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
  @media print { body { padding:0; } @page { margin:18mm 20mm; } }
`;

/**
 * Build one report document. No inline scripts or handlers.
 * @param {object} o
 * @param {string}  o.title        report title, escaped here
 * @param {string}  [o.subtitle]   one line under the identity line, escaped here
 * @param {string}  [o.headerHtml] trusted HTML for the header's left column (replaces title,
 *                                 identity, and subtitle); the caller escapes its values
 * @param {string}  [o.kind]       brand line under the logo, escaped here
 * @param {string}  o.body         trusted HTML; the caller escapes every value
 * @param {string}  [o.disclaimer] escaped here
 * @param {boolean} [o.patient]    include the identity line (default true)
 * @param {string}  [o.extraCss]   report-specific rules appended to the shared CSS
 */
export function reportDocument({ title, subtitle = "", headerHtml = "", kind = "Personal Health Record", body = "", disclaimer = "", patient = true, extraCss = "" }) {
  const who = patient ? patientHeader() : { name: "", line: "" };
  const left = headerHtml || (
    `<h1>${esc(title)}</h1>` +
    (who.name ? `<div class="who">${esc(who.name)}${who.line ? `  ·  ${esc(who.line)}` : ""}</div>` : "") +
    (subtitle ? `<div class="sub">${esc(subtitle)}</div>` : "")
  );
  const date = esc(printedOn());
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Insina Health: ${esc(title)}</title>
  <style>${REPORT_CSS}${extraCss}</style>
</head>
<body>
  <div class="hdr">
    <div>${left}</div>
    <div class="brand">
      <div class="chip"><img src="${esc(PRINT_LOGO)}" alt="Insina Health"/></div>
      <div>${esc(kind)}</div>
      <div>Printed: ${date}</div>
    </div>
  </div>
  ${body}
  ${disclaimer ? `<div class="disclaimer">${esc(disclaimer)}</div>` : ""}
  <div class="footer">This document was generated by Insina Health Personal Health Dashboard &nbsp;·&nbsp; For medical use only &nbsp;·&nbsp; Printed ${date}</div>
</body>
</html>`;
}

/**
 * Open a finished document in a popup and wire printing from the opener.
 * Returns the window, or null when the popup was blocked (same convention as
 * printMedicationList had; callers may fall back to a download).
 */
export function openReport(html, { width = 960, height = 720 } = {}) {
  const win = window.open("", "_blank", `width=${width},height=${height}`);
  if (!win) return null;
  win.document.write(html);
  win.document.close();
  wirePrintWindow(win); // CSP-safe: the opener fires print; inline scripts are blocked in the popup
  return win;
}

/** Build and open in one step. `opts` is a reportDocument() argument. */
export function printReport(opts, size) {
  return openReport(reportDocument(opts), size);
}

/**
 * A table from column specs and row objects. Every cell is escaped.
 * columns: [{ label, key }] or [{ label, get: row => text, num: true }]
 * A column's `html: row => trustedHtml` bypasses escaping for callers that
 * compose their own escaped fragments.
 */
export function tableHtml(columns, rows) {
  if (!rows.length) return `<div class="empty">Nothing recorded.</div>`;
  const head = columns.map(c => `<th${c.num ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("");
  const body = rows.map(r => "<tr>" + columns.map(c => {
    const cell = c.html ? c.html(r) : esc(c.get ? c.get(r) : (r[c.key] ?? ""));
    return `<td${c.num ? ' class="num"' : ""}>${cell === "" || cell == null ? "–" : cell}</td>`;
  }).join("") + "</tr>").join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Label / value rows (.pr). Empty values are skipped; both sides are escaped. */
export function rowsHtml(pairs) {
  return pairs
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([l, v]) => `<div class="pr"><span class="pr-lbl">${esc(l)}</span><span class="pr-val">${esc(v)}</span></div>`)
    .join("");
}

/** A two-column block of label / value rows. */
export function grid2(pairs) {
  const rows = rowsHtml(pairs);
  return rows ? `<div class="grid2">${rows}</div>` : "";
}

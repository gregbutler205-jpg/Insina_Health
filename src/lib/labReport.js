// ── Lab ranges and the Lab Results Report (WO_DASHBOARD_POLISH_02 follow-up; DEC-060)
// Moved out of Tab05.jsx (content unchanged) so Reports can print the Lab
// Results Report without the Labs screen mounted. The range helpers are the
// ones the screen uses for its flags and charts (one source of truth); the
// report prints the most recent value per canonical analyte (A-04), grouped
// in the patient's category order, on the shared shell (DEC-061).
import { canonicalLabId, displayLabName } from "./labCanonical.js";
import { formatDateUS } from "./displaySafe.js";
import { esc, printReport } from "./printShell.js";

export const ALL_LAB_CATEGORIES = ["CBC / Hematology","Chemistry","Electrolytes","Endocrine","Immunosuppression","Infection / Serology","Lipid Panel","Liver Panel","Urinalysis","Other"];

export function getLabCatOrder() {
  try { return JSON.parse(localStorage.getItem("mi_lab_category_order") || "null") || ALL_LAB_CATEGORIES; }
  catch { return ALL_LAB_CATEGORIES; }
}

// Parse reference range strings into {low, high}
// Handles: "0.7-1.3", "70 - 100", "3.4–5.1", "3.4 to 5.1",
//          "0.70 - 1.30 mg/dL", "< 10.0", ">= 60", "150 - 400 K/µL"
export function parseRefRange(str) {
  if (!str) return { low: null, high: null };
  const s = String(str).trim();
  // Two-number range: "X - Y", "X–Y", "X to Y"
  const mRange = s.match(/(\d+\.?\d*)\s*(?:[-–—]|to)\s*(\d+\.?\d*)/i);
  if (mRange) return { low: parseFloat(mRange[1]), high: parseFloat(mRange[2]) };
  // Less-than upper bound only: "< X" or "<= X" or "Up to X"
  const mLt = s.match(/(?:<=?|up\s*to)\s*(\d+\.?\d*)/i);
  if (mLt) return { low: 0, high: parseFloat(mLt[1]) };
  // Greater-than lower bound only: "> X" or ">= X"
  const mGt = s.match(/>=?\s*(\d+\.?\d*)/i);
  if (mGt) return { low: parseFloat(mGt[1]), high: parseFloat(mGt[1]) * 2 };
  return { low: null, high: null };
}

// The range that determines in/out-of-range: the doctor's custom range when set,
// otherwise the lab report's printed reference range.
export function effectiveRange(lab, customRanges) {
  // A-04: tolerate custom ranges keyed by canonical id (new) or raw lowercased
  // name (pre-A-04), so grouping aliases doesn't drop an existing doctor range.
  const c = customRanges?.[canonicalLabId(lab.name)] || customRanges?.[(lab.name || "").toLowerCase().trim()];
  if (c && c.low != null && c.high != null) return { low: +c.low, high: +c.high, source: "doctor" };
  const r = parseRefRange(lab.refRange);
  return { low: r.low, high: r.high, source: "lab" };
}

// true = out of range, false = in range, null = no usable range/value.
// Falls back to the import-time flag only when no range is available at all.
export function labOutOfRange(lab, customRanges) {
  const { low, high } = effectiveRange(lab, customRanges);
  const val = parseFloat(lab.value);
  if (low === null || high === null || isNaN(val)) return lab.flag ?? null;
  return val < low || val > high;
}

/** Every recorded lab (vault-managed key, unreadable while locked). */
export function readLabs() {
  try { return JSON.parse(localStorage.getItem("mi_labs") || "[]"); } catch { return []; }
}

export function readCustomRanges() {
  try { return JSON.parse(localStorage.getItem("mi_lab_custom_ranges") || "{}"); } catch { return {}; }
}

/** Pure builder, exported so the report is testable without a window. */
export function buildLabReport(labs) {
  // Most recent entry per canonical analyte (A-04)
  const latest = {};
  (labs || []).forEach(l => {
    const key = canonicalLabId(l.name);
    if (!key) return;
    if (!latest[key] || new Date(l.date || 0) > new Date(latest[key].date || 0)) latest[key] = l;
  });
  const tests = Object.values(latest);
  const customRanges = readCustomRanges();

  const LAB_CAT_ORDER = getLabCatOrder();
  const grouped = {};
  tests.forEach(t => {
    const cat = t.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });
  Object.values(grouped).forEach(arr => arr.sort((a, b) => (a.name||"").localeCompare(b.name||"")));
  const orderedCats = [...LAB_CAT_ORDER, ...Object.keys(grouped).filter(c => !LAB_CAT_ORDER.includes(c))];

  const tableRows = orderedCats.filter(c => grouped[c]?.length).map(cat => {
    const rows = grouped[cat].map(t => {
      const oor = labOutOfRange(t, customRanges);
      const status = oor === true ? '<span class="flag">Flagged</span>' : '<span class="ok">Normal</span>';
      const cr = customRanges[canonicalLabId(t.name)] || customRanges[(t.name || "").toLowerCase().trim()];
      const rangeCell = (cr && cr.low != null && cr.high != null) ? `${esc(cr.low)}–${esc(cr.high)} <span class="muted">(your range)</span>` : esc(t.refRange || "–");
      return `<tr>
        <td>${esc(displayLabName(t.name) || "")}</td>
        <td class="num" style="font-weight:600">${esc(t.value || "–")}</td>
        <td>${esc(t.unit || "–")}</td>
        <td>${rangeCell}</td>
        <td>${esc(formatDateUS(t.date, "–"))}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");
    return `<tr><td colspan="6" class="cat-hdr">${esc(cat)}</td></tr>${rows}`;
  }).join("");

  return {
    title: "Lab Results Report",
    subtitle: `Most recent value per test  ·  ${tests.length} test${tests.length === 1 ? "" : "s"}`,
    body: tests.length
      ? `<table><thead><tr><th>Test Name</th><th class="num">Value</th><th>Unit</th><th>Ref Range</th><th>Date</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>`
      : `<div class="empty">No lab results recorded yet. Import a lab report or enter results on Import records.</div>`,
    disclaimer: "Values as imported. Reference ranges are the reporting lab's unless marked as your range.",
    extraCss: ".cat-hdr { font-family:Arial, sans-serif; font-size:8.5pt; letter-spacing:1px; text-transform:uppercase; color:#1e3a8a; border-left:3pt solid #1e3a8a; padding:4pt 8pt; border-bottom:none; }",
  };
}

export function printLabReport(labs) {
  printReport(buildLabReport(labs), { width: 1000, height: 750 });
}

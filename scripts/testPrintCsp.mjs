// ── v1.49.1: print windows must be CSP-safe ──────────────────────────────────
// The popup a report opens in inherits the app's CSP (script-src 'self', no
// 'unsafe-inline'), so ANY inline <script> or inline handler in generated
// print HTML is silently blocked in production — the dead Emergency Card
// Print button. This suite pins the fix: generated pages carry no inline
// scripts/handlers, every popup site wires through the opener-side
// wirePrintWindow, and the helper itself provides button + auto-print +
// image-wait. (Dev never catches this class: vite strips the CSP meta in dev.)
// Run: npm run test:print-csp

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => join(__dirname, "..", "src", p);

class Storage {
  constructor() { this._m = new Map(); }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(k, String(v)); }
  removeItem(k) { this._m.delete(k); }
  clear() { this._m.clear(); }
  key(i) { return [...this._m.keys()][i] ?? null; }
  get length() { return this._m.size; }
}
globalThis.Storage = Storage;
globalThis.localStorage = new Storage();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };

// ── 1. The emergency card's generated HTML is inline-script-free ─────────────
{
  localStorage.setItem("mi_profile_personal", JSON.stringify({ name: "Test Patient", dob: "1970-01-01", blood: "O+" }));
  localStorage.setItem("mi_readings", JSON.stringify([{ id: "w1", date: "2026-08-12", weight: "182" }]));
  localStorage.setItem("mi_conditions", JSON.stringify([
    { name: "Liver Transplant (2023)", status: "active" },
    { name: "Hypertension", status: "active" },
  ]));
  localStorage.setItem("mi_meds_full", JSON.stringify([
    { name: "Atorvastatin", dose: "20 mg", status: "active" },
    { name: "Tacrolimus", dose: "2 mg", status: "active" },
  ]));
  localStorage.setItem("mi_allergies", JSON.stringify([{ allergen: "Penicillin", reaction: "hives" }]));
  const { buildEmergencyHtml } = await import("../src/lib/printEmergency.js");
  const html = buildEmergencyHtml();
  ok(!/<script\b/i.test(html), "emergency card HTML contains NO <script> (CSP would block it)");
  ok(!/\son[a-z]+\s*=/i.test(html), "emergency card HTML contains NO inline event handlers");
  ok(html.includes('class="printbtn"'), "emergency card still ships its visible Print button (wired by the opener)");
  ok(html.includes("182 lbs"), "emergency card carries the current Vitals weight");

  // v1.49.2 hierarchy (Greg): banner > allergies > demoted blood type.
  ok(html.includes("LIVER TRANSPLANT RECIPIENT ON IMMUNOSUPPRESSION"),
     "banner derives transplant + immunosuppression from the record");
  ok(html.includes("ALLERGIES: Penicillin"), "allergies strip sits under the banner");
  ok(!html.includes("bloodbadge"), "the enlarged red blood-type badge is gone");
  ok(html.includes("Blood Type O+"), "blood type demoted into the ID line, still present");
  ok(html.indexOf("Tacrolimus") < html.indexOf("Atorvastatin"),
     "immunosuppressants print before other medications");
  ok(html.indexOf('class="alertbanner"') < html.indexOf("Active Medications"),
     "banner precedes the sections");

  // v1.49.3: print output must not depend on background colors (printers drop
  // them by default — the banner printed as faint gray), and age is computed.
  const printBlock = html.slice(html.indexOf("@media print"), html.indexOf("</style>"));
  ok(printBlock.includes(".alertbanner { background:transparent; color:#dc2626; border:2.5px solid #dc2626; }"),
     "in print, the banner is red TYPE with a red border — no background dependence");
  ok(printBlock.includes(".allergyline { background:transparent; }"),
     "in print, the allergies strip drops its background too");
  const { ageFromDob } = await import("../src/store.js");
  ok(html.includes(`Age: ${ageFromDob("1970-01-01")}`), "emergency card age is calculated from the seeded DOB");

  // No transplant / no immuno meds → no synthetic banner, honest allergies line.
  localStorage.setItem("mi_conditions", JSON.stringify([{ name: "Hypertension", status: "active" }]));
  localStorage.setItem("mi_meds_full", JSON.stringify([{ name: "Atorvastatin", status: "active" }]));
  localStorage.setItem("mi_allergies", JSON.stringify([]));
  const plain = buildEmergencyHtml();
  ok(!plain.includes('class="alertbanner"'), "no banner is fabricated for a record without transplant/immunosuppression");
  ok(plain.includes("No allergies recorded"), "empty allergy list prints 'No allergies recorded' (never claims NKDA)");
}

// ── 2. No popup print generator ships inline print triggers ──────────────────
const POPUP_SITES = [
  // App.jsx left this list with WO_DASHBOARD_FEED_01: the Upcoming Refills
  // printout went with the hot-button row (DEC-051), and Reports (DEC-057) lists
  // the four remaining outputs; the Medication Report carries refill dates.
  // WO_DASHBOARD_POLISH_02 (DEC-061): every shell report opens through
  // lib/printShell.js; the three reviewed layouts keep their own popups.
  ["PrintableConsent.jsx",    SRC("components/PrintableConsent.jsx")],
  ["Tab11.jsx",               SRC("components/tabs/Tab11.jsx")],
  ["printEmergency.js",       SRC("lib/printEmergency.js")],
  ["printShell.js",           SRC("lib/printShell.js")],
];
for (const [name, path] of POPUP_SITES) {
  const src = readFileSync(path, "utf8");
  ok(!src.includes("window.onload = function(){ window.print"), `${name}: inline auto-print script removed`);
  ok(!src.includes('onclick="window.print'), `${name}: inline print onclick removed`);
}

// ── 3. Every popup site is wired through the opener ──────────────────────────
for (const [name, path] of POPUP_SITES) {
  const src = readFileSync(path, "utf8");
  ok(src.includes("wirePrintWindow(win)"), `${name}: wirePrintWindow wired`);
}
// The shell is the ONLY popup site for reports: no screen or report module
// opens its own window any more (one CSP wiring to keep right), and no screen
// prints the dark UI with window.print().
for (const rel of ["components/tabs/Tab02.jsx", "components/tabs/Tab04.jsx", "components/tabs/Tab05.jsx", "components/tabs/Tab14.jsx",
                   "lib/printMedicationList.js", "lib/printProfile.js", "lib/printReports.js"]) {
  const src = readFileSync(SRC(rel), "utf8");
  ok(!src.includes("window.open(") && !src.includes("document.write("), `${rel}: no popup of its own (prints through printShell)`);
}
for (const rel of ["Tab02", "Tab04", "Tab05", "Tab06", "Tab09", "Tab10", "Tab12", "Tab14", "Tab15", "Tab16", "Tab17"]) {
  const src = readFileSync(SRC(`components/tabs/${rel}.jsx`), "utf8");
  ok(!src.includes("window.print()"), `${rel}: no window.print() of the screen itself`);
}

// ── 4. The helper itself ─────────────────────────────────────────────────────
{
  const helper = readFileSync(SRC("lib/printWindow.js"), "utf8");
  ok(helper.includes('querySelectorAll(".printbtn,[data-print]")'), "helper wires existing print buttons");
  ok(helper.includes("insina-printbtn"), "helper injects a Print / Save-as-PDF button when a page has none");
  ok(helper.includes("@media print{.insina-printbtn{display:none}}"), "injected button hides in the printed output");
  ok(helper.includes("every(img => img.complete)"), "auto-print waits for images (logo present in the PDF)");
  const helperCode = helper.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  ok(!helperCode.includes("document.write"), "helper never writes markup with scripts — DOM APIs only (comments excluded)");
  const { wirePrintWindow } = await import("../src/lib/printWindow.js");
  ok(typeof wirePrintWindow === "function", "helper exports wirePrintWindow");
  wirePrintWindow(null); // must be a safe no-op for a blocked popup
  ok(true, "wirePrintWindow(null) is a safe no-op (popup blocked)");
}

console.log(`\n${pass} passed, ${fail} failed (print-csp)`);
assert.equal(fail, 0);

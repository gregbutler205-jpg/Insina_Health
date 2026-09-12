// ── Dashboard feed (WO_DASHBOARD_FEED_01; DEC-051 to DEC-055) ────────────────
// The "Your updates" feed is assembled from the record by src/components/
// dashboard/feed.js: flags (advisory events and tripwire urgent flags), one
// pending-review card, out-of-range result sets, then appointments and refills
// by date. Flags are acknowledged (a record event), never dismissed; every
// other card can be dismissed (a display preference that lifts when the item
// changes). The emergency strip follows unacknowledged emergency-tier flags.
// Run: npm run test:dashboard-feed

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
globalThis.sessionStorage = new Storage();
globalThis.window = globalThis; // feed.js dispatches a DOM event after a write; a no-op here
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class Event { constructor(t) { this.type = t; } };

const feed = await import("../src/components/dashboard/feed.js");
const {
  buildFeed, dismissFeedItem, acknowledgeFlag, readAcknowledgments, readDismissals,
  rosterFromCareTeam, currentVitals, passiveEvents, bellUnseenCount, markBellSeen,
  ACKS_KEY, DISMISSALS_KEY, APPT_WINDOW_DAYS, REFILL_WINDOW_DAYS,
} = feed;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS: " + m); } else { fail++; console.log("FAIL: " + m); } };
const NOW = new Date("2026-09-07T09:00:00");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (days) => { const d = new Date(NOW); d.setDate(d.getDate() + days); return iso(d); };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function seedBusy() {
  localStorage.clear();
  set("mi_advisory_events", [
    { id: "adv_today", ts: NOW.toISOString(), metric: "bp_s", value: 172, unit: "mmHg", tier: "TODAY", source: "manual", verification: "patient-entered", tableVersion: "1.1.0-draft", templateVersion: "1.1.0", dismissedAt: null, rejectedAt: null },
    { id: "adv_emerg", ts: NOW.toISOString(), metric: "potassium", value: 6.4, unit: "mmol/L", tier: "EMERGENCY", source: "manual", verification: "patient-entered", tableVersion: "1.1.0-draft", templateVersion: "1.1.0", dismissedAt: null, rejectedAt: null },
    { id: "adv_old", ts: "2026-06-01T09:00:00.000Z", metric: "hr", value: 150, unit: "bpm", tier: "TODAY", source: "manual", verification: "patient-entered", dismissedAt: null, rejectedAt: null },
    { id: "adv_rejected", ts: NOW.toISOString(), metric: "temp", value: 104, unit: "°F", tier: "EMERGENCY", source: "staged", verification: "patient-rejected", rejectedAt: NOW.toISOString() },
  ]);
  set("mi_lab_archive", [{ id: "doc1", title: "MyChart labs", rows: [{ id: "r1", state: "pending" }, { id: "r2", state: "pending" }, { id: "r3", state: "promoted" }] }]);
  set("mi_onboarding_staged", { documents: [], items: [{ id: "s1", category: "medication", status: "staged" }, { id: "s2", category: "lab", status: "deferred" }] });
  set("mi_labs", [
    { name: "Platelets", value: 142, unit: "K/uL", refRange: "150-450", flag: true, date: plus(-5) },
    { name: "Hemoglobin", value: 14.1, unit: "g/dL", refRange: "13.5-17.5", flag: false, date: plus(-5) },
    { name: "Sodium", value: 139, unit: "mmol/L", refRange: "135-145", flag: false, date: plus(-40) },
    { name: "Tacrolimus", value: 3.1, unit: "ng/mL", refRange: "5-15", flag: true, date: plus(-200) },
  ]);
  set("mi_appointments", [
    { id: 1, title: "Transplant clinic", provider: "Dr. Alvarez", date: plus(8), time: "10:00 AM", status: "upcoming" },
    { id: 2, title: "Bone density test", provider: "", facility: "Hancock imaging", date: plus(14), time: "2:00 PM", status: "upcoming" },
    { id: 3, title: "Dermatology", provider: "Pine Belt", date: plus(29), time: "1:30 PM", status: "upcoming" },
    { id: 4, title: "Old visit", provider: "Dr. Chen", date: plus(-3), status: "completed" },
  ]);
  set("mi_meds_full", [
    { id: 11, name: "Magnesium oxide", refillDate: plus(1), status: "active", pharmacy: "Walgreens" },
    { id: 12, name: "Tacrolimus", refillDate: plus(23), status: "active" },
    { id: 13, name: "Prednisone", refillDate: plus(2), status: "inactive" },
  ]);
  set("mi_care_team", [
    { name: "Dr. Sarah Chen", role: "Hepatologist", phone: "(504)555-0100" },
    { name: "Nurse Amy", role: "Transplant Coordinator", phone: "(504)555-0142", phone24: "(504)555-0199" },
    { name: "D. Scoggin", role: "FNP", phone: "(601)555-0177", pcp: true },
    { name: "Someone", role: "Dentist" },
  ]);
}

// ── ordering and eligibility (DEC-052) ───────────────────────────────────────
{
  seedBusy();
  const f = buildFeed(NOW);
  const kinds = f.items.map(i => i.kind);
  ok(kinds.slice(0, 2).every(k => k === "flag") && kinds[2] === "review" && kinds[3] === "result",
    `flags, then review, then results lead the feed (got ${kinds.join(",")})`);
  ok(kinds.slice(4).join(",") === "refill,appt,appt", "appointments and refills follow, interleaved by date");
  ok(!f.items.some(i => i.flagId === "adv_old"), "an advisory older than the 14-day window is not current");
  ok(!f.items.some(i => i.flagId === "adv_rejected"), "a rejected staged value never fired and is not a flag");
  ok(f.items.filter(i => i.kind === "result").length === 1, "only the recent out-of-range set is a result card (200-day-old flag falls outside the 90-day window)");
  ok(!f.items.some(i => i.kind === "appt" && i.title === "Dermatology"), `an appointment beyond ${APPT_WINDOW_DAYS} days is not listed`);
  ok(!f.items.some(i => i.kind === "refill" && i.title.startsWith("Tacrolimus")), `a refill beyond ${REFILL_WINDOW_DAYS} days is not listed`);
  ok(!f.items.some(i => i.title.startsWith("Prednisone")), "inactive medications never produce refill cards");
  ok(f.attention === 4, `the attention count covers flags, review, and results only (got ${f.attention})`);
  ok(f.refillsDue === 1 && f.appointmentsSoon === 2, "tile badges: refills within 7 days and appointments within 14 days");
  ok(f.emergency.length === 1 && f.emergency[0].flagId === "adv_emerg", "the strip follows the unacknowledged emergency-tier flag only");
  const review = f.items.find(i => i.kind === "review");
  ok(review.action === "Review 4 items" && review.body.includes("1 is a medication or allergy"), "review card counts archive rows and staged items");
  const result = f.items.find(i => i.kind === "result");
  ok(result.title === "Platelets is out of range" && result.body.includes("Reference range 150-450") && result.body.includes("Everything else on the panel was in range."),
    "result card reads from the flagged row and its panel");
}

// ── flag text is the engine's, verbatim ──────────────────────────────────────
{
  seedBusy();
  const f = buildFeed(NOW);
  const today = f.items.find(i => i.flagId === "adv_today");
  ok(today.title.startsWith("Your systolic blood pressure reading of 172 mmHg meets Insina Health's same-day alert threshold."),
    "advisory flag title is the template's first sentence, untouched");
  ok(today.body.includes("Contact your transplant coordinator today: Nurse Amy, (504)555-0199"), "advisory body carries the coordinator line from the record");
  const emerg = f.items.find(i => i.flagId === "adv_emerg");
  ok(emerg.text.includes("Call 911 now"), "emergency flag text is the engine's 911 text");
  ok(today.action === "View", "the engine provides no action text, so the card action is View");
}

// ── acknowledge versus dismiss (DEC-053) ─────────────────────────────────────
{
  seedBusy();
  const before = buildFeed(NOW);
  const flag = before.items.find(i => i.kind === "flag");
  ok(dismissFeedItem(flag) === false && buildFeed(NOW).items.some(i => i.id === flag.id), "a flag cannot be dismissed");
  const entry = acknowledgeFlag(flag.flagId, "patient");
  ok(entry.flagId === flag.flagId && typeof entry.acknowledgedAt === "string" && entry.recordedBy === "patient", "acknowledging writes { flagId, acknowledgedAt, recordedBy }");
  const stored = JSON.parse(localStorage.getItem(ACKS_KEY));
  ok(Array.isArray(stored) && stored.length === 1 && stored[0].flagId === flag.flagId, `the record event lives under ${ACKS_KEY}`);
  const after = buildFeed(NOW);
  ok(!after.items.some(i => i.id === flag.id), "an acknowledged flag leaves the feed");
  ok(JSON.stringify(JSON.parse(localStorage.getItem("mi_advisory_events"))[0]).includes('"dismissedAt":null'), "the engine's own event is untouched by acknowledgment");
  acknowledgeFlag("adv_emerg");
  ok(buildFeed(NOW).emergency.length === 0, "acknowledging the emergency flag clears the strip");

  const result = after.items.find(i => i.kind === "result");
  dismissFeedItem(result);
  ok(!buildFeed(NOW).items.some(i => i.id === result.id), "a dismissed result card is hidden");
  ok(JSON.parse(localStorage.getItem("mi_labs")).filter(l => l.flag).length === 2, "dismissing never alters the lab");
  const labs = JSON.parse(localStorage.getItem("mi_labs"));
  labs[1].flag = true; set("mi_labs", labs); // the set changed: two flagged now
  ok(buildFeed(NOW).items.some(i => i.id === result.id && i.title === "2 results are out of range"), "the card returns when the underlying set changes");
  const appt = buildFeed(NOW).items.find(i => i.kind === "appt");
  dismissFeedItem(appt);
  ok(!buildFeed(NOW).items.some(i => i.id === appt.id), "a dated card can be dismissed");
  ok(appt.action === "View appointment" && appt.nav === "appointments" && appt.select?.category === "appointments",
    "an appointment card opens the appointment (Greg, 2026-09-11), not consultation prep");
  {
    const dash = readFileSync(new URL("../src/components/dashboard/Dashboard.jsx", import.meta.url), "utf8");
    ok(!dash.includes('label="Prepare for this visit"'), "the feed card carries no Prepare for this visit launcher");
  }
  const appts = JSON.parse(localStorage.getItem("mi_appointments"));
  ok(appts.find(a => a.id === 1).status === "upcoming", "dismissing never alters the appointment");
  ok(readDismissals().every(d => d.id && d.fingerprint && d.dismissedAt), `dismissals under ${DISMISSALS_KEY} carry id, fingerprint, and timestamp`);
}

// ── empty state and badges at zero ───────────────────────────────────────────
{
  localStorage.clear();
  const f = buildFeed(NOW);
  ok(f.items.length === 0 && f.attention === 0 && f.emergency.length === 0 && f.refillsDue === 0 && f.appointmentsSoon === 0,
    "an empty record yields an empty feed and zero badges");
}

// ── roster (DEC-055) ─────────────────────────────────────────────────────────
{
  seedBusy();
  const rows = rosterFromCareTeam(JSON.parse(localStorage.getItem("mi_care_team")));
  ok(rows[0].role === "Transplant coordinator" && rows[0].name === "Nurse Amy" && rows[0].display === "(504)555-0142", "coordinator by role text, office number");
  ok(rows[1].role === "After hours line" && rows[1].display === "(504)555-0199", "after-hours from the 24-hour line");
  ok(rows[2].role === "Primary care" && rows[2].name === "D. Scoggin", "primary care from the pcp flag");
  ok(rows.length === 4 && rows[3].name === "Dr. Sarah Chen" && !rows.some(r => r.name === "Someone"), "remaining slot filled by a member with a phone; no phone, no row");
  ok(rows.every(r => /^[\d+]+$/.test(r.tel)), "tel: links are digits only");
  ok(rosterFromCareTeam([]).length === 0, "no care team, no rows");
}

// ── vitals and passive events ────────────────────────────────────────────────
{
  const readings = [
    { date: plus(-1), bp_s: 143, bp_d: 78, weight: 218.1, temp: 98.2, ts: new Date(NOW.getTime() - 86400000).toISOString() },
    { date: plus(-9), bp_s: 120, bp_d: 70, weight: 219 },
  ];
  const v = currentVitals(readings);
  ok(v.map(x => x.id).join(",") === "bp,weight,temp", "three vitals only: blood pressure, weight, temperature");
  ok(v[0].value === "143/78" && v[0].flagged === true, "BP 143/78 uses the existing high rule");
  ok(v[1].value === "218.1" && v[1].flagged === false && v[2].value === "98.2" && v[2].flagged === false, "weight and temperature carry the latest values");
  localStorage.clear();
  set("mi_last_weekly_backup", NOW.toISOString());
  set("mi_labs", [{ name: "Sodium", value: 139, flag: false, date: plus(-2) }, { name: "Potassium", value: 6.4, flag: true, date: plus(-3) }]);
  const ev = passiveEvents(readings, NOW);
  ok(ev.some(e => e.text === "Backed up to Google Drive") && ev.some(e => e.text.startsWith("Vitals logged: BP 143/78, weight 218.1 lbs")), "bell lists backups and vitals logged");
  ok(ev.some(e => e.text.startsWith("Results from") && e.text.includes("all 1 value in range")) && !ev.some(e => e.text.includes("Potassium")),
    "bell lists in-range result sets only; flagged sets belong to the feed");
  ok(ev[0].time >= ev[ev.length - 1].time, "newest first");
  ok(bellUnseenCount(ev) === ev.length, "everything is unseen before the bell is opened");
  markBellSeen(NOW.getTime());
  ok(bellUnseenCount(ev) === 0, "opening the bell clears the count");
}

// ── structural pins: the dashboard is wired to the feed, not the old status wall ─
{
  const app = readFileSync(SRC("App.jsx"), "utf8");
  ok(/from ["']\.\/components\/dashboard\/Dashboard\.jsx["']/.test(app) && app.includes("<Dashboard"), "App.jsx renders the feed dashboard");
  ok(!app.includes("DashboardHotButtons") && !app.includes("Featured Lab Results") && !app.includes("generateAutoAlerts"), "the hot-button row, featured labs, and auto-alert wall are gone");
  const dash = readFileSync(SRC("components/dashboard/Dashboard.jsx"), "utf8");
  ok(dash.includes('aria-label="Dismiss"') && dash.includes("Acknowledge") && dash.includes("Nothing new. Your record is up to date."), "cards carry Dismiss (44px), flags carry Acknowledge, empty state copy present");
  ok(dash.includes("Nothing needs your attention today.") && dash.includes("Last updated"), "greeting row copy");
  ok(dash.includes('"Your updates"') || dash.includes(">Your updates<"), "the column is titled Your updates");
  ok(dash.includes("Asks questions about your record. It never tells you what to do."), "Insina AI panel subtitle per 4.8");
  const side = readFileSync(SRC("components/AppSidebar.jsx"), "utf8");
  ok(/key: "records".*defaultCollapsed: true/.test(side) && side.includes('label: "Tools"'), "sidebar: Records defaults collapsed, Tools group exists");
  ok(!side.includes("All systems nominal") && !side.includes('label: "Settings & Backup"'), "sidebar: status footer and Settings & Backup row removed (avatar menu owns them)");
  ok(side.includes('<AIMark variant="simple" size={14} />'), "the AI row still carries the Insina AI mark (DEC-P47)");
}

// ── WO_DASHBOARD_POLISH_02 pins (DEC-058, DEC-059, DEC-062) ───────────────────
{
  const side = readFileSync(SRC("components/AppSidebar.jsx"), "utf8");
  ok(side.includes('"shield_logo.png"') && side.includes("<img src={SHIELD}"), "rail shows the shield mark, not the wordmark (DEC-058)");
  ok(side.includes("function RailGroup") && side.includes("if (rail && !group.fixed)") && /GROUP_ICONS = \{ records: \w+, tools: \w+ \}/.test(side),
     "rail: one icon each for Records and Tools, opening a flyout (DEC-058)");
  ok(side.includes('aria-haspopup="true"') && side.includes('className="nav-flyout"'), "rail flyout is announced and closable");
  const top = readFileSync(SRC("components/TopBar.jsx"), "utf8");
  ok(top.includes("{!onDashboard && (") && top.includes('aria-label="Home"') && top.includes("onClick={toggleNavRail}"), "top bar: collapse toggle everywhere, Home on every screen except the dashboard (DEC-059)");
  for (const f of ["Tab04.jsx", "Tab05.jsx", "Tab06.jsx", "Tab07.jsx"]) {
    const src = readFileSync(SRC("components/tabs/" + f), "utf8");
    ok(src.includes("<TopBar activeNav={activeNav} onNav={handleNav} />") && !src.includes('title="Home"'), `${f}: renders the shared top bar instead of its own header`);
  }
  ok((readFileSync(SRC("App.jsx"), "utf8").match(/<TopBar /g) || []).length === 2, "App.jsx renders the shared top bar for the shell and for Insina AI");
  const care = readFileSync(SRC("components/tabs/Tab08.jsx"), "utf8");
  const refBlock = care.slice(care.indexOf("const REFERENCE = ["), care.indexOf("function SL("));
  ok((refBlock.match(/disclaimer:"This list may not include every /g) || []).length === 6 && care.includes("{sec.disclaimer && ("),
     "Reference: every section opens with a 'may not include every ...' line (DEC-062)");
}

console.log(`\n${pass} passed, ${fail} failed (dashboard-feed)`);
assert.equal(fail, 0);
